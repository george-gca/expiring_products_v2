# Expiring Products v2 — Rewrite Design

## Problem

Expiring Products (v1) is a working Jekyll + vanilla JS + Firebase PWA for household pantry
tracking, but the household (the two users, sharing one login) has not adopted it despite it
being functional. A prior council-style discussion traced the most likely cause to manual
data-entry friction: every item requires hand-typing name, quantity, expiration date, and
duration on every add, with no faster capture path. v1's own commit history also shows a
boom/stall pattern (a 9-month gap, then a 4-month gap with no commits), suggesting scope
creep risk on any rebuild needs active management.

## Goals

- Rebuild the app on a modern stack to make it easier to extend and to fix the adoption
  problem via lower-friction item capture (barcode scanning).
- Reuse the existing Firebase project (Auth + Firestore) and its config/access settings —
  no new Firebase setup required.
- Free rein on Firestore schema, frontend framework, and UI library.
- Ship a full cutover-ready v1 replacement, not a partial migration — v1 keeps running
  daily until v2 covers the agreed must-have scope, then the household switches over in
  one move and v1 is retired.

## Non-goals (deferred, not dropped)

- Multi-user/household accounts — the shared single login is a deliberate simplicity choice,
  not a gap to fix.
- Consumption/waste statistics view.
- Receipt-OCR batch import (bigger, riskier follow-up to barcode scanning).
- Data migration from v1's Firestore data — v2 launches with an empty pantry; existing
  items are re-entered manually (small effort for a household pantry).

## Must-have scope for cutover

- Core loop: add/view/edit/consume/discard items, dynamic categories, expiry-based sorting,
  red/yellow/white visual warnings.
- Shopping mode + recurring items.
- Backup/export & import (JSON).
- Installable PWA + offline app shell.
- Bilingual UI (pt-br default, en-us) at launch.
- Barcode scanning on the add-item flow (new capability, the core adoption fix).

## Architecture

- **Vite + React 19 + TypeScript** SPA, replacing Jekyll's build-time static generation.
- **Ant Design (v6)** as the component library — explicit user choice, based on its
  documented agent-coding support. The official `antd` CLI/skill is installed as a project
  skill (`.claude/skills/antd/SKILL.md`) and used to query real component APIs/tokens
  (`antd info`, `antd demo`, `antd doc`) rather than relying on memory.
- **Firebase Auth + Firestore**, same project/config as v1, via a fresh `.env`
  (`FIREBASE_API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, etc. — copied from v1's gitignored
  `.env`, never committed).
- **react-i18next** for pt-br/en-us, replacing Jekyll Polyglot's build-time page duplication.
- **vite-plugin-pwa** (Workbox) for the installable, offline-cached shell.
- **Netlify** for hosting, same as v1 (Firebase Hosting's free Spark tier would also easily
  cover this app's scale, noted as a possible future consolidation, not needed now).
- Data access via small typed hooks (`usePantryItems(categoryKey)`, `useCategories()`)
  wrapping Firestore `onSnapshot` listeners directly.

### Tech-stack alignment with the `yara` frontend skill

Adopted: React 19, Vite, TypeScript, **Zustand** (local UI state — current tab, sort/filter
prefs, shopping-mode toggle, hidden-items threshold — replacing v1's `window.*` globals),
Vitest + Playwright + **MSW** (mocking Open Food Facts HTTP calls; Firestore itself is
tested via the Firebase Local Emulator Suite), Biome + thin ESLint layer (replacing v1's
Prettier-only setup for JS/TS/JSON; `markdownlint-cli2` stays for docs), feature-based
folder structure, and light **TanStack Router** for the few real routes (auth gate,
settings) — category-tab switching stays local UI state, not a route param.

Deviations: **shadcn/ui + Tailwind + Radix → Ant Design** (explicit user choice).
**TanStack Query → direct Firestore `onSnapshot` hooks** (Query's pull/cache model fights
Firestore's push model). **React Hook Form → Ant Design's own `Form`** (AntD ships its own
form engine; layering RHF on top would be two form engines competing). Zod is kept, but
repurposed from form validation to parsing/validating data at the Firestore read boundary.

## Data layer (Firestore)

Fresh start, same top-level shape as v1, tightened where useful now that nothing needs to
stay backward-compatible:

```
users/{uid}/
  categories/          # unchanged shape from v1
  items/                # purchase-instance data
  item_history/         # autocomplete suggestions, unchanged from v1
  barcode_products/{barcode}   # NEW — product-metadata cache, keyed by barcode
```

**`items/{itemId}`** — same fields as v1, with two changes:
- `expiring_date` / `date_opened` become native Firestore `Timestamp` (was ISO string),
  enabling real server-side range queries (e.g. "expiring in the next 3 days") instead of
  client-side filtering.
- New fields: `barcode` (optional string), `source: "manual" | "barcode"`.

**`barcode_products/{barcode}`** (NEW) — product-level metadata, deliberately separate from
`items` because it's reusable across purchases while `items` is purchase-instance data
(quantity and the specific expiry date printed on *that* package vary per purchase even for
the same product):

```javascript
{
  name: "Whole Milk",
  category: "foods",
  suggestedDuration: 7,        // days after opening, used to pre-fill the add form
  source: "openfoodfacts" | "manual",
  updatedAt: <Timestamp>
}
```

`statistics` is dropped for now (deferred scope, no consumer yet).

## Barcode scanning feature

Camera-based scan button in the Add Item modal (native `BarcodeDetector` API with a
`zxing-js` fallback for browsers without it, e.g. Safari/iOS). On scan, cache-first flow:

1. Check `barcode_products/{barcode}` in Firestore first. If found — from a prior scan
   *or* a prior manual entry — pre-fill instantly, no network call (works offline too,
   since Firestore's local cache has it after first sync).
2. Not found locally → call the Open Food Facts API (free, no API key, crowdsourced; their
   usage policy explicitly recommends caching results and setting a proper `User-Agent`,
   which this design already does by design). If found, pre-fill the form **and** write
   the result to `barcode_products/{barcode}` (`source: "openfoodfacts"`) so every future
   scan of that barcode skips Open Food Facts entirely.
3. Not found in Open Food Facts either → plain manual entry, barcode field pre-filled. On
   save, write `name` + `category` + entered duration to `barcode_products/{barcode}`
   (`source: "manual"`) — so the next scan of that barcode, by either household member,
   auto-fills from what was just taught to it.

Scan/lookup failure at any step degrades silently to manual entry — it never blocks adding
an item.

## i18n, PWA, error handling, testing

- **i18n**: `react-i18next`, `en-us.json`/`pt-br.json` resource files (mirroring v1's
  string structure), pt-br default/fallback, language choice persisted per user.
- **PWA**: `vite-plugin-pwa` (Workbox), manifest adapted from v1's
  `expiring_products.webmanifest`, cache-first app shell — same "shell works offline, data
  needs network" model as v1.
- **Error handling**: Firestore/network errors surface via Ant Design `notification`/
  `message`; barcode/product-lookup failures degrade to manual entry silently (never block
  the add flow); form validation via Ant Design `Form` rules.
- **Testing**: Vitest + React Testing Library for hooks/components (`usePantryItems`,
  barcode lookup logic, form validation), Playwright for critical e2e paths (login → add
  item → verify sort order; scan barcode with a mocked camera/decoder + MSW-mocked Open
  Food Facts response). Tests come with each feature per the standing TDD rule, not after.

## Tooling and process decisions

- **`antd` CLI/skill**: installed as a project skill, used to verify real component APIs
  during implementation instead of relying on training-data memory of Ant Design.
- **`init`**: run once the initial scaffold exists, to establish `CLAUDE.md`/`AGENTS.md`-
  style docs for v2, mirroring v1's `AGENTS.md`/`ARCHITECTURE.md`/`DEVELOPMENT.md`/
  `USER_GUIDE.md`, which were genuinely useful reference material during this design
  process.
- **`surgical-comments`**: applied throughout — low-cost comment-quality discipline (WHY,
  not WHAT), no reason to skip it.
- **`solo-develing`**: explicitly NOT used. It's a heavyweight pipeline (test-case
  inventory, pre-commit hooks, independent review, docs pass gating every commit) suited to
  maximizing rigor on high-stakes solo work. This project's demonstrated risk is stalling
  out mid-build (v1's 9-month and 4-month commit gaps), not insufficient rigor per commit.
  Standard TDD (already a standing rule) plus normal code review gives real quality without
  adding process weight to the thing most likely to sink this rebuild: momentum.

## Open items for the implementation plan

- Exact barcode-scanning library choice and its offline/permission-denied UX.
- Netlify build configuration for a Vite SPA (adapting from v1's Jekyll `netlify.toml`,
  if one exists).
- Whether `barcode_products` needs any Firestore security-rule changes beyond the existing
  `users/{uid}/{document=**}` isolation rule (it shouldn't, since it lives under the same
  per-user path).
