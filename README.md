# Expiring Products v2

A household pantry-expiration-tracking PWA. Rewrite of a Jekyll/vanilla-JS v1 onto Vite + React 19 + TypeScript + Ant Design v6, reusing the original v1 Firebase project (Auth + Firestore).

Design and phased implementation plans live in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Getting started

```bash
npm install                # first-time setup
npm run dev                # dev server at http://localhost:5173
npm run build               # tsc -b && vite build
npm run lint                 # biome check . && eslint .
npm test                       # firebase emulators:exec --only auth,firestore "vitest run"
npm run test:e2e               # playwright test (needs the emulator + dev server, see CLAUDE.md)
```

See `CLAUDE.md` for the full command reference and repo conventions.
