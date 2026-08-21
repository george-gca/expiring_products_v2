# Phase 7: Cutover from v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take v2 from "complete on `main` locally" to the live app the household uses, retiring v1's production URL in the same move.

**Architecture:** New public GitHub repo for v2, Netlify site repointed from v1 to v2, real Firebase credentials (VAPID key + service-account JSON) wired into Netlify env vars and a GitHub Actions secret, verified live (deploy preview + one manual notification-workflow run) before flipping the production domain.

**Tech Stack:** `gh` CLI (already authenticated as `george-gca`, scopes `repo`+`workflow`), `netlify` CLI (v27.1.2, available via `npx netlify`, not yet logged in), Firebase Console (manual, no CLI/API shortcut confirmed this session — no `gcloud`, Firebase CLI present but not logged in).

**Spec:** `docs/superpowers/specs/2026-08-20-phase-7-cutover-design.md`

## Global Constraints

- Never commit or paste real secret values (API keys, VAPID key, service-account JSON) into any file that gets committed to git, or into this plan document. Read them from the local gitignored `.env` at execution time, or take them fresh from the user in-session; pass them to `gh`/`netlify` CLI commands directly.
- v1's repo (`george-gca/expiring_products`) and its GitHub Actions are left untouched — per the spec's explicit decision, do not modify, disable, or archive anything there.
- The production domain flip (Task 7) is the one irreversible-feeling, user-visible step. Do not run it until Task 6's live workflow verification has passed. Confirm with the user immediately before executing Task 7 even though the AskUserQuestion answers already authorized "flip immediately" — this is the actual moment the household's live URL changes.
- No new Firebase project — v2 reuses v1's project id/config as-is (already the case via `.env`).

---

### Task 1: Netlify build config

**Files:**
- Create: `netlify.toml`

**Interfaces:**
- Produces: a build config Netlify's dashboard will read once the site's connected repo is repointed (Task 7) — `command`/`publish` keys it expects.

- [x] **Step 1: Write `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- [x] **Step 2: Verify the build command actually matches `package.json`**

Run: `grep '"build"' package.json`
Expected: `"build": "tsc -b && vite build"` — confirms `npm run build` is the right command and `dist` is Vite's default output dir (already true from every prior local `npm run build` this project's history).

- [x] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "chore: add Netlify build config for Phase 7 deploy"
```

---

### Task 2: New GitHub repo, push v2

**Files:** none (repo/remote operation only)

**Interfaces:**
- Consumes: local `main` at whatever commit it's at after Task 1.
- Produces: `george-gca/expiring_products_v2` on GitHub, with v2's `main` pushed and the local `origin` remote pointing at it. Task 3 depends on this remote existing (for `gh secret set` to target the right repo) and Task 4/6 depend on it (workflow file already lives in `main` at `.github/workflows/daily-notifications.yml` from Phase 6).

- [x] **Step 1: Confirm no existing `origin` remote (avoid clobbering something unexpected)**

Run: `git remote -v`
Expected: empty output (confirmed earlier this session — no remote configured yet).

- [x] **Step 2: Create the repo and push, in one step**

```bash
gh repo create george-gca/expiring_products_v2 \
  --public \
  --description "Household pantry-expiration-tracking PWA (v2 rewrite: Vite + React + Firebase)" \
  --source=. \
  --remote=origin \
  --push
```

- [x] **Step 3: Verify**

Run: `gh repo view george-gca/expiring_products_v2 --json url,defaultBranchRef -q '.url, .defaultBranchRef.name'`
Expected: the repo URL, and `main` as the default branch.

Run: `git log origin/main -1 --oneline` and compare to `git log -1 --oneline` — they must match (confirms the push landed the current tip, not a stale ref).

No commit step — this task is pure repo/remote setup, nothing to add to git.

---

### Task 3: GitHub Actions secrets (activates the notification workflow)

**Files:** none (GitHub repo secret operation only)

**Interfaces:**
- Consumes: the repo created in Task 2. Also consumes a service-account JSON the user must generate via Firebase Console (Project Settings → Service Accounts → Generate new private key) — this cannot be scripted from here (no `gcloud`, Firebase CLI not logged in, confirmed this session).
- Produces: `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID` repo secrets, which `.github/workflows/daily-notifications.yml` (already committed in Phase 6) reads via its `env:` block.

- [x] **Step 1: Ask the user for the service-account JSON**

If not already provided in-session, stop and ask: "Generate a service-account private key at Firebase Console → Project Settings → Service Accounts → Generate new private key, and paste the JSON here." Do not proceed on a guess or placeholder.

- [x] **Step 2: Get the real Firebase project id from the local `.env`**

Run: `grep VITE_FIREBASE_PROJECT_ID .env | cut -d= -f2`

This is the value for `FIREBASE_PROJECT_ID` — do not print the full `.env` contents into the conversation or this plan; only echo this one line's value where needed for the next step.

- [x] **Step 3: Set both secrets**

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT_JSON --repo george-gca/expiring_products_v2 --body "<paste JSON from Step 1>"
gh secret set FIREBASE_PROJECT_ID --repo george-gca/expiring_products_v2 --body "<value from Step 2>"
```

- [x] **Step 4: Verify**

Run: `gh secret list --repo george-gca/expiring_products_v2`
Expected: both `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID` listed (values never shown, that's expected — GitHub never echoes secret values back).

No commit step — GitHub repo secrets are not git-tracked.

---

### Task 4: Netlify site setup and env vars

**Files:** none (Netlify site configuration only)

**Interfaces:**
- Consumes: the repo from Task 2, `netlify.toml` from Task 1, and a VAPID key the user must generate via Firebase Console (Project Settings → Cloud Messaging → Web Push certificates → Generate key pair) — also not scriptable from here.
- Produces: env vars set on the existing `expiring-products.netlify.app` Netlify site (not yet repointed to v2 — that's Task 7), ready for the deploy-preview build in Task 5.

- [x] **Step 1: User logs in to Netlify CLI (must be done by the user — interactive OAuth)**

Ask the user to run `npx netlify login` themselves (they'll be told to type `! npx netlify login` per this session's convention for user-run shell commands) and confirm when done.

- [x] **Step 2: Confirm login and find the existing site**

Run: `npx netlify status`
Expected: shows a logged-in account, not "Not logged in".

Run: `npx netlify sites:list`
Expected: a row whose URL is `expiring-products.netlify.app` (the site currently serving v1) — note its exact `Site Name` and `Site Id` from the output; the name may not literally be `expiring-products`, confirm from the actual listed value rather than assuming.

- [x] **Step 3: Link the local v2 checkout to that existing site (do NOT create a new site)**

```bash
npx netlify link --id <Site Id from Step 2>
```

- [x] **Step 4: Ask the user for the VAPID key**

If not already provided in-session, stop and ask: "Generate a Web Push certificate at Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair, and paste the key here."

- [x] **Step 5: Set env vars from `.env` plus the new VAPID key**

Read each `VITE_FIREBASE_*` value from the local `.env` one at a time and set it — do not print the full file:

```bash
npx netlify env:set VITE_FIREBASE_API_KEY "$(grep VITE_FIREBASE_API_KEY .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_AUTH_DOMAIN "$(grep VITE_FIREBASE_AUTH_DOMAIN .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_PROJECT_ID "$(grep VITE_FIREBASE_PROJECT_ID .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_STORAGE_BUCKET "$(grep VITE_FIREBASE_STORAGE_BUCKET .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_MESSAGING_SENDER_ID "$(grep VITE_FIREBASE_MESSAGING_SENDER_ID .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_APP_ID "$(grep VITE_FIREBASE_APP_ID .env | cut -d= -f2-)"
npx netlify env:set VITE_FIREBASE_VAPID_KEY "<value from Step 4>"
npx netlify env:set VITE_USE_FIREBASE_EMULATORS "false"
```

- [x] **Step 6: Verify**

Run: `npx netlify env:list`
Expected: all 8 keys listed (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`, `VITE_USE_FIREBASE_EMULATORS`), values masked in the CLI's own output (expected, not a problem).

No commit step — Netlify env vars are not git-tracked.

---

### Task 5: Deploy preview and manual smoke test

**Files:** none

**Interfaces:**
- Consumes: the linked site and env vars from Task 4.
- Produces: a live (non-production) preview URL used to hand-verify the app before Task 6/7 touch anything production-facing.

- [x] **Step 1: Build and deploy a preview (not production)**

```bash
npm run build
npx netlify deploy --build
```

Do not pass `--prod`. This uploads `dist/` to a draft/preview URL and prints it.

- [x] **Step 2: Hand-verify against the printed preview URL**

Ask the user to open the printed preview URL and confirm: login works, adding/editing/consuming a pantry item works, and the Settings tab's notification toggle requests browser permission without erroring. Report back before continuing to Task 6.

Do not proceed to Task 6 on an assumption — wait for the user's confirmation that the preview works, since this is the last checkpoint before touching the real notification-delivery path and (in Task 7) production traffic.

No commit step — a deploy preview produces no repo changes.

---

### Task 6: Live notification workflow verification

**Files:** none

**Interfaces:**
- Consumes: the GitHub Actions secrets from Task 3 and the already-committed `.github/workflows/daily-notifications.yml` (Phase 6). Also needs at least one real device registered for push — if the user hasn't enabled notifications on a real device against the live Firebase project yet, ask them to do so first (via the Task 5 preview URL's Settings tab) before triggering the workflow, otherwise there's nothing to verify delivery against.
- Produces: confirmation that the deferred-since-Phase-6 server-side send path actually works end-to-end against the live Firebase project.

- [x] **Step 1: Confirm at least one device is registered**

Ask the user to confirm they've enabled notifications (granted the browser permission prompt) from the Task 5 preview URL on a real device, so there's an `fcm_tokens` doc to send to.

- [x] **Step 2: Trigger the workflow manually**

```bash
gh workflow run daily-notifications.yml --repo george-gca/expiring_products_v2
```

- [x] **Step 3: Watch it run**

```bash
gh run list --repo george-gca/expiring_products_v2 --workflow=daily-notifications.yml --limit 1
gh run watch --repo george-gca/expiring_products_v2 $(gh run list --repo george-gca/expiring_products_v2 --workflow=daily-notifications.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: run completes with conclusion `success`.

- [x] **Step 4: Confirm real delivery**

Ask the user to confirm whether a push notification actually arrived on their device. If the user has no item currently due for notification (the script only sends for items within `notifyDaysBeforeExpiry` and not already notified within the dedup window), have them temporarily add a pantry item with an expiry date inside that window, re-run Steps 2–3, then confirm delivery, then delete the test item.

No commit step — this task only runs already-committed code against live infra.

---

### Task 7: Flip production — repoint Netlify to v2

**Files:** none

**Interfaces:**
- Consumes: everything verified in Tasks 4–6.
- Produces: `expiring-products.netlify.app` serving v2 in production, v1 retired from live traffic.

- [x] **Step 1: Stop and get explicit confirmation before this step**

Per this plan's Global Constraints, ask the user to confirm they want to flip the live production domain now, even though earlier AskUserQuestion answers already chose "flip immediately" — this is the concrete moment the household's real URL changes, and it deserves its own explicit go-ahead per this project's risky-action norms.

- [x] **Step 2: Repoint the site's connected repo**

Via Netlify CLI there is no single "change linked repo" command; do it via the dashboard: ask the user to go to the `expiring-products` site's **Site settings → Build & deploy → Continuous deployment → Link site to a different repository**, and connect `george-gca/expiring_products_v2` (branch `main`), replacing v1's `expiring_products`.

Confirm with the user once done.

- [x] **Step 3: Trigger and verify the production deploy**

```bash
npx netlify deploy --prod --build
```

- [x] **Step 4: Verify the live domain**

Ask the user to open `https://expiring-products.netlify.app/` fresh (hard refresh / private window) and confirm it now shows v2 (e.g. the Ant Design UI, not v1's Jekyll page).

**Rollback, if something's badly wrong:** Netlify retains prior production deploys under **Deploys** on the site dashboard — publish the last v1 deploy from there, or repeat Step 2 pointing back at `george-gca/expiring_products`, to restore v1 immediately. No Firestore data is at risk either way (same project).

No commit step.

---

### Task 8: Final report and plan close-out

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-phase-7-cutover.md` (this file — mark all checkboxes complete)
- Modify: `docs/superpowers/specs/2026-08-17-expiring-products-v2-rewrite-design.md` if it tracks phase status (check first)

**Interfaces:** none — documentation close-out only.

- [x] **Step 1: Check whether the master rewrite spec has a phase-status section to update**

Run: `grep -n -i "phase 7\|status" docs/superpowers/specs/2026-08-17-expiring-products-v2-rewrite-design.md`

If it has a status marker for Phase 7, update it to complete. If it doesn't track per-phase status at all, skip this file.

- [x] **Step 2: Mark this plan's tasks complete and commit**

```bash
git add docs/superpowers/plans/2026-08-20-phase-7-cutover.md
git commit -m "chore: mark Phase 7 (cutover) plan complete"
```

(Include the master spec file in this commit too if Step 1 changed it.)

- [x] **Step 3: Report to the user**

Summarize: live URL, confirmation the household can use it now, confirmation v1's repo/workflows were left untouched, and a reminder that the daily notification workflow now runs for real on GitHub's schedule (hourly, matching each user's chosen local hour).
