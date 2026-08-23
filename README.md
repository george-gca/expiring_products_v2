# Expiring Products v2

A household pantry-expiration-tracking PWA. You add items with an expiry
date, and it tracks what's about to go bad, what's low in stock, and
reminds you before things spoil — synced live across every device signed
into the same account.

Rewrite of a Jekyll/vanilla-JS v1 onto Vite + React 19 + TypeScript +
Ant Design v6, reusing the original v1 Firebase project (Auth + Firestore)
so no data migration was needed. Live at
[expiring-products.netlify.app](https://expiring-products.netlify.app).

## Features

- **Custom category tabs** — create, rename, reorder, and archive your own
  categories (e.g. Foods, Medicines, Freezer) with an emoji icon of your
  choosing, not a fixed set.
- **Expiration tracking** — sort/filter items per category, hide items
  expiring further out than you care about right now.
- **Low-stock & shopping mode** — a shopping list derived from items you've
  marked as recurring purchases that have dropped below your configured
  threshold.
- **Barcode scanning** — camera-based scan (with a visual aim guide) or a
  manually typed barcode both look up the product via Open Food Facts,
  falling back to Open Products Facts and then Open Beauty Facts for
  non-food and cosmetic items, or to manual entry of the name itself;
  either way, the barcode gets remembered against that item so the
  next scan (or typed entry) of it auto-fills instantly, building a
  household-specific barcode database over time.
- **Push notifications** — a daily digest of what's expiring soon, with a
  configurable time and lead time, registered per device.
- **Backup & restore** — export your whole pantry to a JSON file, import it
  back (with a typed confirmation before any destructive replace).
- **Installable PWA** — works offline for previously-loaded data, and
  prompts you to refresh when a new version is deployed while the app is
  already open.
- **Multi-device sync** — every device signed into the same account sees
  the same data in real time; no manual refresh, no separate sync step.
- **pt-BR / en-US**, light/dark theme following your OS setting.

### Planned / known gaps

- Barcode lookup has no medicine-specific source (Open Food Facts,
  Open Products Facts, and Open Beauty Facts cover food, general
  goods, and cosmetics, but none carry drug data) — scanning a
  medicine still mostly misses; see
  [#8](https://github.com/george-gca/expiring_products_v2/issues/8).
- See the [issue tracker](https://github.com/george-gca/expiring_products_v2/issues)
  for the current backlog.

## Tech stack

| | |
|---|---|
| **Vite + React 19 + TypeScript** | fast dev server/build, the team's default for a new SPA |
| **Ant Design v6** | component library with a built-in light/dark theming algorithm, avoids hand-rolling design-system basics |
| **Firebase (Auth + Firestore)** | reused as-is from the v1 app — real-time sync comes free from Firestore's `onSnapshot`, so there's no separate data-fetching/cache library (no TanStack Query): a push-based store doesn't benefit from a pull/cache layer on top |
| **Zustand** | only for local, per-device UI state (e.g. sort/filter prefs) that deliberately never syncs to Firestore |
| **Zod** | parses every Firestore document at the boundary — nothing in the app trusts `doc.data()` untyped |
| **react-i18next** | pt-BR default, en-US supported |
| **vite-plugin-pwa + Workbox** | installable PWA, offline app-shell precaching, in-app "new version available" prompt |
| **Firebase Cloud Messaging** | push notifications, registered per device |
| **emoji-picker-react** | category icon picker, configured to render native OS emoji glyphs (no image CDN calls, works offline) |
| **Open Food Facts / Open Products Facts / Open Beauty Facts APIs** | barcode → product-name lookup, chained fallback across food, general non-food, and cosmetic coverage |
| **Vitest + Testing Library + Playwright** | unit/integration tests run against the real Firebase Local Emulator Suite (not mocks); Playwright covers end-to-end flows |
| **Biome + a thin ESLint layer** | formatting/linting; ESLint only for the React-specific rules Biome doesn't cover |

## Getting started

```bash
npm install                # first-time setup
npm run dev                # dev server at http://localhost:5173
npm run build               # tsc -b && vite build
npm run lint                 # biome check . && eslint .
npm test                       # firebase emulators:exec --only auth,firestore "vitest run"
npm run test:e2e               # playwright test (needs the emulator + dev server, see CLAUDE.md)
```

See [`CLAUDE.md`](CLAUDE.md) for the full command reference and repo
conventions, and [`docs/superpowers/specs/`](docs/superpowers/specs/) for
design docs behind the larger features.
