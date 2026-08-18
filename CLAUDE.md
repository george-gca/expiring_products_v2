# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Expiring Products v2 — a household pantry-expiration-tracking PWA, rewritten from a Jekyll/vanilla-JS v1 onto Vite + React 19 + TypeScript + Ant Design v6, reusing the original v1 Firebase project (Auth + Firestore). Design and phased implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Commands

```bash
npm install                # first-time setup
npm run dev                 # dev server at http://localhost:5173

npm run build                # tsc -b && vite build
npm run typecheck            # tsc -b --noEmit
npm run lint                  # biome check . && eslint .   — always run the FULL command, not just tsc or Biome alone
npm run format                # biome format --write .

npm test                       # firebase emulators:exec --only auth,firestore "vitest run" — full suite, emulator-backed
npm run test:watch             # vitest, watch mode (no emulator — only safe for non-Firestore tests)
npm run test:e2e               # playwright test (also needs the emulator + dev server running, see below)
```

**Running a single test file**: `npm test -- <path>` does **not** filter to one file. The `test` script wraps vitest inside `firebase emulators:exec "vitest run"`, and npm-forwarded args land as extra positional args to `firebase emulators:exec`, not inside the quoted vitest command. For a filtered emulator-backed run, use:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/path/to/file.test.tsx"
```
Pure unit tests with no Firestore/Auth dependency (e.g. `sortItems.test.ts`, `schema.test.ts`) don't need the emulator wrapper — `npx vitest run <path>` filters correctly on its own.

**Running the e2e test**: needs both the emulator and the dev server, with emulator mode forced on:
```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

## Environment

Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values from the v1 project (never commit `.env` — it holds real credentials and is gitignored). Set `VITE_USE_FIREBASE_EMULATORS=true` for local dev/tests against the emulator suite; `false` points at the live Firebase project. Vite only exposes env vars prefixed `VITE_` to client code, which is why these are renamed from v1's `FIREBASE_*` keys.

## Architecture

**Feature-based structure** under `src/features/<feature>/`, not by file type: `auth/`, `categories/`, `pantry-items/`. Each feature owns its Zod schema (Firestore boundary parsing), hooks, and components together.

**Firestore access pattern — no TanStack Query.** Data hooks (`useAuth`, `useCategories`, `usePantryItems`) wrap Firestore's `onSnapshot` listeners directly. Firestore's real-time push model doesn't benefit from a pull/cache library; wrapping it in one would add indirection with no upside. Every hook returns `{ data, loading }`.

**Firestore boundary parsing.** No component or hook reads `doc.data()` untyped. Each feature's `schema.ts` defines a Zod schema plus `parseXDoc(id, data): X` (Firestore → domain object, snake_case → camelCase, `Timestamp` → `Date`) and, where writes happen, `toXDoc(x): object` (the reverse). `firestoreWrites.ts` in `pantry-items` is the only place that calls Firestore write APIs for items.

**State split**: Zustand (`pantry-items/store.ts`) holds local, per-device UI-only state (sort direction/filter per category) — never persisted to Firestore in this phase. Everything else lives in Firestore and flows through the `onSnapshot` hooks above.

**Routing**: no router library. `RootRoute` gates on auth (`Spin` while loading, `LoginPage` if signed out, otherwise invokes its `children` render-prop with the resolved `User`) and `AppRoute` receives that `user` as a prop — it does not call `useAuth()` itself, avoiding a second independent hook instance racing the first — and renders the tabbed category UI (`CategoryTabs`, one `ItemList` per category plus a Settings tab). A second real route (e.g. a standalone Settings page) would be the trigger to introduce TanStack Router — it's deliberately not installed yet.

**i18n**: `react-i18next`, pt-br default, resources in `src/locales/*.json` (filenames stay lowercase). Two non-obvious gotchas baked into `src/lib/i18n.ts`:
- `initImmediate: false` is required in the `.init()` config — i18next defers initialization via `setTimeout` by default, which races against anything calling `t()` synchronously right after import (breaks tests in particular).
- i18next internally canonicalizes language codes to BCP-47 casing (`en-US`, `pt-BR`) when resolving the active language via `changeLanguage()`, even when called with lowercase input. The `resources` object and `fallbackLng` are keyed `"pt-BR"`/`"en-US"` (not the lowercase `"pt-br"`/`"en-us"` you'd naively expect) to match. Any future code that compares `i18n.language === "pt-br"` directly (rather than only calling `changeLanguage`) needs to compare against the canonical casing instead.

**Ant Design**: verify component APIs against the actual installed version with the `antd` CLI (`antd info <Component>`, `antd demo <Component> <name>`) rather than from memory — a project skill at `.claude/skills/antd/SKILL.md` documents the full command set. Ant Design v6 uses `dayjs` for `DatePicker` values, not native `Date` — convert with `.toDate()` before passing to Firestore-write functions, which expect `Date`.

## Testing conventions

- Firestore/Auth-touching tests run against the Firebase Local Emulator Suite (`firebase.json`), never the live project.
- `afterEach` cleanup must call `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — **never a hardcoded project-id literal**. A hardcoded string that doesn't match the app's real configured project id silently no-ops the cleanup (the DELETE call clears an unused emulator namespace), causing cross-test data leakage within a single `npm test` run.
- `vitest.config.ts` sets `fileParallelism: false` — multiple test files share one Firestore emulator instance and `clearFirestoreEmulator` wipes the whole thing, so one file's wipe landing mid another file's test caused reproducible (not just occasional) failures under parallel file execution. Also excludes `e2e/**` (via `configDefaults.exclude`) so vitest's default glob doesn't try to run the Playwright spec in `e2e/`.
- Ant Design components need `eslint-plugin-react-hooks`'s `rules-of-hooks` check, not just `tsc`, to catch conditional-hook bugs — `tsc -b --noEmit` and Biome alone will not catch a hook called after an early `return`. Always run the full `npm run lint`.
