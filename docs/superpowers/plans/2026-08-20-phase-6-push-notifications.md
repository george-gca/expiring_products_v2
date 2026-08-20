# Phase 6: Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full push-notification plumbing (data model, client permission/registration UI, combined service worker, and the server-side daily digest script + GitHub Actions workflow) so that once Phase 7 deploys the app, a real daily push about soon-to-expire items works end to end.

**Architecture:** `users/{uid}` settings gain four notification fields; a new `src/features/notifications/` feature owns per-device FCM token registration (`fcm_tokens/{deviceId}`); `vite-plugin-pwa` switches to `injectManifest` mode so one combined service worker handles both offline caching (Workbox) and background push (Firebase Messaging); a Node script under `scripts/notifications/` (run via `tsx`, using the Firebase Admin SDK) implements the dedup + digest + send logic and is wired into an hourly-cron GitHub Actions workflow that stays inert until Phase 7 adds a live secret.

**Tech Stack:** Same as Phases 1–5 — Vite, React 19, TypeScript, Ant Design v6, Firebase (Auth + Firestore + Messaging, Local Emulator Suite for tests), Zod v4, Vitest + Testing Library, Playwright, Biome. New: `firebase-admin` (server script), `tsx` (runs the script), `workbox-precaching`/`workbox-core` (combined service worker).

**Spec:** [docs/superpowers/specs/2026-08-20-phase-6-push-notifications-design.md](../specs/2026-08-20-phase-6-push-notifications-design.md)

## Global Constraints

- All new collections/fields live under `users/{uid}/` — no new Firestore security rule needed.
- `notificationsEnabled` is a household-wide kill switch (`users/{uid}`); actual delivery additionally requires a device-level `fcm_tokens` entry — both gates must be open for a given device to receive a push.
- Every client-side failure path (permission denied, token registration failure) degrades to a clear inline message and leaves the switch off — never a silent half-enabled state.
- The server script never sends when the filtered item list is empty, and never re-stamps `lastNotifiedAt` on items it didn't actually include in a sent digest.
- No secret creation, no GitHub remote, no live scheduled run in this phase.
- A schema change to `Settings` ripples into the `backup` feature's `backupSettingsSchema` and every test fixture that constructs a `Settings`-shaped literal — Task 1 fixes all of these in one pass (confirmed by grepping the whole `src/` tree before writing this plan).
- For emulator-backed tests, run the full `npm test`, or `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"` for a filtered run — `npm test -- <path>` does not filter (see CLAUDE.md). Pure-function tests don't need the emulator wrapper.
- Always run the FULL `npm run lint` (`biome check . && eslint .`) before considering a task done.
- `afterEach` emulator cleanup always calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal. The one exception is Task 8's server-script integration test, which uses the Firebase Admin SDK against a distinct, hardcoded test-only project id (`"notifications-script-test"`) — fully isolated from the client SDK's project id and cleanup convention, so no `clearFirestoreEmulator` call is needed there.
- **Before writing any Ant Design component code, verify the current API with `antd info <Component>` / `antd demo <Component> <name>` — do not write component JSX from memory.** (Already verified for this plan: `notification.info({ message, description })`.)
- `eslint-plugin-react-hooks`'s `set-state-in-effect` and `refs` rules forbid writing a `useState` setter or a `ref.current` assignment directly inside a `useEffect` body — use the render-time "adjusting state when a prop changes" pattern (already established in `SettingsPane.tsx`) for state resyncs, and a dependency-less effect for ref writes.

---

## File Structure

```
src/
├── features/
│   ├── notifications/                         # NEW feature
│   │   ├── schema.ts                          # FcmToken type, parseFcmTokenDoc, toFcmTokenDoc
│   │   ├── schema.test.ts
│   │   ├── firestoreWrites.ts                 # upsertFcmToken, deleteFcmToken
│   │   ├── firestoreWrites.test.ts
│   │   ├── deviceId.ts                        # getDeviceId()
│   │   ├── deviceId.test.ts
│   │   ├── messaging.ts                       # requestNotificationPermission, registerForPush, unregisterFromPush, onForegroundMessage
│   │   └── messaging.test.ts
│   ├── settings/
│   │   ├── schema.ts                          # MODIFY: 4 new Settings fields
│   │   ├── schema.test.ts                     # MODIFY: ripple fix + new tests
│   │   ├── useSettings.ts                     # MODIFY: DEFAULT_SETTINGS
│   │   ├── useSettings.test.tsx                # MODIFY: ripple fix
│   │   ├── firestoreWrites.ts                  # MODIFY: 3 new update functions
│   │   ├── firestoreWrites.test.ts             # MODIFY: 3 new tests
│   │   ├── NotificationSection.tsx             # NEW
│   │   ├── NotificationSection.test.tsx        # NEW
│   │   ├── SettingsPane.tsx                    # MODIFY: mount NotificationSection
│   │   ├── SettingsPane.test.tsx               # MODIFY: ripple fix
│   │   └── BackupSection.test.tsx              # MODIFY: ripple fix (fixture literals)
│   └── pantry-items/
│       ├── schema.ts                           # MODIFY: lastNotifiedAt field
│       └── schema.test.ts                      # MODIFY: new assertions
├── backup/
│   ├── schema.ts                               # MODIFY: backupSettingsSchema ripple fix
│   ├── schema.test.ts                          # MODIFY: fixture ripple fix
│   ├── exportBackup.test.ts                    # MODIFY: ripple fix
│   └── importBackup.test.ts                    # MODIFY: ripple fix
├── routes/
│   ├── app-route.tsx                           # MODIFY: foreground message subscription
│   └── app-route.test.tsx                      # MODIFY: ripple fix (mocked useSettings literals)
├── sw.ts                                       # NEW — combined Workbox + Firebase Messaging service worker
└── locales/
    ├── en-us.json                              # MODIFY: new settings.* keys
    └── pt-br.json                              # MODIFY: same
scripts/
└── notifications/
    ├── logic.ts                                # NEW — pure dedup/hour-match/digest functions
    ├── logic.test.ts
    ├── run.ts                                  # NEW — Admin SDK orchestration + CLI entrypoint
    └── run.integration.test.ts
.github/workflows/
└── daily-notifications.yml                     # NEW — inert until Phase 7
vite.config.ts                                  # MODIFY: injectManifest strategy
tsconfig.json                                   # MODIFY: 2 new project references
tsconfig.app.json                               # MODIFY: exclude src/sw.ts
tsconfig.sw.json                                # NEW
tsconfig.scripts.json                           # NEW
.env.example                                    # MODIFY: VITE_FIREBASE_VAPID_KEY
package.json                                    # MODIFY: firebase-admin, tsx, workbox-precaching, workbox-core
```

---

### Task 1: Extend `Settings` with notification fields, fix the backup ripple

**Files:**
- Modify: `src/features/settings/schema.ts`, `src/features/settings/schema.test.ts`, `src/features/settings/useSettings.ts`, `src/features/settings/useSettings.test.tsx`, `src/features/settings/firestoreWrites.ts`, `src/features/settings/firestoreWrites.test.ts`, `src/features/settings/SettingsPane.test.tsx`, `src/features/settings/BackupSection.test.tsx`, `src/features/backup/schema.ts`, `src/features/backup/schema.test.ts`, `src/features/backup/exportBackup.test.ts`, `src/features/backup/importBackup.test.ts`, `src/routes/app-route.test.tsx`

**Interfaces:**
- Produces: `Settings` gains `notificationsEnabled: boolean`, `notifyDaysBeforeExpiry: number`, `notifyHourLocal: number`, `notifyTimezone: string`. `updateNotificationsEnabled(uid, value)`, `updateNotifyDaysBeforeExpiry(uid, value)`, `updateNotifyHourLocal(uid, hour, timezone)` in `settings/firestoreWrites.ts`.

This task is unusually wide because a `Settings` field addition ripples into every file that constructs a `Settings`-shaped literal — confirmed exhaustively via `grep -rln "lowStockThreshold\|hideDistantThresholdMonths" src/` before writing this plan (matches the Phase 4 lesson recorded in project memory). Every one of the files listed above was found by that grep or by grepping for `Settings` type usage directly.

- [x] **Step 1: Update the settings schema**

Replace `src/features/settings/schema.ts` in full:

```typescript
import { z } from "zod";

const DEFAULT_LOW_STOCK_THRESHOLD = 3;
const DEFAULT_LANGUAGE = "pt-br";
const DEFAULT_HIDE_DISTANT_THRESHOLD_MONTHS = 3;
const DEFAULT_NOTIFICATIONS_ENABLED = false;
const DEFAULT_NOTIFY_DAYS_BEFORE_EXPIRY = 3;
const DEFAULT_NOTIFY_HOUR_LOCAL = 8;
const DEFAULT_NOTIFY_TIMEZONE = "America/Sao_Paulo";

// `.catch()` on every field falls back to its default instead of throwing
// when the field is missing or malformed. This is defense in depth on top
// of each write path's own validation: bad data already in Firestore (or a
// future writer that skips validation) must not be able to throw here.
// Firestore's onSnapshot dispatches its success callback via a bare
// setTimeout with no try/catch, so a throw from parseSettingsDoc inside
// useSettings's snapshot handler bypasses the error callback and wedges
// `loading` at `true` forever — which in turn makes AppRoute's
// `if (settingsLoading) return null` gate render nothing, permanently, for
// that user.
export const settingsDocSchema = z.object({
	lowStockThreshold: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_LOW_STOCK_THRESHOLD),
	language: z.enum(["pt-br", "en-us"]).catch(DEFAULT_LANGUAGE),
	hideDistantThresholdMonths: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_HIDE_DISTANT_THRESHOLD_MONTHS),
	notificationsEnabled: z.boolean().catch(DEFAULT_NOTIFICATIONS_ENABLED),
	notifyDaysBeforeExpiry: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_NOTIFY_DAYS_BEFORE_EXPIRY),
	notifyHourLocal: z
		.number()
		.int()
		.min(0)
		.max(23)
		.catch(DEFAULT_NOTIFY_HOUR_LOCAL),
	notifyTimezone: z.string().min(1).catch(DEFAULT_NOTIFY_TIMEZONE),
});

export interface Settings {
	lowStockThreshold: number;
	language: "pt-br" | "en-us";
	hideDistantThresholdMonths: number;
	notificationsEnabled: boolean;
	notifyDaysBeforeExpiry: number;
	notifyHourLocal: number;
	notifyTimezone: string;
}

export function parseSettingsDoc(data: unknown): Settings {
	return settingsDocSchema.parse(data);
}
```

- [x] **Step 2: Update `settings/schema.test.ts`**

Replace the file in full — every existing `.toEqual(...)` gets the 4 new default fields appended, plus 4 new tests for the new fields' own `.catch()` behavior:

```typescript
import { describe, expect, it } from "vitest";
import { parseSettingsDoc } from "./schema";

// parseSettingsDoc must never throw: Firestore's onSnapshot dispatches its
// success callback via a bare setTimeout with no try/catch, so a throw here
// (from a malformed document already in Firestore, or a future writer that
// skips validation) bypasses the error callback and wedges useSettings's
// `loading` state at `true` forever, which in turn makes AppRoute's
// `if (settingsLoading) return null` gate render nothing, permanently, for
// that user. Out-of-range/malformed input falls back to each field's
// default instead — see schema.ts's `.catch()` calls.
describe("parseSettingsDoc", () => {
	it("parses a fully valid settings document", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 7,
				language: "en-us",
				hideDistantThresholdMonths: 6,
				notificationsEnabled: true,
				notifyDaysBeforeExpiry: 5,
				notifyHourLocal: 20,
				notifyTimezone: "America/New_York",
			}),
		).toEqual({
			lowStockThreshold: 7,
			language: "en-us",
			hideDistantThresholdMonths: 6,
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 5,
			notifyHourLocal: 20,
			notifyTimezone: "America/New_York",
		});
	});

	it("falls back to all defaults on an empty document", () => {
		expect(parseSettingsDoc({})).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-positive lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 0,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-integer lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 2.5,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-numeric lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: "not a number",
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to pt-br when language is missing or not a supported value", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, hideDistantThresholdMonths: 3 }),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});

		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "fr-fr",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default hideDistantThresholdMonths when missing or non-integer", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, language: "en-us" }),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});

		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 2.5,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to defaults when notification fields are missing or malformed", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 3,
				notificationsEnabled: "yes",
				notifyDaysBeforeExpiry: -1,
				notifyHourLocal: 24,
				notifyTimezone: "",
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});
});
```

- [x] **Step 3: Update `useSettings.ts`'s `DEFAULT_SETTINGS`**

In `src/features/settings/useSettings.ts`, replace the `DEFAULT_SETTINGS` constant:

```typescript
const DEFAULT_SETTINGS: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
	notificationsEnabled: false,
	notifyDaysBeforeExpiry: 3,
	notifyHourLocal: 8,
	notifyTimezone: "America/Sao_Paulo",
};
```

Nothing else in this file changes.

- [x] **Step 4: Update `useSettings.test.tsx`**

In `src/features/settings/useSettings.test.tsx`, the first test's `.toEqual(...)` (currently at line 18) needs the 4 new fields appended:

```typescript
	it("bootstraps default settings when no settings doc exists", async () => {
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});
```

The other two tests in this file only assert `result.current.settings.lowStockThreshold` — unaffected, leave them as-is.

- [x] **Step 5: Add the 3 new update functions to `settings/firestoreWrites.ts`**

Append to `src/features/settings/firestoreWrites.ts` (existing 3 functions stay unchanged):

```typescript
export async function updateNotificationsEnabled(
	uid: string,
	value: boolean,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notificationsEnabled: value },
		{ merge: true },
	);
}

export async function updateNotifyDaysBeforeExpiry(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notifyDaysBeforeExpiry: value },
		{ merge: true },
	);
}

export async function updateNotifyHourLocal(
	uid: string,
	hour: number,
	timezone: string,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notifyHourLocal: hour, notifyTimezone: timezone },
		{ merge: true },
	);
}
```

- [x] **Step 6: Add tests for the 3 new update functions**

Append to `src/features/settings/firestoreWrites.test.ts` (add the 3 new names to the existing import line, then append these `describe` blocks):

```typescript
import {
	updateHideDistantThresholdMonths,
	updateLanguage,
	updateLowStockThreshold,
	updateNotificationsEnabled,
	updateNotifyDaysBeforeExpiry,
	updateNotifyHourLocal,
} from "./firestoreWrites";
```

```typescript
describe("updateNotificationsEnabled", () => {
	it("updates an existing settings doc's notificationsEnabled", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotificationsEnabled(uid, true);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notificationsEnabled).toBe(true);
	});
});

describe("updateNotifyDaysBeforeExpiry", () => {
	it("updates an existing settings doc's notifyDaysBeforeExpiry", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotifyDaysBeforeExpiry(uid, 5);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notifyDaysBeforeExpiry).toBe(5);
	});
});

describe("updateNotifyHourLocal", () => {
	it("updates an existing settings doc's notifyHourLocal and notifyTimezone together", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotifyHourLocal(uid, 20, "America/New_York");
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notifyHourLocal).toBe(20);
		expect(snapshot.data()?.notifyTimezone).toBe("America/New_York");
	});
});
```

- [x] **Step 7: Fix the `SettingsPane.test.tsx` fixture**

In `src/features/settings/SettingsPane.test.tsx`, the top-level `settings` const needs the 4 new fields:

```typescript
const settings: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
	notificationsEnabled: false,
	notifyDaysBeforeExpiry: 3,
	notifyHourLocal: 8,
	notifyTimezone: "America/Sao_Paulo",
};
```

Nothing else in this file changes (its two existing tests don't touch the new fields).

- [x] **Step 8: Fix `app-route.test.tsx`'s two mocked `useSettings` literals**

In `src/routes/app-route.test.tsx`, both `vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({ settings: {...} })` calls need the 4 new fields added to their inner `settings` object. First one (currently `language: "en-us"`):

```typescript
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 3,
				notificationsEnabled: false,
				notifyDaysBeforeExpiry: 3,
				notifyHourLocal: 8,
				notifyTimezone: "America/Sao_Paulo",
			},
			loading: false,
		});
```

Second one (currently `language: "pt-br"`, `loading: true`):

```typescript
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
				notificationsEnabled: false,
				notifyDaysBeforeExpiry: 3,
				notifyHourLocal: 8,
				notifyTimezone: "America/Sao_Paulo",
			},
			loading: true,
		});
```

- [x] **Step 9: Fix the backup feature's ripple — `backupSettingsSchema`**

Without this fix, exporting a backup while notification settings are configured and then re-importing it silently wipes those settings from Firestore (`importBackup`'s `setDoc` is a full, non-merge replace, and Zod strips fields not declared on `backupSettingsSchema`). In `src/features/backup/schema.ts`, replace `backupSettingsSchema`:

```typescript
const backupSettingsSchema = z.object({
	lowStockThreshold: z.number().int().positive(),
	language: z.enum(["pt-br", "en-us"]),
	hideDistantThresholdMonths: z.number().int().positive(),
	notificationsEnabled: z.boolean(),
	notifyDaysBeforeExpiry: z.number().int().positive(),
	notifyHourLocal: z.number().int().min(0).max(23),
	notifyTimezone: z.string().min(1),
});
```

(Required, no `.catch()` — matches the existing 3 fields' strictness: a malformed backup *file* should fail loudly, unlike a live Firestore doc.)

- [x] **Step 10: Fix `backup/schema.test.ts`'s `validBackup` fixture**

In `src/features/backup/schema.test.ts`, add the 4 fields to `validBackup.settings`:

```typescript
const validBackup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 3,
		language: "pt-br" as const,
		hideDistantThresholdMonths: 3,
		notificationsEnabled: false,
		notifyDaysBeforeExpiry: 3,
		notifyHourLocal: 8,
		notifyTimezone: "America/Sao_Paulo",
	},
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [
		{
			name: "Milk",
			category: "foods",
			quantity: 2,
			expiringDate: "2026-09-01T00:00:00.000Z",
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		},
	],
	itemHistory: [
		{ name: "Milk", category: "foods", duration: "7", recurring: true },
	],
};
```

Every test in this file reuses `validBackup` via spread/reference, so this one fixture edit is sufficient — no other line in this file changes.

- [x] **Step 11: Fix `backup/exportBackup.test.ts`'s two settings assertions**

In `src/features/backup/exportBackup.test.ts`, the first test's seeded settings doc only writes 3 fields, so `buildBackup`'s output gets the 4 notification defaults via `parseSettingsDoc`'s `.catch()` — update the assertion:

```typescript
		expect(backup.settings).toEqual({
			lowStockThreshold: 5,
			language: "en-us",
			hideDistantThresholdMonths: 6,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
```

The second test ("defaults settings to the standard threshold when no settings doc exists yet"):

```typescript
	it("defaults settings to the standard threshold when no settings doc exists yet", async () => {
		const backup = await buildBackup(uid);
		expect(backup.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});
```

The third test (`itemHistory`-focused) is unaffected.

- [x] **Step 12: Fix `backup/importBackup.test.ts`'s fixture and assertion**

In `src/features/backup/importBackup.test.ts`, the `backup` fixture's `settings` object needs the 4 fields (now required by `backupSettingsSchema`):

```typescript
const backup: Backup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 5,
		language: "en-us",
		hideDistantThresholdMonths: 3,
		notificationsEnabled: true,
		notifyDaysBeforeExpiry: 5,
		notifyHourLocal: 20,
		notifyTimezone: "America/New_York",
	},
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [
		{
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiringDate: "2026-09-01T00:00:00.000Z",
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		},
	],
	itemHistory: [
		{ name: "Whole Milk", category: "foods", duration: "7", recurring: true },
	],
};
```

And the assertion in the test body:

```typescript
		const settingsSnap = await getDoc(doc(db, "users", uid));
		expect(settingsSnap.data()).toEqual({
			lowStockThreshold: 5,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 5,
			notifyHourLocal: 20,
			notifyTimezone: "America/New_York",
		});
```

- [x] **Step 13: Fix `BackupSection.test.tsx`'s two fixtures**

In `src/features/settings/BackupSection.test.tsx`, both `fixtureBackup` and `fixtureImportBackup`'s `settings` objects need the 4 fields. `fixtureBackup`:

```typescript
const fixtureBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 3,
		language: "pt-br" as const,
		hideDistantThresholdMonths: 3,
		notificationsEnabled: false,
		notifyDaysBeforeExpiry: 3,
		notifyHourLocal: 8,
		notifyTimezone: "America/Sao_Paulo",
	},
	categories: [],
	items: [],
	itemHistory: [],
};
```

`fixtureImportBackup`:

```typescript
const fixtureImportBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 5,
		language: "en-us" as const,
		hideDistantThresholdMonths: 3,
		notificationsEnabled: false,
		notifyDaysBeforeExpiry: 3,
		notifyHourLocal: 8,
		notifyTimezone: "America/Sao_Paulo",
	},
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [],
	itemHistory: [],
};
```

- [x] **Step 14: Run the full test suite and verify everything is green**

```bash
npm run format
npm run lint
npm test
```

Expected: all tests pass, including every file touched above.

- [x] **Step 15: Commit**

```bash
git add src/features/settings src/features/backup src/routes/app-route.test.tsx
git commit -m "feat: add notification settings fields, fix backup schema ripple"
```

---

### Task 2: `lastNotifiedAt` on `PantryItem`

**Files:**
- Modify: `src/features/pantry-items/schema.ts`, `src/features/pantry-items/schema.test.ts`

**Interfaces:**
- Produces: `PantryItem.lastNotifiedAt?: Date | null` (optional — see rationale below). `toItemDoc` writes `last_notified_at`.

**Design note:** `lastNotifiedAt` is made *optional* on the `PantryItem` interface, unlike `barcode`/`source` (which are required). This is deliberate: `barcode`/`source` are user-relevant fields every write call site was updated to set explicitly (Phase 5). `lastNotifiedAt` is pure server-bookkeeping metadata nothing in the client ever reads or needs to set — making it optional means zero ripple into `AddItemModal.tsx`, `EditItemModal.tsx`, `firestoreWrites.ts`'s `setItemRecurring` call site, or any of the half-dozen test files across `pantry-items/` that construct `PantryItem`-shaped literals (confirmed by inspecting `setItemRecurring`'s existing test call site, which passes a full `PantryItem` literal without this field — a required field there would force yet another wide ripple for a field the client never actually needs to reason about).

- [x] **Step 1: Write failing tests**

In `src/features/pantry-items/schema.test.ts`, update the first `parseItemDoc` test to include `last_notified_at`, and add one new test:

```typescript
describe("parseItemDoc", () => {
	it("parses a valid item document, converting Timestamps to Dates", () => {
		const expiringDate = Timestamp.fromDate(new Date("2026-09-01T23:59:59Z"));
		const lastNotifiedAt = Timestamp.fromDate(new Date("2026-08-20T08:00:00Z"));
		const result = parseItemDoc("item1", {
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiring_date: expiringDate,
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
			last_notified_at: lastNotifiedAt,
		});
		expect(result.expiringDate).toEqual(expiringDate.toDate());
		expect(result.name).toBe("Whole Milk");
		expect(result.source).toBe("manual");
		expect(result.lastNotifiedAt).toEqual(lastNotifiedAt.toDate());
	});

	it("defaults source to manual and barcode/lastNotifiedAt to null when absent", () => {
		const result = parseItemDoc("item1", {
			name: "Aspirin",
			category: "medicines",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result.source).toBe("manual");
		expect(result.barcode).toBeNull();
		expect(result.lastNotifiedAt).toBeNull();
	});
});

describe("toItemDoc", () => {
	it("converts a domain item back to Firestore field shape", () => {
		const doc = toItemDoc({
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiringDate: new Date("2026-09-01T23:59:59Z"),
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		});
		expect(doc.expiring_date).toBeInstanceOf(Timestamp);
		expect(doc.name).toBe("Whole Milk");
		expect(doc.last_notified_at).toBeNull();
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

Expected: FAIL — `last_notified_at` doesn't exist yet on the schema/output.

- [x] **Step 3: Update `schema.ts`**

In `src/features/pantry-items/schema.ts`, add `last_notified_at` to `itemDocSchema`, `lastNotifiedAt?: Date | null` to `PantryItem`, and handle both in `parseItemDoc`/`toItemDoc`:

```typescript
export const itemDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	quantity: z.number().int().nonnegative(),
	expiring_date: timestampSchema,
	duration: z.number().int().positive().nullable(),
	date_opened: timestampSchema.nullable(),
	opened: z.boolean(),
	recurring: z.boolean(),
	barcode: z.string().nullable().optional(),
	source: z.enum(["manual", "barcode"]).optional(),
	last_notified_at: timestampSchema.nullable().optional(),
});

export interface PantryItem {
	id: string;
	name: string;
	category: string;
	quantity: number;
	expiringDate: Date;
	duration: number | null;
	dateOpened: Date | null;
	opened: boolean;
	recurring: boolean;
	barcode: string | null;
	source: "manual" | "barcode";
	lastNotifiedAt?: Date | null;
}

export function parseItemDoc(id: string, data: unknown): PantryItem {
	const parsed = itemDocSchema.parse(data);
	return {
		id,
		name: parsed.name,
		category: parsed.category,
		quantity: parsed.quantity,
		expiringDate: parsed.expiring_date.toDate(),
		duration: parsed.duration,
		dateOpened: parsed.date_opened ? parsed.date_opened.toDate() : null,
		opened: parsed.opened,
		recurring: parsed.recurring,
		barcode: parsed.barcode ?? null,
		source: parsed.source ?? "manual",
		lastNotifiedAt: parsed.last_notified_at ? parsed.last_notified_at.toDate() : null,
	};
}

export function toItemDoc(item: Omit<PantryItem, "id">) {
	return {
		name: item.name,
		category: item.category,
		quantity: item.quantity,
		expiring_date: Timestamp.fromDate(item.expiringDate),
		duration: item.duration,
		date_opened: item.dateOpened ? Timestamp.fromDate(item.dateOpened) : null,
		opened: item.opened,
		recurring: item.recurring,
		barcode: item.barcode,
		source: item.source,
		last_notified_at: item.lastNotifiedAt
			? Timestamp.fromDate(item.lastNotifiedAt)
			: null,
	};
}
```

Nothing else in this file (the `item_history` schema/functions below `toItemDoc`) changes.

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/pantry-items/schema.ts src/features/pantry-items/schema.test.ts
git commit -m "feat: add lastNotifiedAt to PantryItem"
```

---

### Task 3: `notifications` feature scaffolding — `fcm_tokens` schema, writes, device id

**Files:**
- Create: `src/features/notifications/schema.ts`, `src/features/notifications/schema.test.ts`, `src/features/notifications/firestoreWrites.ts`, `src/features/notifications/firestoreWrites.test.ts`, `src/features/notifications/deviceId.ts`, `src/features/notifications/deviceId.test.ts`

**Interfaces:**
- Produces:
  - `interface FcmToken { token: string; updatedAt: Date }`
  - `parseFcmTokenDoc(data: unknown): FcmToken`, `toFcmTokenDoc(fcmToken: { token: string }): object`
  - `upsertFcmToken(uid: string, deviceId: string, token: string): Promise<void>`
  - `deleteFcmToken(uid: string, deviceId: string): Promise<void>`
  - `getDeviceId(): string`

- [x] **Step 1: Write failing tests for the schema**

`src/features/notifications/schema.test.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseFcmTokenDoc, toFcmTokenDoc } from "./schema";

describe("parseFcmTokenDoc", () => {
	it("parses a valid fcm_tokens document", () => {
		const now = Timestamp.now();
		const result = parseFcmTokenDoc({ token: "abc123", updatedAt: now });
		expect(result).toEqual({ token: "abc123", updatedAt: now.toDate() });
	});

	it("rejects a document missing required fields", () => {
		expect(() => parseFcmTokenDoc({})).toThrow();
	});
});

describe("toFcmTokenDoc", () => {
	it("produces a Firestore-shaped payload with a fresh updatedAt Timestamp", () => {
		const result = toFcmTokenDoc({ token: "abc123" });
		expect(result.token).toBe("abc123");
		expect(result.updatedAt).toBeInstanceOf(Timestamp);
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/notifications/schema.test.ts
```

Expected: FAIL — `./schema` doesn't exist yet.

- [x] **Step 3: Implement the schema**

`src/features/notifications/schema.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>(
	(val) => val instanceof Timestamp,
	{ message: "Expected a Firestore Timestamp" },
);

export const fcmTokenDocSchema = z.object({
	token: z.string().min(1),
	updatedAt: timestampSchema,
});

export interface FcmToken {
	token: string;
	updatedAt: Date;
}

export function parseFcmTokenDoc(data: unknown): FcmToken {
	const parsed = fcmTokenDocSchema.parse(data);
	return { token: parsed.token, updatedAt: parsed.updatedAt.toDate() };
}

export function toFcmTokenDoc(fcmToken: Omit<FcmToken, "updatedAt">) {
	return { token: fcmToken.token, updatedAt: Timestamp.now() };
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/notifications/schema.test.ts
```

- [x] **Step 5: Write failing tests for the write functions**

`src/features/notifications/firestoreWrites.test.ts`:

```typescript
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { deleteFcmToken, upsertFcmToken } from "./firestoreWrites";

const uid = "test-user-fcm-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("upsertFcmToken", () => {
	it("writes a new fcm_tokens doc", async () => {
		await upsertFcmToken(uid, "device-1", "token-abc");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.exists()).toBe(true);
		expect(snapshot.data()?.token).toBe("token-abc");
	});

	it("overwrites an existing doc for the same device", async () => {
		await upsertFcmToken(uid, "device-1", "token-old");
		await upsertFcmToken(uid, "device-1", "token-new");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.data()?.token).toBe("token-new");
	});
});

describe("deleteFcmToken", () => {
	it("removes the device's fcm_tokens doc", async () => {
		await setDoc(doc(db, "users", uid, "fcm_tokens", "device-1"), {
			token: "token-abc",
			updatedAt: new Date(),
		});
		await deleteFcmToken(uid, "device-1");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.exists()).toBe(false);
	});
});
```

- [x] **Step 6: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/notifications/firestoreWrites.test.ts"
```

Expected: FAIL — `./firestoreWrites` doesn't exist yet.

- [x] **Step 7: Implement the write functions**

`src/features/notifications/firestoreWrites.ts`:

```typescript
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toFcmTokenDoc } from "./schema";

export async function upsertFcmToken(
	uid: string,
	deviceId: string,
	token: string,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid, "fcm_tokens", deviceId),
		toFcmTokenDoc({ token }),
	);
}

export async function deleteFcmToken(
	uid: string,
	deviceId: string,
): Promise<void> {
	await deleteDoc(doc(db, "users", uid, "fcm_tokens", deviceId));
}
```

- [x] **Step 8: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/notifications/firestoreWrites.test.ts"
```

- [x] **Step 9: Write a failing test for `getDeviceId`**

`src/features/notifications/deviceId.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { getDeviceId } from "./deviceId";

afterEach(() => {
	localStorage.clear();
});

describe("getDeviceId", () => {
	it("generates and persists a device id on first call", () => {
		const id = getDeviceId();
		expect(id).toBeTruthy();
		expect(localStorage.getItem("expiring-products-device-id")).toBe(id);
	});

	it("returns the same id on subsequent calls", () => {
		const first = getDeviceId();
		const second = getDeviceId();
		expect(second).toBe(first);
	});
});
```

- [x] **Step 10: Run it, verify it fails**

```bash
npx vitest run src/features/notifications/deviceId.test.ts
```

Expected: FAIL — `./deviceId` doesn't exist yet.

- [x] **Step 11: Implement `getDeviceId`**

`src/features/notifications/deviceId.ts`:

```typescript
const DEVICE_ID_STORAGE_KEY = "expiring-products-device-id";

export function getDeviceId(): string {
	const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
	if (existing) return existing;
	const deviceId = crypto.randomUUID();
	localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
	return deviceId;
}
```

- [x] **Step 12: Run it, verify it passes**

```bash
npx vitest run src/features/notifications/deviceId.test.ts
```

- [x] **Step 13: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/notifications/schema.ts src/features/notifications/schema.test.ts \
  src/features/notifications/firestoreWrites.ts src/features/notifications/firestoreWrites.test.ts \
  src/features/notifications/deviceId.ts src/features/notifications/deviceId.test.ts
git commit -m "feat: add fcm_tokens schema, writes, and device id helper"
```

---

### Task 4: Combined service worker (Workbox + Firebase Messaging)

**Files:**
- Create: `src/sw.ts`, `tsconfig.sw.json`
- Modify: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a single service worker that both precaches the app shell (replacing Phase 4's `generateSW`-only behavior) and handles background push via `onBackgroundMessage`. Later tasks (5) rely on `navigator.serviceWorker.ready` resolving to this combined worker.

- [x] **Step 1: Install the new dependencies**

```bash
npm install -D workbox-precaching workbox-core
```

- [x] **Step 2: Switch `vite-plugin-pwa` to `injectManifest` mode**

Replace `vite.config.ts` in full:

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Produtos a vencer',
        short_name: 'Produtos a vencer',
        theme_color: '#6e6197',
        background_color: '#212529',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
```

- [x] **Step 3: Write the combined service worker**

`src/sw.ts`:

```typescript
/// <reference lib="webworker" />
export {};

// vite-plugin-pwa's injectManifest strategy injects the precache list into
// self.__WB_MANIFEST at build time; no ambient type declares this global, so
// it's declared here directly (a standard pattern for this plugin).
declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

// injectManifest (unlike generateSW) doesn't auto-wire registerType:
// 'autoUpdate' behavior — these two calls replicate it manually.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
	const title = payload.notification?.title ?? "Produtos a vencer";
	const body = payload.notification?.body;
	self.registration.showNotification(title, { body });
});
```

- [x] **Step 4: Add `tsconfig.sw.json`**

Create `tsconfig.sw.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.sw.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "WebWorker"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/sw.ts"]
}
```

- [x] **Step 5: Exclude `src/sw.ts` from `tsconfig.app.json`**

`tsconfig.app.json`'s `lib` is `["ES2023", "DOM"]` — `DOM` and `WebWorker` libs conflict when applied to the same file (both declare incompatible globals like `self`), so `src/sw.ts` must be excluded from the app's own program. Add an `"exclude"` key:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/sw.ts"]
}
```

- [x] **Step 6: Add the new reference to the root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.sw.json" }
  ]
}
```

(`tsconfig.scripts.json`'s reference is added in Task 8, once that file exists.)

- [x] **Step 7: Build and verify the service worker output**

```bash
npm run build
```

Expected: succeeds. Then inspect the built output to confirm both halves of the combined worker are present:

```bash
grep -c "precacheAndRoute\|workbox" dist/sw.js
grep -c "import.meta.env" dist/sw.js
```

Expected: the first command finds workbox-related code (precaching wired in); the second finds `0` — if `import.meta.env` literally appears in the built output, Vite did not replace the env vars in the service worker build and the Firebase config would be `undefined` at runtime. If that happens, this is the one design element flagged in the spec as needing hands-on verification — investigate `injectManifest`'s build options (`VitePWA({ injectManifest: { ... } })`) rather than treating it as unsolvable; do not proceed to Task 5 until `dist/sw.js` contains real config values.

- [x] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add vite.config.ts src/sw.ts tsconfig.sw.json tsconfig.app.json tsconfig.json package.json package-lock.json
git commit -m "feat: combine Workbox precaching and Firebase Messaging into one service worker"
```

---

### Task 5: Client messaging wrapper

**Files:**
- Create: `src/features/notifications/messaging.ts`, `src/features/notifications/messaging.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `upsertFcmToken`, `deleteFcmToken` (Task 3); `getDeviceId` (Task 3); `app` (existing export from `src/lib/firebase.ts`).
- Produces: `requestNotificationPermission(): Promise<boolean>`, `registerForPush(uid: string): Promise<void>`, `unregisterFromPush(uid: string): Promise<void>`, `onForegroundMessage(callback: (title: string, body: string) => void): () => void`.

- [x] **Step 1: Add the VAPID key to `.env.example`**

Append to `.env.example`:

```
VITE_FIREBASE_VAPID_KEY=
```

(This is the public half of Firebase's Web Push certificate key pair — safe to expose client-side, same as the other `VITE_FIREBASE_*` values.)

- [x] **Step 2: Write failing tests**

`src/features/notifications/messaging.test.ts`:

```typescript
import * as messagingSdk from "firebase/messaging";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as deviceIdModule from "./deviceId";
import * as firestoreWritesModule from "./firestoreWrites";
import {
	onForegroundMessage,
	registerForPush,
	requestNotificationPermission,
	unregisterFromPush,
} from "./messaging";

vi.mock("firebase/messaging");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("requestNotificationPermission", () => {
	it("returns true when supported and permission is granted", async () => {
		vi.mocked(messagingSdk.isSupported).mockResolvedValue(true);
		Object.defineProperty(globalThis, "Notification", {
			value: { requestPermission: vi.fn().mockResolvedValue("granted") },
			configurable: true,
		});

		await expect(requestNotificationPermission()).resolves.toBe(true);
	});

	it("returns false when messaging is not supported", async () => {
		vi.mocked(messagingSdk.isSupported).mockResolvedValue(false);

		await expect(requestNotificationPermission()).resolves.toBe(false);
	});
});

describe("registerForPush", () => {
	it("gets a token and upserts it for this device", async () => {
		vi.spyOn(deviceIdModule, "getDeviceId").mockReturnValue("device-1");
		const upsertSpy = vi
			.spyOn(firestoreWritesModule, "upsertFcmToken")
			.mockResolvedValue();
		vi.mocked(messagingSdk.getToken).mockResolvedValue("fake-token");
		Object.defineProperty(navigator, "serviceWorker", {
			value: { ready: Promise.resolve({}) },
			configurable: true,
		});

		await registerForPush("uid-1");

		expect(upsertSpy).toHaveBeenCalledWith("uid-1", "device-1", "fake-token");
	});
});

describe("unregisterFromPush", () => {
	it("deletes the FCM token and this device's Firestore doc", async () => {
		vi.spyOn(deviceIdModule, "getDeviceId").mockReturnValue("device-1");
		const deleteSpy = vi
			.spyOn(firestoreWritesModule, "deleteFcmToken")
			.mockResolvedValue();
		vi.mocked(messagingSdk.deleteToken).mockResolvedValue(true);

		await unregisterFromPush("uid-1");

		expect(deleteSpy).toHaveBeenCalledWith("uid-1", "device-1");
	});
});

describe("onForegroundMessage", () => {
	it("invokes the callback with the notification title and body", () => {
		let capturedHandler: ((payload: unknown) => void) | undefined;
		vi.mocked(messagingSdk.onMessage).mockImplementation(
			(_messaging, handler) => {
				capturedHandler = handler as (payload: unknown) => void;
				return () => {};
			},
		);

		const callback = vi.fn();
		onForegroundMessage(callback);
		capturedHandler?.({
			notification: { title: "Milk", body: "Expiring soon" },
		});

		expect(callback).toHaveBeenCalledWith("Milk", "Expiring soon");
	});
});
```

- [x] **Step 3: Run it, verify it fails**

```bash
npx vitest run src/features/notifications/messaging.test.ts
```

Expected: FAIL — `./messaging` doesn't exist yet.

- [x] **Step 4: Implement the messaging wrapper**

`src/features/notifications/messaging.ts`:

```typescript
import {
	deleteToken,
	getMessaging,
	getToken,
	isSupported,
	onMessage,
} from "firebase/messaging";
import { app } from "../../lib/firebase";
import { deleteFcmToken, upsertFcmToken } from "./firestoreWrites";
import { getDeviceId } from "./deviceId";

export async function requestNotificationPermission(): Promise<boolean> {
	if (!(await isSupported())) return false;
	const permission = await Notification.requestPermission();
	return permission === "granted";
}

export async function registerForPush(uid: string): Promise<void> {
	const registration = await navigator.serviceWorker.ready;
	const messaging = getMessaging(app);
	const token = await getToken(messaging, {
		vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	await upsertFcmToken(uid, getDeviceId(), token);
}

export async function unregisterFromPush(uid: string): Promise<void> {
	const messaging = getMessaging(app);
	await deleteToken(messaging);
	await deleteFcmToken(uid, getDeviceId());
}

export function onForegroundMessage(
	callback: (title: string, body: string) => void,
): () => void {
	const messaging = getMessaging(app);
	return onMessage(messaging, (payload) => {
		callback(payload.notification?.title ?? "", payload.notification?.body ?? "");
	});
}
```

**Real bug found while implementing Task 6 (wiring this into `AppRoute`), not anticipated during planning:** `getMessaging()`/`onMessage()` don't throw synchronously for an unsupported browser — the `messaging/unsupported-browser` error only surfaces once Messaging's internal async support check rejects, as an *unhandled promise rejection* vitest flagged during `app-route.test.tsx`'s run (jsdom has no Messaging support). `AppRoute`'s synchronous `try/catch` around this function's call could never catch that. Fixed by having `onForegroundMessage` itself gate on the async `isSupported()` check (mirroring `requestNotificationPermission`) before ever calling `getMessaging`/`onMessage`, returning a synchronous unsubscribe function regardless of whether the async setup ever completes:

```typescript
export function onForegroundMessage(
	callback: (title: string, body: string) => void,
): () => void {
	let unsubscribe: (() => void) | undefined;
	let cancelled = false;

	isSupported()
		.then((supported) => {
			if (!supported || cancelled) return;
			const messaging = getMessaging(app);
			unsubscribe = onMessage(messaging, (payload) => {
				callback(
					payload.notification?.title ?? "",
					payload.notification?.body ?? "",
				);
			});
		})
		.catch(() => {
			// Messaging unsupported or failed to initialize — no foreground
			// notifications this session, nothing else to do.
		});

	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}
```

This also required a matching test-suite fix: `messaging.test.ts`'s `afterEach` only had `vi.restoreAllMocks()`, which does not reset call history on `vi.mock("firebase/messaging")`'s automocked exports (only spies created via `vi.spyOn`) — a later test's "not called" assertion on `onMessage` saw an earlier test's leftover call. Fixed by adding `vi.clearAllMocks()` alongside it.

- [x] **Step 5: Run it, verify it passes**

```bash
npx vitest run src/features/notifications/messaging.test.ts
```

- [x] **Step 6: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/notifications/messaging.ts src/features/notifications/messaging.test.ts .env.example
git commit -m "feat: add client-side push registration wrapper"
```

---

### Task 6: `NotificationSection` UI, `SettingsPane`/`AppRoute` wiring, locale keys

**Files:**
- Create: `src/features/settings/NotificationSection.tsx`, `src/features/settings/NotificationSection.test.tsx`
- Modify: `src/features/settings/SettingsPane.tsx`, `src/routes/app-route.tsx`, `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `requestNotificationPermission`, `registerForPush`, `unregisterFromPush`, `onForegroundMessage` (Task 5); `updateNotificationsEnabled`, `updateNotifyDaysBeforeExpiry`, `updateNotifyHourLocal` (Task 1); `Settings` (Task 1).
- Produces: `NotificationSection({ uid, settings }: { uid: string; settings: Settings })`.

- [x] **Step 1: Add locale keys**

Add to the `"settings"` object in **both** locale files.

`src/locales/en-us.json`:
```json
"notificationsEnabled": "Notifications",
"notifyDaysBeforeExpiry": "Notify how many days before expiry",
"notifyHourLocal": "Notification time (local hour)",
"notificationsPermissionDenied": "Notification permission denied. You can enable it in your browser settings."
```

`src/locales/pt-br.json`:
```json
"notificationsEnabled": "Notificações",
"notifyDaysBeforeExpiry": "Avisar quantos dias antes de vencer",
"notifyHourLocal": "Horário do aviso (hora local)",
"notificationsPermissionDenied": "Permissão de notificação negada. Você pode habilitá-la nas configurações do navegador."
```

- [x] **Step 2: Write failing tests**

`src/features/settings/NotificationSection.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as messagingModule from "../notifications/messaging";
import { NotificationSection } from "./NotificationSection";
import * as settingsWritesModule from "./firestoreWrites";
import type { Settings } from "./schema";

const settings: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
	notificationsEnabled: false,
	notifyDaysBeforeExpiry: 3,
	notifyHourLocal: 8,
	notifyTimezone: "America/Sao_Paulo",
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("NotificationSection", () => {
	it("registers for push and enables notifications when permission is granted", async () => {
		vi.spyOn(messagingModule, "requestNotificationPermission").mockResolvedValue(
			true,
		);
		const registerSpy = vi
			.spyOn(messagingModule, "registerForPush")
			.mockResolvedValue();
		vi.spyOn(settingsWritesModule, "updateNotifyHourLocal").mockResolvedValue();
		const enableSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(<NotificationSection uid="test-user-notif-1" settings={settings} />);
		await userEvent.click(
			screen.getByRole("switch", { name: /notifica/i }),
		);

		await waitFor(() =>
			expect(registerSpy).toHaveBeenCalledWith("test-user-notif-1"),
		);
		expect(enableSpy).toHaveBeenCalledWith("test-user-notif-1", true);
	});

	it("shows an inline message and does not register when permission is denied", async () => {
		vi.spyOn(messagingModule, "requestNotificationPermission").mockResolvedValue(
			false,
		);
		const registerSpy = vi
			.spyOn(messagingModule, "registerForPush")
			.mockResolvedValue();

		render(<NotificationSection uid="test-user-notif-2" settings={settings} />);
		await userEvent.click(
			screen.getByRole("switch", { name: /notifica/i }),
		);

		expect(await screen.findByText(/permiss/i)).toBeInTheDocument();
		expect(registerSpy).not.toHaveBeenCalled();
	});

	it("unregisters and disables notifications when toggled off", async () => {
		const unregisterSpy = vi
			.spyOn(messagingModule, "unregisterFromPush")
			.mockResolvedValue();
		const disableSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(
			<NotificationSection
				uid="test-user-notif-3"
				settings={{ ...settings, notificationsEnabled: true }}
			/>,
		);
		await userEvent.click(
			screen.getByRole("switch", { name: /notifica/i }),
		);

		await waitFor(() =>
			expect(unregisterSpy).toHaveBeenCalledWith("test-user-notif-3"),
		);
		expect(disableSpy).toHaveBeenCalledWith("test-user-notif-3", false);
	});
});
```

- [x] **Step 3: Run it, verify it fails**

```bash
npx vitest run src/features/settings/NotificationSection.test.tsx
```

Expected: FAIL — `./NotificationSection` doesn't exist yet.

- [x] **Step 4: Implement `NotificationSection`**

`src/features/settings/NotificationSection.tsx`:

```tsx
import { Form, InputNumber, Switch, message } from "antd";
import type { FocusEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	registerForPush,
	requestNotificationPermission,
	unregisterFromPush,
} from "../notifications/messaging";
import {
	updateNotificationsEnabled,
	updateNotifyDaysBeforeExpiry,
	updateNotifyHourLocal,
} from "./firestoreWrites";
import type { Settings } from "./schema";

const MIN_NOTIFY_DAYS_BEFORE_EXPIRY = 1;
const MIN_NOTIFY_HOUR_LOCAL = 0;
const MAX_NOTIFY_HOUR_LOCAL = 23;

export function NotificationSection({
	uid,
	settings,
}: {
	uid: string;
	settings: Settings;
}) {
	const { t } = useTranslation();
	const [permissionError, setPermissionError] = useState(false);

	// Render-time resync pattern (see SettingsPane.tsx) — not a useEffect, to
	// avoid react-hooks/set-state-in-effect and an extra commit.
	const [daysValue, setDaysValue] = useState(settings.notifyDaysBeforeExpiry);
	const [prevDays, setPrevDays] = useState(settings.notifyDaysBeforeExpiry);
	if (prevDays !== settings.notifyDaysBeforeExpiry) {
		setPrevDays(settings.notifyDaysBeforeExpiry);
		setDaysValue(settings.notifyDaysBeforeExpiry);
	}

	const [hourValue, setHourValue] = useState(settings.notifyHourLocal);
	const [prevHour, setPrevHour] = useState(settings.notifyHourLocal);
	if (prevHour !== settings.notifyHourLocal) {
		setPrevHour(settings.notifyHourLocal);
		setHourValue(settings.notifyHourLocal);
	}

	const handleToggle = async (checked: boolean) => {
		setPermissionError(false);
		if (!checked) {
			try {
				await unregisterFromPush(uid);
				await updateNotificationsEnabled(uid, false);
			} catch {
				message.error("Something went wrong, please try again");
			}
			return;
		}

		const granted = await requestNotificationPermission();
		if (!granted) {
			setPermissionError(true);
			return;
		}
		try {
			await registerForPush(uid);
			await updateNotifyHourLocal(
				uid,
				settings.notifyHourLocal,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
			await updateNotificationsEnabled(uid, true);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleDaysBlur = async (event: FocusEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		const committed = Number.isNaN(parsed)
			? daysValue
			: Math.max(MIN_NOTIFY_DAYS_BEFORE_EXPIRY, Math.round(parsed));
		setDaysValue(committed);
		if (committed === settings.notifyDaysBeforeExpiry) return;
		try {
			await updateNotifyDaysBeforeExpiry(uid, committed);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHourBlur = async (event: FocusEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		const committed = Number.isNaN(parsed)
			? hourValue
			: Math.min(
					MAX_NOTIFY_HOUR_LOCAL,
					Math.max(MIN_NOTIFY_HOUR_LOCAL, Math.round(parsed)),
				);
		setHourValue(committed);
		if (committed === settings.notifyHourLocal) return;
		try {
			await updateNotifyHourLocal(
				uid,
				committed,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<>
			<Form.Item label={t("settings.notificationsEnabled")}>
				<Switch
					checked={settings.notificationsEnabled}
					onChange={handleToggle}
					aria-label={t("settings.notificationsEnabled")}
				/>
				{permissionError && <div>{t("settings.notificationsPermissionDenied")}</div>}
			</Form.Item>
			<Form.Item label={t("settings.notifyDaysBeforeExpiry")}>
				<InputNumber
					min={MIN_NOTIFY_DAYS_BEFORE_EXPIRY}
					precision={0}
					value={daysValue}
					onChange={(newValue) =>
						setDaysValue(newValue ?? MIN_NOTIFY_DAYS_BEFORE_EXPIRY)
					}
					onBlur={handleDaysBlur}
					aria-label={t("settings.notifyDaysBeforeExpiry")}
					style={{ width: "100%" }}
				/>
			</Form.Item>
			<Form.Item label={t("settings.notifyHourLocal")}>
				<InputNumber
					min={MIN_NOTIFY_HOUR_LOCAL}
					max={MAX_NOTIFY_HOUR_LOCAL}
					precision={0}
					value={hourValue}
					onChange={(newValue) => setHourValue(newValue ?? MIN_NOTIFY_HOUR_LOCAL)}
					onBlur={handleHourBlur}
					aria-label={t("settings.notifyHourLocal")}
					style={{ width: "100%" }}
				/>
			</Form.Item>
		</>
	);
}
```

- [x] **Step 5: Run it, verify it passes**

```bash
npx vitest run src/features/settings/NotificationSection.test.tsx
```

- [x] **Step 6: Mount `NotificationSection` in `SettingsPane`**

In `src/features/settings/SettingsPane.tsx`, add the import and mount it after the hide-distant threshold field, before `<BackupSection uid={uid} />`:

```typescript
import { NotificationSection } from "./NotificationSection";
```

```tsx
			<NotificationSection uid={uid} settings={settings} />
			<BackupSection uid={uid} />
```

- [x] **Step 7: Subscribe to foreground messages in `AppRoute`**

In `src/routes/app-route.tsx`, add the import and a mount-time subscription. `getMessaging()` can throw synchronously in browsers without Messaging support (e.g. older Safari), so this is wrapped defensively — matching this codebase's established "degrade silently, never block the app" convention:

```typescript
import { notification } from "antd";
import { onForegroundMessage } from "../features/notifications/messaging";
```

```typescript
	useEffect(() => {
		try {
			return onForegroundMessage((title, body) => {
				notification.info({ message: title, description: body });
			});
		} catch {
			return undefined;
		}
	}, []);
```

Place this as a second `useEffect`, alongside the existing language-propagation one.

- [x] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/NotificationSection.tsx src/features/settings/NotificationSection.test.tsx \
  src/features/settings/SettingsPane.tsx src/routes/app-route.tsx \
  src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add notification settings UI and foreground message handling"
```

---

### Task 7: Server script pure functions (dedup, local-hour match, digest wording)

**Files:**
- Create: `scripts/notifications/logic.ts`, `scripts/notifications/logic.test.ts`

**Interfaces:**
- Produces:
  - `matchesLocalHour(nowUtc: Date, timezone: string, hourLocal: number): boolean`
  - `needsNotification(lastNotifiedAt: Date | null, now: Date, dedupDays: number): boolean`
  - `buildDigestBody(itemNames: string[], language: "pt-br" | "en-us"): { title: string; body: string }`

These are plain, dependency-free functions — no Firestore, no Admin SDK, no emulator needed for their tests.

- [x] **Step 1: Write failing tests**

`scripts/notifications/logic.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildDigestBody, matchesLocalHour, needsNotification } from "./logic";

describe("matchesLocalHour", () => {
	it("returns true when the current UTC time is the target local hour", () => {
		// 2026-01-15T11:00:00Z is 08:00 in America/Sao_Paulo (fixed UTC-3, no DST).
		const now = new Date("2026-01-15T11:00:00Z");
		expect(matchesLocalHour(now, "America/Sao_Paulo", 8)).toBe(true);
	});

	it("returns false outside the target local hour", () => {
		const now = new Date("2026-01-15T12:00:00Z");
		expect(matchesLocalHour(now, "America/Sao_Paulo", 8)).toBe(false);
	});
});

describe("needsNotification", () => {
	it("returns true when never notified", () => {
		expect(
			needsNotification(null, new Date("2026-01-15T00:00:00Z"), 7),
		).toBe(true);
	});

	it("returns false within the dedup window", () => {
		const lastNotifiedAt = new Date("2026-01-14T00:00:00Z");
		const now = new Date("2026-01-15T00:00:00Z");
		expect(needsNotification(lastNotifiedAt, now, 7)).toBe(false);
	});

	it("returns true once the dedup window has elapsed", () => {
		const lastNotifiedAt = new Date("2026-01-01T00:00:00Z");
		const now = new Date("2026-01-15T00:00:00Z");
		expect(needsNotification(lastNotifiedAt, now, 7)).toBe(true);
	});
});

describe("buildDigestBody", () => {
	it("builds pt-br wording", () => {
		const { title, body } = buildDigestBody(["Leite", "Ovos"], "pt-br");
		expect(title).toContain("2");
		expect(body).toBe("Leite, Ovos");
	});

	it("builds en-us wording", () => {
		const { title, body } = buildDigestBody(["Milk"], "en-us");
		expect(title).toContain("1");
		expect(body).toBe("Milk");
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run scripts/notifications/logic.test.ts
```

Expected: FAIL — `./logic` doesn't exist yet.

- [x] **Step 3: Implement `logic.ts`**

`scripts/notifications/logic.ts`:

```typescript
export function matchesLocalHour(
	nowUtc: Date,
	timezone: string,
	hourLocal: number,
): boolean {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour: "numeric",
		hourCycle: "h23",
	});
	const localHour = Number(formatter.format(nowUtc));
	return localHour === hourLocal;
}

export function needsNotification(
	lastNotifiedAt: Date | null,
	now: Date,
	dedupDays: number,
): boolean {
	if (lastNotifiedAt === null) return true;
	const elapsedMs = now.getTime() - lastNotifiedAt.getTime();
	return elapsedMs > dedupDays * 24 * 60 * 60 * 1000;
}

export function buildDigestBody(
	itemNames: string[],
	language: "pt-br" | "en-us",
): { title: string; body: string } {
	const title =
		language === "en-us"
			? `${itemNames.length} item(s) expiring soon`
			: `${itemNames.length} item(ns) vencendo em breve`;
	return { title, body: itemNames.join(", ") };
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run scripts/notifications/logic.test.ts
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npx vitest run scripts/notifications/logic.test.ts
```

(Biome's `biome check .` already scans the whole repo including `scripts/`, but ESLint's `files` glob is scoped to `src/**/*.{ts,tsx}` — `scripts/` is intentionally outside its scope, matching how `vite.config.ts`/`playwright.config.ts` are Biome-only today. `npm run lint` still runs clean since ESLint simply skips files outside its glob.)

```bash
git add scripts/notifications/logic.ts scripts/notifications/logic.test.ts
git commit -m "feat: add pure dedup/hour-match/digest-wording functions"
```

---

### Task 8: Server script orchestration, integration test, GitHub Actions workflow

**Files:**
- Create: `scripts/notifications/run.ts`, `scripts/notifications/run.integration.test.ts`, `tsconfig.scripts.json`, `.github/workflows/daily-notifications.yml`
- Modify: `tsconfig.json`, `package.json`

**Interfaces:**
- Consumes: `matchesLocalHour`, `needsNotification`, `buildDigestBody` (Task 7).
- Produces: `runDailyNotifications(db: Firestore, messaging: Messaging, now?: Date): Promise<void>`.

This task does NOT reuse `src/features/settings/schema.ts`'s `parseSettingsDoc`/`Settings` type — that file is part of the client app's own TypeScript program (`tsconfig.app.json`), and cross-importing it into the separately-configured `scripts/` program risks a `tsc -b` project-boundary error this plan can't fully verify without running it. Instead, `run.ts` reads the raw settings fields directly with inline defaults, matching `settingsDocSchema`'s own default values (kept in sync manually — both are small, static defaults unlikely to drift).

**Two real findings from actually running this task, not caught during planning:**
1. `tsconfig.scripts.json`'s `module: "nodenext"` requires explicit `.js` extensions on relative imports even though the source files are `.ts` (e.g. `import { ... } from "./logic.js"`, not `"./logic"`) — `tsc -b` fails with `TS2835` otherwise. This is standard TypeScript-with-Node-ESM behavior; `tsx` (and Vitest, for the test files) both correctly resolve the `.js` specifier back to the real `.ts` source at runtime.
2. `biome.json`'s `files.includes` was scoped to `["src/**/*.{ts,tsx}"]` only — **not** the whole repo, contrary to this plan's original assumption (wrongly inferred from `npm run lint`'s "Checked NN files" count, which was never actually verified against `scripts/`). `npm run format`/`npm run lint` silently skipped `scripts/` entirely. Fixed by widening `biome.json` to `["src/**/*.{ts,tsx}", "scripts/**/*.ts"]`. This surfaced two more real issues once scripts/ was actually linted: an import-sort violation in `run.ts` (fixed via `npx biome check --write`) and a genuine `lint/correctness/noUnsafeOptionalChaining` bug in the integration test below — `(x.data()?.field as T).method()` defeats the optional chain's short-circuit, so a `?.` short-circuiting to `undefined` still hits `.method()` and throws; fixed by extracting `.data()` into a variable and guarding it explicitly before the cast (see Step 3's final test file).

- [x] **Step 1: Add `tsconfig.scripts.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.scripts.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["scripts"]
}
```

Add its reference to the root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.sw.json" },
    { "path": "./tsconfig.scripts.json" }
  ]
}
```

- [x] **Step 2: Install `firebase-admin` and `tsx`**

```bash
npm install -D firebase-admin tsx
```

- [x] **Step 3: Write a failing integration test**

`scripts/notifications/run.integration.test.ts`:

```typescript
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { Messaging } from "firebase-admin/messaging";
import { afterAll, describe, expect, it, vi } from "vitest";
import { runDailyNotifications } from "./run.js";

// A hardcoded, test-only project id — deliberately isolated from the
// client SDK's VITE_FIREBASE_PROJECT_ID and its clearFirestoreEmulator
// convention (see this plan's Global Constraints).
const app = initializeApp({ projectId: "notifications-script-test" });
const db = getFirestore(app);

afterAll(async () => {
	await deleteApp(app);
});

describe("runDailyNotifications", () => {
	it("sends a digest and stamps lastNotifiedAt only for due items", async () => {
		const uid = "household-1";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const now = new Date("2026-01-15T11:00:00Z"); // 08:00 America/Sao_Paulo

		const dueItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("due-item");
		await dueItemRef.set({
			name: "Leite",
			opened: false,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: null,
		});

		const recentItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("recent-item");
		await recentItemRef.set({
			name: "Ovos",
			opened: false,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: Timestamp.fromDate(new Date("2026-01-14T00:00:00Z")),
		});

		const openedItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("opened-item");
		await openedItemRef.set({
			name: "Queijo",
			opened: true,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: null,
		});

		await db
			.collection("users")
			.doc(uid)
			.collection("fcm_tokens")
			.doc("device-1")
			.set({ token: "fake-token-1" });

		const send = vi.fn().mockResolvedValue("message-id");
		const messaging = { send } as unknown as Messaging;

		await runDailyNotifications(db, messaging, now);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				token: "fake-token-1",
				notification: expect.objectContaining({
					body: expect.stringContaining("Leite"),
				}),
			}),
		);

		const updatedDueItem = await dueItemRef.get();
		expect(updatedDueItem.data()?.last_notified_at).toBeTruthy();

		const updatedRecentItem = await recentItemRef.get();
		const recentItemData = updatedRecentItem.data();
		if (!recentItemData) throw new Error("expected recent-item to exist");
		expect((recentItemData.last_notified_at as Timestamp).toDate()).toEqual(
			new Date("2026-01-14T00:00:00Z"),
		); // unchanged — still within dedup window
	});

	it("sends nothing when notificationsEnabled is false", async () => {
		const uid = "household-2";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const send = vi.fn().mockResolvedValue("message-id");
		await runDailyNotifications(
			db,
			{ send } as unknown as Messaging,
			new Date("2026-01-15T11:00:00Z"),
		);

		expect(send).not.toHaveBeenCalled();
	});

	it("sends nothing when the current hour doesn't match notifyHourLocal", async () => {
		const uid = "household-3";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const send = vi.fn().mockResolvedValue("message-id");
		await runDailyNotifications(
			db,
			{ send } as unknown as Messaging,
			new Date("2026-01-15T12:00:00Z"), // 09:00 local, not 08:00
		);

		expect(send).not.toHaveBeenCalled();
	});
});
```

- [x] **Step 4: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run scripts/notifications/run.integration.test.ts"
```

Expected: FAIL — `./run` doesn't exist yet. (This file needs the emulator wrapper: the Firebase Admin SDK auto-connects to the Firestore emulator only when `FIRESTORE_EMULATOR_HOST` is set, which `firebase emulators:exec` sets automatically for the wrapped command — confirmed against Firebase's own emulator docs during planning. Running this file with plain `npx vitest run` will hang or fail trying to reach real GCP.)

- [x] **Step 5: Implement `run.ts`**

`scripts/notifications/run.ts`:

```typescript
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import {
	buildDigestBody,
	matchesLocalHour,
	needsNotification,
} from "./logic.js";

const DEDUP_DAYS = 7;

export async function runDailyNotifications(
	db: Firestore,
	messaging: Messaging,
	now: Date = new Date(),
): Promise<void> {
	const usersSnapshot = await db.collection("users").get();

	for (const userDoc of usersSnapshot.docs) {
		const settings = userDoc.data();
		const notificationsEnabled = settings.notificationsEnabled === true;
		if (!notificationsEnabled) continue;

		const notifyTimezone =
			typeof settings.notifyTimezone === "string"
				? settings.notifyTimezone
				: "America/Sao_Paulo";
		const notifyHourLocal =
			typeof settings.notifyHourLocal === "number"
				? settings.notifyHourLocal
				: 8;
		if (!matchesLocalHour(now, notifyTimezone, notifyHourLocal)) continue;

		const notifyDaysBeforeExpiry =
			typeof settings.notifyDaysBeforeExpiry === "number"
				? settings.notifyDaysBeforeExpiry
				: 3;
		const language = settings.language === "en-us" ? "en-us" : "pt-br";

		const uid = userDoc.id;
		const cutoff = new Date(
			now.getTime() + notifyDaysBeforeExpiry * 24 * 60 * 60 * 1000,
		);

		const itemsSnapshot = await db
			.collection("users")
			.doc(uid)
			.collection("items")
			.where("opened", "==", false)
			.where("expiring_date", "<=", cutoff)
			.get();

		const dueItems = itemsSnapshot.docs.filter((itemDoc) => {
			const data = itemDoc.data();
			const lastNotifiedAt = data.last_notified_at
				? (data.last_notified_at as { toDate: () => Date }).toDate()
				: null;
			return needsNotification(lastNotifiedAt, now, DEDUP_DAYS);
		});

		if (dueItems.length === 0) continue;

		const { title, body } = buildDigestBody(
			dueItems.map((itemDoc) => itemDoc.data().name as string),
			language,
		);

		const tokensSnapshot = await db
			.collection("users")
			.doc(uid)
			.collection("fcm_tokens")
			.get();

		for (const tokenDoc of tokensSnapshot.docs) {
			await messaging.send({
				token: tokenDoc.data().token as string,
				notification: { title, body },
			});
		}

		const batch = db.batch();
		for (const itemDoc of dueItems) {
			batch.update(itemDoc.ref, { last_notified_at: now });
		}
		await batch.commit();
	}
}

// Standard ESM "is this the entrypoint" check — runs the real send only when
// this file is executed directly (`tsx scripts/notifications/run.ts`), not
// when imported by the integration test above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const app = initializeApp({
		credential: cert(
			JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}"),
		),
		projectId: process.env.FIREBASE_PROJECT_ID,
	});
	await runDailyNotifications(getFirestore(app), getMessaging(app));
}
```

- [x] **Step 6: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run scripts/notifications/run.integration.test.ts"
```

If `initializeApp({ projectId: "notifications-script-test" })` errors for lacking a `credential`, add `credential: applicationDefault()` from `firebase-admin/app` to the test's `initializeApp` call — this is the one Admin-SDK-against-emulator-only detail this plan couldn't fully pin down without running it (noted here rather than left as a silent assumption).

- [x] **Step 7: Write the GitHub Actions workflow**

`.github/workflows/daily-notifications.yml`:

```yaml
name: Daily Expiry Notifications

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch: {}

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Send due notifications
        env:
          FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
          FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
        run: npx tsx scripts/notifications/run.ts
```

This workflow is committed but inert — this repo has no GitHub remote yet, and `secrets.FIREBASE_SERVICE_ACCOUNT_JSON`/`FIREBASE_PROJECT_ID` don't exist. Creating them is Phase 7's job (see this plan's Global Constraints and the spec's Deployment-scope decision).

- [x] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add scripts/notifications/run.ts scripts/notifications/run.integration.test.ts \
  tsconfig.scripts.json tsconfig.json .github/workflows/daily-notifications.yml \
  package.json package-lock.json
git commit -m "feat: add server-side digest script and GitHub Actions workflow"
```

---

### Task 9: E2e coverage and final verification

**Files:**
- Modify: `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full feature built in Tasks 1–8.

**Scope note, decided during planning, not left for discovery mid-task:** Firebase Messaging's `getToken`/`onMessage` are plain ES module imports inside `messaging.ts` — unlike the barcode feature's `window.BarcodeDetector` (a real global), there is no way for Playwright's `page.addInitScript` to intercept these from outside the app's bundle, since it can only touch `window`/`navigator` globals, not a bundled module's internal imports. There is also no Firebase emulator for Cloud Messaging (`firebase.json`'s emulator list only has `auth`/`firestore`/`ui`) — a real `getToken()` round trip cannot be exercised locally at all, in e2e or otherwise. The "permission granted → token registered" path is therefore already covered at the right layer, in Task 6's `NotificationSection.test.tsx` (which mocks the `messaging.ts` module directly, something only possible in Vitest/jsdom). This task's e2e case covers only the permission-denied path, which touches nothing but the real, reachable global `Notification` API.

- [x] **Step 1: Add the permission-denied e2e case**

Add to `e2e/core-loop.spec.ts`:

```typescript
test("denies notification permission gracefully, leaving the switch off with an inline message", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window.Notification, "requestPermission", {
			value: () => Promise.resolve("denied"),
			configurable: true,
		});
	});

	await page.goto("/");
	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-notif-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: "⚙️" }).click();
	const notifSwitch = page.getByRole("switch", { name: /notifica/i });
	await notifSwitch.click();

	await expect(page.getByText(/permiss/i)).toBeVisible();
	await expect(notifSwitch).not.toBeChecked();
});
```

Verify the `aria-label`/switch selector empirically against the real running app before trusting this — every prior phase's e2e task has found at least one brief-guessed selector needed adjusting after checking reality (this plan's `NotificationSection`'s `Switch` has `aria-label={t("settings.notificationsEnabled")}`, which resolves to pt-br's "Notificações" — the `/notifica/i` regex matches that).

- [x] **Step 2: Run it against the emulator**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (all existing cases plus the new one).

- [x] **Step 3: Run the full verification suite one more time**

```bash
npm run format
npm run lint
npm run build
npm test
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

All five must be clean before this task is considered done.

- [x] **Step 4: Commit**

```bash
git add e2e/core-loop.spec.ts
git commit -m "test: add e2e coverage for the notification permission-denied path"
```

---

## Self-Review Notes

- **Spec coverage:** `users/{uid}` notification fields + `fcm_tokens` collection (Tasks 1, 3) ✓; `lastNotifiedAt` dedup field (Task 2) ✓; Settings UI with permission request/registration/deregistration and inline error handling (Tasks 5, 6) ✓; combined service worker replacing `generateSW` (Task 4) ✓; foreground message handling (Task 6) ✓; server script with dedup + local-hour matching + digest send + `lastNotifiedAt` stamping, and the GitHub Actions workflow (Tasks 7, 8) ✓; testing plan including the one genuinely e2e-testable path and an honest note on why the rest isn't (Task 9) ✓. Every "out of scope" item from the spec (real secret creation, GitHub remote, live scheduled run, token-management UI) has no corresponding task, as intended.
- **Ripple check:** confirmed exhaustively via `grep -rln "lowStockThreshold\|hideDistantThresholdMonths" src/` before writing Task 1 — 13 files touched (7 in Task 1 for the `Settings` extension + backup ripple, plus `app-route.test.tsx`), matching the exact lesson recorded in project memory from Phase 4.
- **Type consistency:** `FcmToken` (Task 3) flows into `messaging.ts` (Task 5) only via `upsertFcmToken`'s existing `(uid, deviceId, token)` signature, never re-typed. `Settings`'s 4 new fields (Task 1) are consumed identically by `NotificationSection` (Task 6) and `run.ts` (Task 8, via raw field reads with matching inline defaults — deliberately not re-importing the Zod-derived type across the `scripts/`/`src/` program boundary, see Task 8's design note). `runDailyNotifications(db, messaging, now?)`'s signature is defined once in Task 8 and used identically by its own integration test and the entrypoint block in the same file.
- **Placeholder scan:** no TBD/TODO. The two items flagged as "needs verification during execution, not assumed" (env-var replacement inside the injectManifest-built service worker in Task 4; whether `initializeApp({projectId})` needs an explicit `credential` for emulator-only Admin SDK use in Task 8) are both concrete, checkable steps with a stated fallback — not vague hand-waves.
