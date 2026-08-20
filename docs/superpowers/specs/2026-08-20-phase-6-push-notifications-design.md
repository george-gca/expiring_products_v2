# Phase 6: Push Notifications — Design

## Purpose

Phase 6 delivers the master rewrite spec's "server-side daily push
notifications for items nearing expiry" — the design goal called out
explicitly as a *new* capability, not a port of v1's client-side-only
notification code (which only fires while the app is open, and so never
addresses "we forgot the app exists," the core adoption failure this
whole rebuild targets).

The master rewrite spec already picked the delivery architecture
(GitHub Actions as scheduler/compute, Firebase Cloud Messaging HTTP v1 for
delivery, `fcm_tokens/{deviceId}` for per-device registration) and flagged
several open items this design resolves: the notification send time,
dedup logic, and how a second service worker coexists with the PWA's
existing one.

**Deployment-scope decision:** this app has no GitHub remote and is not
deployed anywhere yet (that's Phase 7's job). Real push delivery needs a
live HTTPS origin (for the service worker) and a live GitHub Actions secret
talking to the real Firebase project — neither exists yet. Phase 6
therefore builds and tests the full plumbing — schema, client permission
UI, the combined service worker, the digest script's logic — against the
Firestore emulator and direct script invocation. Actually enabling a live
scheduled run (creating the service-account credential, adding the GitHub
remote and secret) is explicitly deferred to Phase 7.

## Scope

**In scope:**
- `users/{uid}` settings gain `notificationsEnabled`, `notifyDaysBeforeExpiry`,
  `notifyHourLocal`, `notifyTimezone`.
- `users/{uid}/fcm_tokens/{deviceId}` — per-device FCM token registration.
- `items/{itemId}` gains `lastNotifiedAt` — dedup state, server-written only.
- Settings UI: a `NotificationSection.tsx` (own file, extracted the same
  way `BackupSection` was) with the enable switch and the two
  number inputs, wired to request `Notification` permission and register/
  deregister this device's FCM token.
- A single combined service worker (Workbox precaching + Firebase
  Messaging background handling) replacing Phase 4's `generateSW`-only
  setup.
- A GitHub Actions workflow (`on: schedule`, hourly) plus a Node.js script
  (Firebase Admin SDK) implementing the dedup + digest + send logic,
  committed but not live.

**Out of scope (deferred, not dropped):**
- Creating the real Firebase service-account credential and storing it as
  a GitHub Actions secret.
- Adding a GitHub remote to this repo and actually enabling/observing a
  live scheduled run.
- Any UI for browsing, listing, or manually revoking registered devices'
  tokens beyond the current device's own enable/disable switch.
- Per-item or per-category notification preferences — this phase is a
  single household-wide digest, matching the master spec's "daily digest"
  framing.

## Data model

`users/{uid}` (existing root doc, extended):

```typescript
{
  // ...existing language, hideDistantThresholdMonths...
  notificationsEnabled: boolean,       // default false — household-level kill switch
  notifyDaysBeforeExpiry: number,      // default 3
  notifyHourLocal: number,             // 0-23, default 8
  notifyTimezone: string,              // IANA tz, e.g. "America/Sao_Paulo"
}
```

`notifyTimezone` is captured automatically from
`Intl.DateTimeFormat().resolvedOptions().timeZone` whenever notifications
are enabled or the settings are re-saved — no manual timezone picker in
the UI. There's no per-tenant dynamic cron in GitHub Actions, so honoring
a user-chosen send time means the workflow runs hourly and the script
itself decides whether this is the right hour (see below).

New collection, `users/{uid}/fcm_tokens/{deviceId}`:

```typescript
{
  token: string,        // FCM registration token
  updatedAt: Timestamp,
}
```

`deviceId` is a `crypto.randomUUID()` generated once per browser and
cached in `localStorage` — stable across sessions on the same device, but
distinct per device, since the shared household login means multiple
devices must be individually addressable (see the master spec's data
model section).

`items/{itemId}` gains one optional field:

```typescript
lastNotifiedAt: Timestamp | null   // default null; server-written only
```

Nested under the existing `users/{uid}/` tree throughout, so the existing
`users/{userId}/{document=**}` security rule already covers all of this —
no new Firestore rule needed, matching every prior phase's data-model
additions.

A new `src/features/notifications/` feature owns the client-side pieces,
following this codebase's standard pattern: `schema.ts`
(`parseFcmTokenDoc`/`toFcmTokenDoc`, and the settings-field additions
folding into the existing `settings/schema.ts`), `firestoreWrites.ts`
(`upsertFcmToken(uid, deviceId, token)`, `deleteFcmToken(uid, deviceId)`).

## Client-side: Settings UI + FCM token lifecycle

`NotificationSection.tsx` (parallel structure to `BackupSection.tsx`,
mounted in `SettingsPane.tsx` alongside it): a `Switch` bound to
`notificationsEnabled`, an `InputNumber` for `notifyDaysBeforeExpiry`
(matches the existing low-stock/hide-distant threshold field pattern), and
an `InputNumber` (0–23) for `notifyHourLocal`.

**Toggling the switch on:**
1. `Notification.requestPermission()`.
2. Denied → switch reverts to off, inline error message
   (`t("settings.notificationsPermissionDenied")`), `notificationsEnabled`
   stays `false`. Matches this codebase's established "degrade silently,
   never block" error philosophy (same as barcode lookup failures).
3. Granted → `await navigator.serviceWorker.ready`, `getToken(messaging, {
   vapidKey, serviceWorkerRegistration })`, `upsertFcmToken(uid, deviceId,
   token)`, capture `notifyTimezone`, set `notificationsEnabled: true`.

**Toggling off:** `deleteFcmToken(uid, deviceId)` (so the server job stops
targeting a token nobody wants pushes on) and `notificationsEnabled:
false`.

**Foreground messages** (`onMessage`, app open in the active tab): shown
via Ant Design's `notification.info(...)` rather than a native OS
notification — this reuses the existing `message`/`notification`
in-app-feedback convention instead of adding a second, native-notification
code path for the one case where the app is already visible.

## Client-side: combined service worker

Firebase's default guidance registers its own standalone
`firebase-messaging-sw.js`. This app already registers a Workbox-generated
service worker via `vite-plugin-pwa` (Phase 4, `generateSW` mode) for
offline app-shell caching. Two independently-registered service workers at
the same origin/scope conflict — only one can control a given page.

The fix, confirmed against Firebase's own Cloud Messaging Web SDK docs:
`getToken()` accepts a `serviceWorkerRegistration` option to reuse an
*existing* registration instead of requiring its own file. This means one
combined service worker instead of two competing ones:

1. Switch `vite-plugin-pwa` from `generateSW` to `injectManifest` mode.
2. Supply a custom service worker source, `src/sw.ts`:
   - `precacheAndRoute(self.__WB_MANIFEST)` — replaces what `generateSW`
     did automatically; this is the one required line to keep Phase 4's
     offline app-shell behavior working under `injectManifest`.
   - Firebase Messaging's compat-SDK `importScripts` calls plus
     `onBackgroundMessage((payload) => { self.registration.showNotification(...) })`
     — shows the OS notification when the app isn't the active tab.
3. Client-side, `await navigator.serviceWorker.ready` gives the one
   registration, passed into `getToken()` as above.

**Flagged as needing hands-on verification during planning** (not assumed
from docs alone, per this project's standing practice): `vite-plugin-pwa`'s
exact `injectManifest` config shape, and whether the Messaging compat
SDK's `importScripts` calls work cleanly inside a Vite-bundled service
worker output. If `injectManifest` turns out to be materially harder than
expected, the fallback is a second service worker registered at an
explicit custom scope (a known community pattern, though not the
officially-documented path) — a decision to make during planning/task 1
of implementation, not now.

## Server-side: GitHub Actions workflow + script

`.github/workflows/daily-notifications.yml`: `on: schedule: cron: "0 * * *
*"` (hourly — the only way to honor a user-configurable local send time
without per-tenant dynamic cron, since GitHub Actions cron is static).
Runs a Node.js script (`scripts/send-notifications.ts` or similar,
authenticated via Firebase Admin SDK using a service-account credential
from a GitHub Actions secret — not created in this phase, see Scope).

**Script logic, one run:**
1. List the `users` collection (a top-level `getDocs(collection(db,
   "users"))`, not a hardcoded uid — there's exactly one doc today since
   this app is single-tenant/shared-login per the master spec, but this
   avoids storing the uid itself as a secret and costs nothing extra).
   For each user doc, stop this iteration if `notificationsEnabled` is
   false.
2. Compute the current local hour in `notifyTimezone`. Stop unless it
   equals `notifyHourLocal`.
3. Query `items` where `expiring_date` is within `notifyDaysBeforeExpiry`
   days and `opened === false` — unopened stock only; an item already
   opened and in use isn't a "you forgot this exists" risk the same way.
4. Filter to items where `lastNotifiedAt` is `null`, or more than 7 days
   old (the re-notify dedup window — notify once when an item first
   crosses the threshold, once more if it's still sitting there
   unresolved a week later).
5. Empty result → stop. No push, no writes, no wasted FCM calls.
6. Otherwise: read every `fcm_tokens/` doc, send one digest push per
   token via the FCM HTTP v1 API — title + count, body listing item names,
   worded in the household's `language` setting. Then stamp
   `lastNotifiedAt: now()` on every item included in this digest.

The core logic (dedup filter, local-hour match, digest-content builder) is
written as plain, dependency-free functions so it's unit-testable without
touching Firestore or the Admin SDK at all; only the read/write glue needs
emulator-backed integration tests.

## Testing

- `schema.test.ts` (notifications feature) — `fcm_tokens` doc round-trip;
  the new `users/{uid}` settings fields parse with their defaults.
- `firestoreWrites.test.ts` — `upsertFcmToken`/`deleteFcmToken`.
- `NotificationSection.test.tsx` — permission-granted path registers a
  token and flips the switch on; permission-denied path reverts the
  switch and shows the inline message; toggling off deletes the token doc.
- Server script — pure-function unit tests for the dedup filter and the
  local-hour match check (no emulator needed); an emulator-backed
  integration test for the full script run against seeded Firestore data,
  invoked directly (`tsx scripts/send-notifications.ts` against the
  emulator), never through an actual GitHub Actions execution.
- e2e: extend `core-loop.spec.ts` with a notifications-enable case,
  mocking `Notification.requestPermission` → `"granted"` and the Messaging
  SDK's `getToken`, asserting the `fcm_tokens` doc appears in the
  emulator; a second case for the denied-permission revert.

## Global constraints for implementation

- All new collections/fields live under `users/{uid}/` — no new Firestore
  security rule needed.
- `notificationsEnabled` is a household-wide kill switch
  (`users/{uid}`); actual delivery additionally requires a
  device-level `fcm_tokens` entry — both gates must be open for a given
  device to receive a push.
- Every client-side failure path (permission denied, token registration
  failure) degrades to a clear inline message and leaves the switch off —
  never a silent half-enabled state.
- The server script never sends when the filtered item list is empty, and
  never re-stamps `lastNotifiedAt` on items it didn't actually include in
  a sent digest.
- No secret creation, no GitHub remote, no live scheduled run in this
  phase — see the Deployment-scope decision above.
