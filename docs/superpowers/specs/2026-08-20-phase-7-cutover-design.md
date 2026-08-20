# Phase 7: Cutover from v1 — Design

## Purpose

Phase 7 is the last phase of the master rewrite spec
(`docs/superpowers/specs/2026-08-17-expiring-products-v2-rewrite-design.md`).
Phases 1–6 built the app entirely local (`npm run dev`, Firestore emulator);
nothing is deployed, and there is no GitHub remote for v2 yet. This phase
takes v2 from "complete on `main` locally" to "the live app the household
actually uses," and retires v1's live URL in the same move.

Two things Phase 6 explicitly deferred here: generating the real Firebase
service-account credential (to activate `daily-notifications.yml`), and
creating the GitHub remote/secret it needs. Both are in scope now.

## Scope

**In scope:**
- New GitHub repo `george-gca/expiring_products_v2` (public), v2's `main`
  pushed to it.
- `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PROJECT_ID` GitHub Actions
  secrets, activating the already-committed hourly-cron workflow.
- `netlify.toml` (build `npm run build`, publish `dist`).
- Netlify env vars (`VITE_FIREBASE_*`, `VITE_FIREBASE_VAPID_KEY`,
  `VITE_USE_FIREBASE_EMULATORS=false`) and repointing the existing
  `expiring-products.netlify.app` site's connected repo from v1 to v2.
- End-to-end live verification before the production flip: a Netlify
  deploy-preview build, manual smoke test (login/add-item/notification
  permission), and one manual `workflow_dispatch` run of the notification
  workflow confirmed to deliver a real push to a device.
- The production flip itself (immediate, no trial period — decided during
  brainstorming).

**Out of scope (explicit non-goals, per the master spec and this phase's
brainstorming):**
- Any change to v1's Firestore data or the Firebase project itself — v2
  already reuses v1's project as-is.
- v1 repo/workflow changes — `george-gca/expiring_products` and its GitHub
  Actions are left untouched. Repointing Netlify already removes v1 from
  live traffic; nothing else about v1 needs to change.
- Data migration from v1 — per the master spec's non-goals, v2 launches
  with an empty pantry, re-entered manually.

## Two manual steps (cannot be automated from here)

Confirmed empirically this session: no `gcloud` CLI installed, Firebase CLI
present but not logged in, Netlify CLI present but not logged in.

1. **Firebase Console, Project Settings → Cloud Messaging**: generate a Web
   Push certificate → VAPID key.
2. **Firebase Console, Project Settings → Service Accounts**: generate a new
   private key → service-account JSON.
3. (Setup only, one-time) `netlify login` — interactive OAuth, has to run
   as you.

Everything else (repo creation, pushing code, `gh secret set`, `netlify`
CLI env/link/deploy operations) I can drive directly once these three
inputs exist.

## Sequence

1. **Repo & CI**: `gh repo create george-gca/expiring_products_v2 --public
   --source=. --push` (or equivalent), then `gh secret set
   FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PROJECT_ID` from the values
   you provide.
2. **Netlify config**: add `netlify.toml` to the repo, commit, push.
3. **Netlify site**: `netlify login` (you), then I run `netlify link` /
   `netlify env:set` for each `VITE_FIREBASE_*` var + the VAPID key, using
   the real v1 Firebase project's values (from `.env` — never committed,
   already gitignored) plus the new VAPID key.
4. **Deploy preview + smoke test**: trigger a Netlify deploy preview (not
   production), verify login, add/edit/consume an item, and the
   notification-permission flow against the live Firebase project.
5. **Live workflow verification**: `gh workflow run daily-notifications.yml`
   manually once, confirm in the Actions log that it ran and check a real
   device for the push.
6. **Flip**: repoint `expiring-products.netlify.app`'s connected repo to
   `expiring_products_v2` and trigger a production deploy. Confirm the live
   domain serves v2.
7. **Report**: confirm to you that the household can now use the live URL,
   and that v1's repo/workflows were left alone per your choice.

## Rollback

Netlify retains prior production deploys — if the v2 production deploy is
broken, repointing the site back to v1's last good deploy (or its repo) is
the immediate escape hatch. No Firestore data is at risk either way, since
both apps read/write the same project.

## Risks / open questions closed during brainstorming

- **Repo**: new repo, not reusing v1's — avoids mixing Jekyll and Vite
  history. Decided.
- **Netlify**: repoint the existing site immediately rather than standing
  up a second site — decided; the deploy-preview step in the Sequence
  above is the safety net that replaces a separate trial site.
- **Cutover cadence**: flip immediately after verification, no side-by-side
  trial period — decided (both apps share one Firebase project, so there's
  no data-sync reason to delay).
- **v1 retirement**: leave the v1 repo/workflows as-is — decided.

## Testing / verification plan

No new unit/e2e tests — this phase is infrastructure, not application
code. Verification is the deploy-preview smoke test (step 4) and the live
workflow run (step 5) in the Sequence above, both manual.
