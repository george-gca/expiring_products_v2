---
name: run-expiring-products-v2
description: Build, run, and drive expiring-products-v2 (the pantry-expiration-tracking PWA). Use when asked to start the app, run it locally, take a screenshot of its UI, or click through a flow (sign up, add an item, edit settings) to verify a change.
---

This is a Vite + React 19 + Ant Design web app backed by Firebase
(Auth + Firestore), always run locally against the Firebase Local
Emulator Suite, never the live project. Drive it via the headless
Chromium REPL driver at
`.claude/skills/run-expiring-products-v2/driver.mjs` — pipe a script to
its stdin, same shape as `chromium-cli` (which isn't installed in this
container). All paths below are relative to the repo root.

## Prerequisites

Already satisfied by `npm install` (already run in this repo) — no
extra `apt-get` needed. Playwright's bundled Chromium is already
downloaded (`~/.cache/ms-playwright/chromium-*`); if it's ever missing,
`npx playwright install chromium` fetches it.

## Setup

```bash
npm install   # first time only
```

No env vars needed for local dev against the emulator — the emulator
connection is hardcoded to `127.0.0.1:9099`/`127.0.0.1:8080` in
`src/lib/firebase.ts`, gated on `VITE_USE_FIREBASE_EMULATORS=true`
(see Run below). A `.env` with real `VITE_FIREBASE_*` values is only
needed to point at the live Firebase project — not for local running.

## Build

```bash
npm run build   # tsc -b && vite build — only needed to check the production build compiles
```

## Run (agent path)

Two long-running processes, then the driver.

**1. Start the Firestore/Auth emulator** (background; do NOT use a
fixed `sleep` — poll instead):

```bash
npx firebase emulators:start --only auth,firestore > /tmp/emulator.log 2>&1 &
disown
timeout 30 bash -c 'until curl -s http://127.0.0.1:4000 >/dev/null 2>&1; do sleep 1; done'
```

**2. Start the dev server** with the emulator flag (background):

```bash
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill   # free the port if a stale server is still up
VITE_USE_FIREBASE_EMULATORS=true npm run dev > /tmp/dev.log 2>&1 &
disown
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

(If port 5173 is taken by something Playwright/another agent doesn't
own, Vite silently falls back to 5174+ — check `/tmp/dev.log` for the
actual `Local:` URL it printed.)

**3. Drive it.** Pipe a script to the driver's stdin from the repo
root:

```bash
node .claude/skills/run-expiring-products-v2/driver.mjs <<'EOF'
nav http://localhost:5173
wait-for text=Expiring Products
click label:has-text("Cadastrar")
fill #email agent-check@example.com
fill #password correct-horse-battery
click button:has-text("Cadastrar")
wait-for text=Foods
click .ant-float-btn
wait-for text=Adicionar item
fill #name Leite
fill #expiringDate 151026
click text=Adicionar item
click .ant-modal-footer button:has-text("OK")
wait-for text=Leite
sleep 1500
screenshot item-added
console --errors
quit
EOF
```

That's the full "sign up → add a dated item → confirm it renders"
loop, verified working end to end in this container. Screenshots land
in `./screenshots/<name>.png` (relative to wherever you launched the
driver — usually the repo root).

**Stop the background processes when done:**

```bash
pkill -f "firebase emulators:start"
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
```

### Driver commands

| command | what it does |
|---|---|
| `nav <url>` | `page.goto(url)` |
| `wait-for <selector>` | wait up to 15s for a selector (`text=...` or any CSS, including `:has-text()`) |
| `click <selector>` | click it |
| `fill <selector> <value...>` | fill a field (value is everything after the selector) |
| `press <key>` | keyboard press on whatever's focused (e.g. `Enter`) |
| `screenshot [name]` | save `screenshots/<name or shot-N>.png` |
| `console --errors` | print buffered `console.error`/page-error messages since launch |
| `sleep <ms>` | plain delay — see the Modal-close gotcha below |
| `quit` | close the browser and exit |

## Run (human path)

`VITE_USE_FIREBASE_EMULATORS=true npm run dev`, then open
`http://localhost:5173` yourself. Ctrl-C to stop. (Without the emulator
flag, `npm run dev` points at the real Firebase project per `.env` —
don't do that for throwaway testing.)

## Test

```bash
npm test   # firebase emulators:exec --only auth,firestore "vitest run" — full suite, ~90-100s
```

257 tests / 50 files pass as of this writing. See `CLAUDE.md` for
filtering to a single test file — `npm test -- <path>` does **not**
work as you'd expect (the args land on `firebase emulators:exec`, not
`vitest`); use the `npx firebase emulators:exec ... "npx vitest run
<path>"` form instead.

## Gotchas

- **Sign-up/login inputs have no useful CSS selector beyond `#email`
  / `#password`.** Ant Design's Form.Item auto-assigns the field's
  `name` as the input's `id`, so `#email`/`#password` work — but
  there's no `type="email"` on the email input (it's a plain text
  input), so `input[type="email"]` silently matches nothing and hangs
  until the 15s timeout.
- **"Cadastrar" (Sign Up) is both a tab label and, once selected, the
  submit button's text.** `click label:has-text("Cadastrar")` picks the
  tab (antd's segmented control renders it as a `<label>`, not a
  `<button>`); `click button:has-text("Cadastrar")` picks the real
  submit button. Scope by element type, not just text.
- **The "+" FloatButton has no text and no reliable `aria-label` on the
  `<button>` itself** — the `aria-label="plus"` antd sets lives on a
  nested `<span>` icon, not the button, so `button[aria-label="plus"]`
  never matches. Use the class selector `.ant-float-btn` instead.
- **The Add Item modal's Modal takes ~300ms+ to actually close after a
  successful submit** (`destroyOnHidden`'s exit animation). A
  screenshot taken immediately after `wait-for text=<item name>`
  succeeds can still show the modal fully open — this looks exactly
  like the modal reopened itself (confirmed via direct Firestore REST
  queries that it did **not** — every add was a single clean write, no
  duplicates), but it's just catching the outgoing animation frame.
  `sleep 1500` before a "the modal is gone" screenshot/assertion.
- **A freshly-signed-up account hides anything expiring more than 3
  months out, and hides no-expiration items unconditionally**, both
  via the default `hideDistantThresholdMonths: 3` /
  `hideDistantEnabled: true` settings — this is intended app behavior,
  not a driver bug. Pick a date within ~3 months of the emulator's
  system clock for a "does it render" smoke check (e.g. `151026` for
  a mid-September-2026 clock), or go to Settings first and uncheck
  "Ocultar itens que vão demorar mais para vencer" if you specifically
  need to see a far-future or no-expiration item.
- **`fill`ing the date field opens its calendar dropdown** (Ant Design
  focuses the input on fill, which auto-opens the picker). Pressing
  `Enter` to dismiss it is unreliable in this app — it sometimes
  submits the whole modal instead of just closing the calendar (still
  produces a single correct write either way, but leaves you unsure
  what state you're in). Click a neutral element instead, e.g. `click
  text=Adicionar item` (the modal title), before clicking the real OK
  button.

## Troubleshooting

- **`EADDRINUSE` / dev server won't bind to 5173**: a previous run's
  server is still listening. `lsof -ti:5173 -sTCP:LISTEN | xargs -r
  kill` before relaunching — `$!` right after `npm run dev &` is only
  the npm wrapper's PID, npm doesn't forward `SIGTERM` to the Vite
  process it spawned, so killing `$!` alone doesn't free the port.
- **Firestore Emulator UI (`localhost:4000/firestore`) shows an empty
  tree even though writes are clearly happening**: the emulator UI
  defaulted to project `demo-no-project` (no `.firebaserc` in this
  repo pins one), while the app's `.env` `VITE_FIREBASE_PROJECT_ID` is
  `expiring-products-app`. In `singleProjectMode` the emulator serves
  requests under whichever project ID the client sent — it does **not**
  silently remap them to the UI's default project — so the data is
  really there, just under a different project ID than the UI defaults
  to browsing. Query it directly instead of trusting the UI's default
  view:
  ```bash
  curl -s "http://127.0.0.1:8080/v1/projects/expiring-products-app/databases/(default)/documents/users/<uid>/items"
  ```
