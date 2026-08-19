# Phase 4: Remaining Settings + PWA — Design

## Purpose

Phase 4 delivers two of the master rewrite spec's must-have items: "Synced
cross-device settings (language, hide-distant threshold, notifications)" and
"Installable PWA + offline app shell." Phase 2 already built the settings
infrastructure (a `users/{uid}` root doc, `useSettings`/`updateXxx` pattern)
for one field (`lowStockThreshold`). This phase extends that same doc with
two more synced settings — language and a hide-distant-items expiry
threshold — wires their actual behavior into the app (a language switcher
that changes the rendered UI, and expiry-distance filtering of the item
list), and makes the app installable with an offline-capable app shell.

## Scope

**In scope:**
- `language` and `hideDistantThresholdMonths` added to the existing
  `users/{uid}` settings doc, with UI in the Settings tab.
- Cross-device language propagation: switching language on one device
  updates the rendered UI on every other signed-in device via the existing
  `onSnapshot` sync, not just on the device that changed it.
- Expiry-distance filtering of the pantry item list, driven by
  `hideDistantThresholdMonths`.
- PWA installability: web app manifest, icons (including an iOS
  `apple-touch-icon`), and Workbox-based precaching of the built app shell
  (JS/CSS/HTML/icons) via `vite-plugin-pwa`.

**Out of scope (deferred, not dropped):**
- `notificationsEnabled` / `notifyDaysBeforeExpiry` and `fcm_tokens` —
  Phase 6's job. These settings are meaningless without the push
  infrastructure that reads them, so bundling them here would just leave
  unused fields sitting in the schema.
- A separate `hideDistantEnabled` on/off flag, and v1's per-category,
  session-only "show hidden items" override button. v2 collapses this to a
  single synced threshold number — hiding is always active; a large
  threshold (e.g. 99) is how a user effectively turns it off. Matches the
  master rewrite spec's data model, which lists only
  `hideDistantThresholdMonths`, not a separate enable flag.
- Firestore offline data persistence (`persistentLocalCache`). The PWA
  scope here is the "shell works offline, data needs network" model
  already stated in the master spec — the app shell (static assets)
  precaches; live pantry data still requires a network round-trip, same as
  today.
- Localizing the PWA manifest itself (per-locale `name`/`short_name`). A
  single static manifest ships, matching v1's single-locale manifest;
  revisit only if this specific gap is ever reported as a real problem.

## Data model

`src/features/settings/schema.ts`'s `settingsDocSchema` (Firestore document
shape) gains two fields:

```typescript
{
  lowStockThreshold: number,           // existing (Phase 2)
  language: "pt-br" | "en-us",         // NEW, default "pt-br"
  hideDistantThresholdMonths: number,  // NEW, default 3
}
```

Same `users/{uid}` document, same `useSettings`/`parseSettingsDoc` pattern
established in Phase 2 — no new collection, no new hook. Both new fields
get a `.catch()` fallback to their default in the Zod schema, matching the
existing defense-in-depth pattern for `lowStockThreshold`: a live
`onSnapshot` listener must never get permanently stuck on `loading: true`
because of malformed data already sitting in Firestore (this is exactly
the C2-class regression Phase 2's final review caught and fixed for the
existing field).

`ensureSettingsDoc` (in `useSettings.ts`) seeds all three fields — not just
the threshold — the first time a user's settings doc is created.

## Language setting

- `Settings` interface gains `language: "pt-br" | "en-us"`.
- A new `updateLanguage(uid, language)` write function in
  `src/features/settings/firestoreWrites.ts`, alongside the existing
  `updateLowStockThreshold`.
- UI: a control (`Select` or `Radio.Group` — verified against the current
  antd API during implementation) in `SettingsPane.tsx`, with two options,
  "Português" / "English". **Its value is bound to `settings.language`, not
  to `i18n.language`** — this deliberately sidesteps a documented gotcha in
  `CLAUDE.md`: i18next canonicalizes language codes to BCP-47 casing
  (`"pt-br"` → `"pt-BR"`) internally when resolving the active language,
  even though the stored/passed-in value stays lowercase. Comparing
  against a lowercase literal elsewhere would silently break; reading from
  `settings.language` (the Firestore-synced source of truth, always
  lowercase) avoids the comparison entirely. On change: write to Firestore,
  then call `i18n.changeLanguage(value)` to apply it immediately on the
  device that made the change.
- **Cross-device propagation**: when `settings.language` changes via
  `onSnapshot` — e.g. the other household phone changed it — every signed-in
  device must also call `i18n.changeLanguage()` to actually re-render in
  the new language, not just receive the updated stored value. This effect
  lives in `AppRoute` (the one place that already holds both `settings`
  and renders the whole app tree), as a `useEffect` keyed on
  `settings.language`.
- No change to `src/lib/i18n.ts`'s existing `LanguageDetector`/`fallbackLng`
  setup — that logic only matters pre-login (the `LoginPage`, before any
  settings doc exists to read). Once signed in, `settings.language` is the
  single source of truth and overrides whatever the detector guessed.

## Hide-distant-items filtering

A new pure function joins the other per-item-list utilities already in
`src/features/pantry-items/sortItems.ts` (`sortItems`,
`getExpiryWarningColor`):

```typescript
export function filterDistantItems(
  items: PantryItem[],
  thresholdMonths: number,
  now: Date,
): PantryItem[] {
  const cutoff = dayjs(now).add(thresholdMonths, "month").toDate();
  return items.filter((item) => item.expiringDate.getTime() <= cutoff.getTime());
}
```

Uses `dayjs` (already a direct dependency, already used in
`AddItemModal.tsx` for `DatePicker` value conversion) for month
arithmetic — no new date library added. Takes an injectable `now: Date`,
matching `getExpiryWarningColor`'s existing convention, for testability.

A new `updateHideDistantThresholdMonths(uid, months)` write function joins
`updateLanguage`/`updateLowStockThreshold` in
`src/features/settings/firestoreWrites.ts`, wired to a new `InputNumber` in
`SettingsPane.tsx` (same pattern as the existing low-stock-threshold
control).

`ItemList.tsx` gets a new `hideDistantThresholdMonths: number` prop (same
pattern as the existing `lowStockThreshold` prop, sourced from
`AppRoute`'s `settings`), applied as one more filter step alongside the
existing opened/unopened filter — **only in the normal list view, not
Shopping Mode**. Shopping-list entries represent recurring item *types*
(joined against summed pantry quantities), not individual dated pantry
instances, so "distance from expiry" doesn't apply to them.

## PWA: installability + offline app shell

- Add `vite-plugin-pwa` as a dev dependency, configured in `vite.config.ts`
  with `registerType: 'autoUpdate'` — the cached shell silently updates on
  new deploys, no "reload to update" prompt UI. Appropriate for a
  two-person household app; building update-prompt UX is unnecessary
  complexity for this audience.
- Manifest (generated by the plugin's config, not a hand-written static
  file): `name: "Produtos a vencer"`, `short_name: "Produtos a vencer"`,
  `theme_color: "#6e6197"`, `background_color: "#212529"`,
  `display: "standalone"`, `start_url: "/"` — ported directly from v1's
  `expiring_products.webmanifest` for visual continuity (same household
  app, same identity).
- Icons: generate `public/pwa-192x192.png` and `public/pwa-512x512.png`
  from v1's existing 512×512 `assets/img/favicon.png` (found in the local
  v1 checkout at `/home/gca/repos/expiring_products/`) using `imagemagick`
  (`convert`, already installed on the dev machine). Also generate a
  180×180 `public/apple-touch-icon.png` and add its
  `<link rel="apple-touch-icon">` tag to `index.html` — the household's
  Phase 6 push-notification design explicitly targets "both phones,"
  confirming iOS is a real target platform, not a hypothetical one, so a
  proper iOS home-screen icon is worth the small extra step.
- Workbox (via the plugin) precaches the Vite build output: JS, CSS, HTML,
  the new icons. This is the "shell works offline, data needs network"
  model already named in the master spec — no Firestore offline
  persistence is added (see Scope).
- `public/favicon.svg` (the current Vite placeholder, unused by anything
  else) is removed in favor of the generated icon set, so the project ships
  one consistent icon identity instead of two unrelated ones.

## Testing

- `schema.test.ts` — extend for `language`/`hideDistantThresholdMonths`
  defaults and `.catch()` fallback behavior on malformed stored values
  (mirrors the existing `lowStockThreshold` coverage from Phase 2's C2
  regression fix).
- `useSettings.test.tsx` — extend: bootstrap now seeds all three fields,
  not just the threshold.
- `firestoreWrites.test.ts` — add tests for the new `updateLanguage` and
  `updateHideDistantThresholdMonths` write functions.
- `sortItems.test.ts` — add cases for `filterDistantItems` with a fixed
  `now` fixture (an item just inside the threshold stays, one just outside
  is dropped).
- `SettingsPane.test.tsx` — extend: selecting a language calls both the
  write function and `i18n.changeLanguage`.
- `app-route.test.tsx` (**new** — no test file exists for `AppRoute` yet)
  — covers the one genuinely new piece of logic living there: when
  `settings.language` changes, `i18n.changeLanguage` is called with the
  new value.
- e2e: extend `core-loop.spec.ts` with (1) a hide-distant-items case — add
  one item inside the threshold and one beyond it, confirm only the near
  one renders — and (2) a language-switch case — switch to English
  mid-session, confirm a known label's text changes (e.g. "Nome" → "Name").
- PWA installability itself (the actual browser "Add to Home Screen" flow)
  is not meaningfully Playwright-scriptable. It gets a manual verification
  step in the implementation plan instead: `npm run build && npm run
  preview`, then check Chrome DevTools → Application → Manifest (or run a
  Lighthouse PWA audit) to confirm the manifest and service worker are
  correctly generated and installable.

## Global constraints for implementation

- Both new settings fields live on the existing `users/{uid}` document —
  no new Firestore collection, no new security rule (the existing
  `users/{userId}/{document=**}` rule already covers this doc, confirmed
  under `rules_version = '2'`'s zero-or-more-segment semantics in Phase 2).
- `filterDistantItems` never runs in Shopping Mode.
- The language control's value binds to `settings.language`, never to
  `i18n.language` directly — see the casing gotcha documented above and in
  `CLAUDE.md`.
- No Firestore offline persistence (`persistentLocalCache`) is added as
  part of this phase — that's a separate, unscoped decision with its own
  trade-offs.
- `notificationsEnabled` / `notifyDaysBeforeExpiry` / `fcm_tokens` are not
  touched in this phase — they belong entirely to Phase 6.
