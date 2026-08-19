# Phase 4: Remaining Settings + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add cross-device-synced `language` and `hideDistantThresholdMonths` settings (wired into an actual language switcher and expiry-distance filtering), and make the app an installable PWA with an offline-cached app shell.

**Architecture:** Both new settings live on the `users/{uid}` doc Phase 2 already built (`useSettings`/`updateXxx` pattern) — no new collection. Language changes write to Firestore and call `i18n.changeLanguage()` immediately on the changing device, plus a `useEffect` in `AppRoute` propagates the change to every other signed-in device when it arrives via `onSnapshot`. Hide-distant filtering is a new pure function alongside `sortItems`/`getExpiryWarningColor`, wired into `ItemList` as one more filter step (normal view only, not Shopping Mode). PWA support is `vite-plugin-pwa` (Workbox) precaching the built app shell, with icons generated from v1's existing artwork — no Firestore offline persistence, no manifest localization.

**Tech Stack:** Same as Phases 1–3 — Vite, React 19, TypeScript, Ant Design v6, Firebase (Auth + Firestore, Local Emulator Suite for tests), react-i18next, dayjs, Zod v4, Vitest + Testing Library, Playwright, Biome. New: `vite-plugin-pwa` (dev dependency).

**Spec:** [docs/superpowers/specs/2026-08-19-phase-4-settings-pwa-design.md](../specs/2026-08-19-phase-4-settings-pwa-design.md)

## Global Constraints

- Both new settings fields live on the existing `users/{uid}` document — no new Firestore collection, no new security rule needed.
- `settingsDocSchema` fields all use `.catch()` to their default — a live `onSnapshot` listener must never get permanently stuck on `loading: true` because of malformed data already in Firestore. This is the exact C2-class regression Phase 2's final review caught and fixed; do not regress it for the two new fields.
- The language control's value binds to `settings.language`, **never** to `i18n.language` directly — i18next canonicalizes language codes to BCP-47 casing (`"pt-br"` → `"pt-BR"`) internally, so comparing against a lowercase literal would silently break. `settings.language` (Firestore-synced, always lowercase) is the single source of truth for which option is selected.
- `filterDistantItems` never runs in Shopping Mode — only the normal item-list view.
- No Firestore offline persistence (`persistentLocalCache`) is added in this phase — out of scope.
- `notificationsEnabled` / `notifyDaysBeforeExpiry` / `fcm_tokens` are not touched — Phase 6's job entirely.
- **Before writing any Ant Design component code, verify the current API with `antd info <Component>` / `antd demo <Component> <name>` — do not write component JSX from memory.** `Select`'s API for Task 4 was verified during planning (`options`/`value`/`onChange` confirmed against the installed `antd@6.6.1`), but verify again yourself before implementing — versions can drift between planning and implementation.
- `vite-plugin-pwa`'s config API (`VitePWA()`, `registerType`, `manifest`, `includeAssets`) was verified against the exact installed version (`vite-plugin-pwa@1.3.0`'s own type declarations) during planning — Task 7's code is safe to use as-is, but the package hasn't been installed in this worktree yet, so run the install step first.
- For emulator-backed tests, run the full `npm test`, or `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"` for a filtered run — `npm test -- <path>` does not filter (see CLAUDE.md). Pure-function and component tests that never touch Firestore don't need the emulator wrapper.
- Always run the FULL `npm run lint` (`biome check . && eslint .`) before considering a task done — `tsc`/Biome alone won't catch `eslint-plugin-react-hooks`'s `rules-of-hooks` violations.
- `afterEach` emulator cleanup always calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal.

---

## File Structure

```
src/
├── features/
│   ├── settings/
│   │   ├── schema.ts                     # MODIFY: add language, hideDistantThresholdMonths
│   │   ├── schema.test.ts                # MODIFY: update existing assertions + new cases
│   │   ├── useSettings.ts                # MODIFY: bootstrap all three fields
│   │   ├── useSettings.test.tsx          # MODIFY: extend bootstrap assertions
│   │   ├── firestoreWrites.ts            # MODIFY: add updateLanguage, updateHideDistantThresholdMonths
│   │   ├── firestoreWrites.test.ts       # MODIFY: add tests for the above
│   │   ├── BackupSection.tsx             # NEW: extracted from SettingsPane (pure refactor)
│   │   ├── BackupSection.test.tsx        # NEW: backup tests moved here
│   │   ├── SettingsPane.tsx              # MODIFY: shrink (extraction) then grow (new controls)
│   │   └── SettingsPane.test.tsx         # MODIFY: shrink then grow, matching above
│   └── pantry-items/
│       ├── sortItems.ts                  # MODIFY: add filterDistantItems
│       ├── sortItems.test.ts             # MODIFY: add tests for the above
│       └── ItemList.tsx                  # MODIFY: hideDistantThresholdMonths prop + filter step
├── routes/
│   ├── app-route.tsx                     # MODIFY: language propagation effect, prop passthrough
│   └── app-route.test.tsx                # NEW
├── locales/
│   ├── en-us.json                        # MODIFY: add settings.language*, settings.hideDistant*
│   └── pt-br.json                        # MODIFY: same
└── test/
    └── setup.ts                          # MODIFY: add ResizeObserver polyfill (antd Select)
vite.config.ts                            # MODIFY: add VitePWA plugin
index.html                                # MODIFY: new icon links, drop favicon.svg link
public/
├── favicon.svg                           # DELETE
├── pwa-192x192.png                       # NEW (generated)
├── pwa-512x512.png                       # NEW (generated)
└── apple-touch-icon.png                  # NEW (generated)
e2e/
└── core-loop.spec.ts                     # MODIFY: hide-distant + language-switch cases
```

---

### Task 1: Settings schema + bootstrap

**Files:**
- Modify: `src/features/settings/schema.ts`, `src/features/settings/schema.test.ts`, `src/features/settings/useSettings.ts`, `src/features/settings/useSettings.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface Settings { lowStockThreshold: number; language: "pt-br" | "en-us"; hideDistantThresholdMonths: number }`. `parseSettingsDoc(data: unknown): Settings` unchanged in signature, now returns the two new fields too. `useSettings(uid)`'s returned `settings` always has all three fields populated (bootstrapped or read).

- [x] **Step 1: Update the schema tests (they will fail against the current schema)**

Replace the full contents of `src/features/settings/schema.test.ts`:

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
			}),
		).toEqual({
			lowStockThreshold: 7,
			language: "en-us",
			hideDistantThresholdMonths: 6,
		});
	});

	it("falls back to all defaults on an empty document", () => {
		expect(parseSettingsDoc({})).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
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
		});
	});

	it("falls back to pt-br when language is missing or not a supported value", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, hideDistantThresholdMonths: 3 }),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
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
		});
	});

	it("falls back to the default hideDistantThresholdMonths when missing or non-integer", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, language: "en-us" }),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
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
		});
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/settings/schema.test.ts
```

Expected: FAIL — the new assertions expect `language`/`hideDistantThresholdMonths` fields the current schema doesn't produce yet.

- [x] **Step 3: Update the schema**

Replace the full contents of `src/features/settings/schema.ts`:

```typescript
import { z } from "zod";

const DEFAULT_LOW_STOCK_THRESHOLD = 3;
const DEFAULT_LANGUAGE = "pt-br";
const DEFAULT_HIDE_DISTANT_THRESHOLD_MONTHS = 3;

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
});

export interface Settings {
	lowStockThreshold: number;
	language: "pt-br" | "en-us";
	hideDistantThresholdMonths: number;
}

export function parseSettingsDoc(data: unknown): Settings {
	return settingsDocSchema.parse(data);
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/settings/schema.test.ts
```

- [x] **Step 5: Update useSettings's bootstrap + default state, and its tests**

Replace the full contents of `src/features/settings/useSettings.ts`:

```typescript
import { message } from "antd";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { parseSettingsDoc, type Settings } from "./schema";

const DEFAULT_SETTINGS: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
};

async function ensureSettingsDoc(uid: string) {
	const userDoc = doc(db, "users", uid);
	const existing = await getDoc(userDoc);
	if (!existing.exists()) {
		await setDoc(userDoc, DEFAULT_SETTINGS);
	}
}

export function useSettings(uid: string): {
	settings: Settings;
	loading: boolean;
} {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let unsubscribe = () => {};
		ensureSettingsDoc(uid)
			.then(() => {
				const userDoc = doc(db, "users", uid);
				unsubscribe = onSnapshot(
					userDoc,
					(snapshot) => {
						if (snapshot.exists()) {
							setSettings(parseSettingsDoc(snapshot.data()));
						}
						setLoading(false);
					},
					() => {
						message.error("Something went wrong, please try again");
						setLoading(false);
					},
				);
			})
			.catch(() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			});
		return () => unsubscribe();
	}, [uid]);

	return { settings, loading };
}
```

In `src/features/settings/useSettings.test.tsx`, update the `"bootstraps the default threshold when no settings doc exists"` test to check all three fields (rename it too, since it now covers more than the threshold):

```typescript
	it("bootstraps default settings when no settings doc exists", async () => {
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
		});
	});
```

Leave the other two existing tests (`"does not overwrite an existing settings doc"`, `"does not get stuck loading when the settings doc has a non-integer threshold"`) unchanged — they only assert on `result.current.settings.lowStockThreshold`, which is unaffected by this change.

- [x] **Step 6: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/useSettings.test.tsx"
```

- [x] **Step 7: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/settings/schema.ts src/features/settings/schema.test.ts \
  src/features/settings/useSettings.ts src/features/settings/useSettings.test.tsx
git commit -m "feat: add language and hideDistantThresholdMonths to settings schema"
```

---

### Task 2: Settings write functions

**Files:**
- Modify: `src/features/settings/firestoreWrites.ts`, `src/features/settings/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `Settings["language"]` type (Task 1).
- Produces: `updateLanguage(uid: string, language: Settings["language"]): Promise<void>`; `updateHideDistantThresholdMonths(uid: string, value: number): Promise<void>`.

- [x] **Step 1: Write failing tests**

Append to `src/features/settings/firestoreWrites.test.ts` (add these two `describe` blocks after the existing `updateLowStockThreshold` one, and add `updateLanguage, updateHideDistantThresholdMonths` to the existing import from `./firestoreWrites`):

```typescript
describe("updateLanguage", () => {
	it("updates an existing settings doc's language", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateLanguage(uid, "en-us");
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.language).toBe("en-us");
	});
});

describe("updateHideDistantThresholdMonths", () => {
	it("updates an existing settings doc's hideDistantThresholdMonths", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateHideDistantThresholdMonths(uid, 6);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.hideDistantThresholdMonths).toBe(6);
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/firestoreWrites.test.ts"
```

Expected: FAIL — `updateLanguage`/`updateHideDistantThresholdMonths` are not exported yet.

- [x] **Step 3: Implement the write functions**

Replace the full contents of `src/features/settings/firestoreWrites.ts`:

```typescript
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Settings } from "./schema";

export async function updateLowStockThreshold(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ lowStockThreshold: value },
		{ merge: true },
	);
}

export async function updateLanguage(
	uid: string,
	language: Settings["language"],
): Promise<void> {
	await setDoc(doc(db, "users", uid), { language }, { merge: true });
}

export async function updateHideDistantThresholdMonths(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ hideDistantThresholdMonths: value },
		{ merge: true },
	);
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/firestoreWrites.test.ts"
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/settings/firestoreWrites.ts src/features/settings/firestoreWrites.test.ts
git commit -m "feat: add updateLanguage and updateHideDistantThresholdMonths"
```

---

### Task 3: Extract `BackupSection` from `SettingsPane` (pure refactor)

**Why this task exists:** `SettingsPane.tsx` is already ~195 lines after Phase 3 (the low-stock threshold control plus the entire backup export/import UI and its confirmation modal). Task 4 adds two more settings controls to this same file. Extracting the backup UI into its own component first keeps `SettingsPane.tsx` focused on "settings fields" and `BackupSection.tsx` focused on "backup import/export," each independently understandable — and keeps Task 4's diff small and reviewable on its own, instead of tangled with an unrelated refactor.

**This task changes zero behavior.** Every existing backup export/import test must still pass, just against the new component.

**Files:**
- Create: `src/features/settings/BackupSection.tsx`, `src/features/settings/BackupSection.test.tsx`
- Modify: `src/features/settings/SettingsPane.tsx`, `src/features/settings/SettingsPane.test.tsx`

**Interfaces:**
- Consumes: `buildBackup` (`../backup/exportBackup`), `importBackup` (`../backup/importBackup`), `safeParseBackup`/`Backup` (`../backup/schema`) — all unchanged from Phase 3.
- Produces: `BackupSection({ uid: string })` — a self-contained component rendering its own `Form.Item` (backup buttons) and `Modal` (import confirmation). Must be rendered as a child of a `<Form>` (it does not render its own `<Form>` wrapper) so its `Form.Item` picks up the parent's `layout="vertical"` styling.

- [x] **Step 1: Move the backup tests to a new file (they will fail — the component doesn't exist yet)**

Read the current `src/features/settings/SettingsPane.test.tsx` first. Move its two `describe` blocks, `"SettingsPane export"` and `"SettingsPane import"`, into a **new** file `src/features/settings/BackupSection.test.tsx`, renaming both describes to `"BackupSection export"`/`"BackupSection import"`, changing every `render(<SettingsPane uid="..." settings={settings} />)` to `render(<BackupSection uid="..." />)` (drop the `settings` prop — `BackupSection` doesn't take one), and changing the import from `import { SettingsPane } from "./SettingsPane";` to `import { BackupSection } from "./BackupSection";`. Keep every other line (mocks, spies, assertions, the `fixtureBackup`/`fixtureImportBackup` fixtures) exactly as-is. The `settings` fixture object at the top of the file is no longer needed in this new file — remove it along with its `Settings` type import, since nothing in the moved tests references it once the `settings` prop is dropped.

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/settings/BackupSection.test.tsx
```

Expected: FAIL — `./BackupSection` doesn't exist yet.

- [x] **Step 3: Create `BackupSection.tsx` by moving code out of `SettingsPane.tsx`**

Read the current `src/features/settings/SettingsPane.tsx` first (you'll need its exact current contents to do this extraction precisely). Create `src/features/settings/BackupSection.tsx` containing:
- The imports specific to backup functionality: `DownloadOutlined`, `UploadOutlined` from `@ant-design/icons`; `Button`, `Form`, `Input`, `Modal`, `message` from `antd`; `type ChangeEvent` from `react`; `useRef`, `useState` from `react`; `useTranslation` from `react-i18next`; `buildBackup`; `importBackup`; `type Backup, safeParseBackup`.
- A `BackupSection({ uid }: { uid: string })` component containing exactly the state (`fileInputRef`, `pendingBackup`, `confirmText`, `importModalOpen`), handlers (`handleExport`, `handleFileChange`, `handleImportConfirm`, `handleImportCancel`), and JSX (the `Form.Item` with the Export/Import buttons and hidden file input, plus the confirmation `Modal`) currently living in `SettingsPane.tsx` — copied verbatim, no logic changes. The JSX returns a fragment (`<>...</>`) containing the `Form.Item` and `Modal` as siblings (not wrapped in a `<Form>` — `SettingsPane` still owns the single `<Form>` element).

- [x] **Step 4: Shrink `SettingsPane.tsx`**

Remove everything that moved to `BackupSection.tsx`: the now-unused imports (`DownloadOutlined`, `UploadOutlined`, `Input`, `Modal`, `ChangeEvent`, `useRef`, `buildBackup`, `importBackup`, `Backup`, `safeParseBackup`), the moved state/handlers, and the moved JSX. Add `import { BackupSection } from "./BackupSection";`. Replace the removed backup `Form.Item` + `Modal` JSX with `<BackupSection uid={uid} />`, placed where the backup `Form.Item` used to be, still inside the outer `<Form>`.

- [x] **Step 5: Run both test files, verify everything passes**

```bash
npx vitest run src/features/settings/BackupSection.test.tsx src/features/settings/SettingsPane.test.tsx
```

- [x] **Step 6: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/BackupSection.tsx src/features/settings/BackupSection.test.tsx \
  src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx
git commit -m "refactor: extract BackupSection out of SettingsPane"
```

---

### Task 4: Language + hide-distant-threshold controls in `SettingsPane`

**Files:**
- Modify: `src/features/settings/SettingsPane.tsx`, `src/features/settings/SettingsPane.test.tsx`, `src/locales/en-us.json`, `src/locales/pt-br.json`, `src/test/setup.ts`

**Interfaces:**
- Consumes: `updateLanguage`, `updateHideDistantThresholdMonths` (Task 2); `i18n` default export (`src/lib/i18n.ts`).
- Produces: `SettingsPane` renders two more `Form.Item`s. No prop-signature change (`{ uid: string; settings: Settings }` unchanged).

- [x] **Step 1: Write failing tests**

Read the current `src/features/settings/SettingsPane.test.tsx` (post-Task-3 shrink) first. Add these two `describe` blocks to it, and add `import i18n from "../../lib/i18n";` to its imports:

```tsx
describe("SettingsPane language", () => {
	it("writes the new language and calls i18n.changeLanguage when changed", async () => {
		const updateLanguageSpy = vi
			.spyOn(settingsWritesModule, "updateLanguage")
			.mockResolvedValue(undefined);
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<SettingsPane uid="test-user-settings-ui-1" settings={settings} />);
		await userEvent.click(screen.getByRole("combobox"));
		await userEvent.click(await screen.findByText("English"));

		expect(updateLanguageSpy).toHaveBeenCalledWith(
			"test-user-settings-ui-1",
			"en-us",
		);
		expect(changeLanguageSpy).toHaveBeenCalledWith("en-us");
	});
});

describe("SettingsPane hide-distant threshold", () => {
	it("commits the new threshold on blur", async () => {
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateHideDistantThresholdMonths")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-settings-ui-2" settings={settings} />);
		const input = screen.getByLabelText(/hide items expiring/i);
		await userEvent.clear(input);
		await userEvent.type(input, "6");
		await userEvent.tab(); // blur

		expect(updateSpy).toHaveBeenCalledWith("test-user-settings-ui-2", 6);
	});
});
```

Add `import * as settingsWritesModule from "./firestoreWrites";` to the top of the file if it isn't already imported that way (check first — it may already be imported by name only). Also update the `settings` fixture object near the top of the file to include the two new fields:

```typescript
const settings: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
};
```

- [x] **Step 2: Add a `ResizeObserver` polyfill to the test setup**

This codebase's `src/test/setup.ts` currently polyfills only `window.matchMedia` (needed by antd's `Modal`, per the existing comment there). `Select` additionally subscribes to `ResizeObserver` on mount, which jsdom doesn't implement either — confirmed during planning: rendering a bare antd `Select` in this project's current test setup throws `ReferenceError: ResizeObserver is not defined` from `@rc-component/resize-observer` before any query even runs. Without this polyfill, Step 5 below (and Task 5's `AppRoute` test, which renders `SettingsPane` transitively) fail with that error instead of passing. Add to `src/test/setup.ts`, after the existing `matchMedia` block, following the same "polyfill with a no-op stub" style:

```typescript
// jsdom doesn't implement ResizeObserver; antd's Select (and other
// components) subscribe to it on mount via @rc-component/resize-observer.
if (!window.ResizeObserver) {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
```

- [x] **Step 3: Run it, verify it fails**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

Expected: FAIL — no combobox or "hide items expiring" labeled input exists yet (with the Step 2 polyfill in place, this should be a normal "element not found" failure, not a `ResizeObserver` crash).

- [x] **Step 4: Add locale keys**

Add to the `"settings"` object in **both** locale files, alongside the existing keys:

en-us.json:
```json
"language": "Language",
"languagePtBr": "Português",
"languageEnUs": "English",
"hideDistantThresholdMonths": "Hide items expiring more than this many months away"
```

pt-br.json:
```json
"language": "Idioma",
"languagePtBr": "Português",
"languageEnUs": "English",
"hideDistantThresholdMonths": "Ocultar itens que vencem daqui a mais de (meses)"
```

- [x] **Step 5: Add the two controls to `SettingsPane`**

Run `antd info Select` to confirm the current API before writing this (it was verified during planning against `antd@6.6.1`, but re-verify — versions can drift).

Add to `src/features/settings/SettingsPane.tsx`:

1. Import `Select` alongside the other `antd` imports, and `updateLanguage`, `updateHideDistantThresholdMonths` alongside the existing `updateLowStockThreshold` import from `./firestoreWrites`. Import `i18n` via `import i18n from "../../lib/i18n";`.

2. A language handler:

```typescript
const handleLanguageChange = async (language: Settings["language"]) => {
	try {
		await updateLanguage(uid, language);
		i18n.changeLanguage(language);
	} catch {
		message.error("Something went wrong, please try again");
	}
};
```

3. A `Form.Item` for language, placed as the first item (before the low-stock-threshold one), with a `Select` **whose `value` is bound directly to `settings.language`** (no local state — unlike the threshold controls, `Select`'s `onChange` fires with a final committed value, not partial typed input, so there's no free-typing/clamping concern to buffer against):

```tsx
<Form.Item label={t("settings.language")}>
	<Select
		value={settings.language}
		onChange={handleLanguageChange}
		options={[
			{ value: "pt-br", label: t("settings.languagePtBr") },
			{ value: "en-us", label: t("settings.languageEnUs") },
		]}
		style={{ width: "100%" }}
	/>
</Form.Item>
```

4. A hide-distant-threshold control, following the **exact same pattern** as the existing low-stock-threshold control (local `value` state seeded from the prop, a `prevX`-tracking render-time resync — see the comment above the existing `prevThreshold` code for why — and a `handleBlur` that reads the raw DOM value). Add a second local-state pair:

```typescript
const [hideDistantValue, setHideDistantValue] = useState(
	settings.hideDistantThresholdMonths,
);
const [prevHideDistantThresholdMonths, setPrevHideDistantThresholdMonths] =
	useState(settings.hideDistantThresholdMonths);
if (prevHideDistantThresholdMonths !== settings.hideDistantThresholdMonths) {
	setPrevHideDistantThresholdMonths(settings.hideDistantThresholdMonths);
	setHideDistantValue(settings.hideDistantThresholdMonths);
}
```

And its own blur handler (mirrors `handleBlur` exactly, targeting the new field — `MIN_HIDE_DISTANT_THRESHOLD_MONTHS` is a new constant, `1`, defined alongside the existing `MIN_LOW_STOCK_THRESHOLD`):

```typescript
const handleHideDistantBlur = async (event: FocusEvent<HTMLInputElement>) => {
	const parsed = Number(event.target.value);
	const committed = Number.isNaN(parsed)
		? hideDistantValue
		: Math.max(MIN_HIDE_DISTANT_THRESHOLD_MONTHS, Math.round(parsed));
	setHideDistantValue(committed);
	if (committed === settings.hideDistantThresholdMonths) return;
	try {
		await updateHideDistantThresholdMonths(uid, committed);
	} catch {
		message.error("Something went wrong, please try again");
	}
};
```

And its `Form.Item`, placed after the low-stock-threshold one:

```tsx
<Form.Item label={t("settings.hideDistantThresholdMonths")}>
	<InputNumber
		min={MIN_HIDE_DISTANT_THRESHOLD_MONTHS}
		precision={0}
		value={hideDistantValue}
		onChange={(newValue) => setHideDistantValue(newValue ?? 1)}
		onBlur={handleHideDistantBlur}
		aria-label={t("settings.hideDistantThresholdMonths")}
		style={{ width: "100%" }}
	/>
</Form.Item>
```

(The explicit `aria-label` is required here: this codebase's `Form.Item`s don't use antd's `name` prop / form-instance field registry — just a bare `label` — so there's no automatic `htmlFor`/id association between the rendered `<label>` and the `InputNumber`'s input. `aria-label` sidesteps that entirely and is self-sufficient for `getByLabelText` to find it, independent of how the existing low-stock-threshold field happens to be wired. No need to touch that existing field.)

- [x] **Step 6: Run it, verify it passes**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

- [x] **Step 7: Verify manually**

```bash
npm run dev
```

Sign in, open Settings, switch the language and confirm the whole UI (including the Settings tab's own labels) re-renders in the new language immediately. Change the hide-distant threshold and confirm it persists across a reload.

- [x] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx \
  src/locales/en-us.json src/locales/pt-br.json src/test/setup.ts
git commit -m "feat: add language and hide-distant-threshold controls to Settings"
```

---

### Task 5: Cross-device language propagation

**Files:**
- Modify: `src/routes/app-route.tsx`
- Create: `src/routes/app-route.test.tsx`

**Interfaces:**
- Consumes: `settings.language` (Task 1); `i18n` default export. Also relies on Task 4's `ResizeObserver` polyfill in `src/test/setup.ts` — `AppRoute` renders `SettingsPane` (with its now-present `Select`) as part of its own tree, so this task's test would hit the same jsdom gap Task 4 fixed if run before Task 4 lands.
- Produces: no new exports — `AppRoute`'s existing `{ user: User }` prop signature is unchanged; this task adds an internal effect only.

- [x] **Step 1: Write failing tests**

Create `src/routes/app-route.test.tsx`:

```tsx
import "../lib/i18n";
import { render } from "@testing-library/react";
import type { User } from "firebase/auth";
import { describe, expect, it, vi } from "vitest";
import * as useCategoriesModule from "../features/categories/useCategories";
import * as useSettingsModule from "../features/settings/useSettings";
import i18n from "../lib/i18n";
import { AppRoute } from "./app-route";

const user = { uid: "test-user-app-route-1" } as User;

describe("AppRoute language propagation", () => {
	it("calls i18n.changeLanguage when settings.language is available", () => {
		vi.spyOn(useCategoriesModule, "useCategories").mockReturnValue({
			categories: [],
			loading: false,
		});
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 3,
			},
			loading: false,
		});
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<AppRoute user={user} />);

		expect(changeLanguageSpy).toHaveBeenCalledWith("en-us");
	});

	it("does not call i18n.changeLanguage while settings are still loading", () => {
		vi.spyOn(useCategoriesModule, "useCategories").mockReturnValue({
			categories: [],
			loading: false,
		});
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			},
			loading: true,
		});
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<AppRoute user={user} />);

		expect(changeLanguageSpy).not.toHaveBeenCalled();
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/routes/app-route.test.tsx
```

Expected: FAIL — `changeLanguage` is never called yet.

- [x] **Step 3: Add the propagation effect**

Read the current `src/routes/app-route.tsx` first. Add `import { useEffect } from "react";` and `import i18n from "../lib/i18n";`, and this effect, placed after the two hook calls but **before** the `if (categoriesLoading || settingsLoading) return null;` line (hooks must run unconditionally before any early return):

```typescript
useEffect(() => {
	if (!settingsLoading) {
		i18n.changeLanguage(settings.language);
	}
}, [settings.language, settingsLoading]);
```

The `!settingsLoading` guard matters: `useSettings` seeds `settings.language` with the default `"pt-br"` before Firestore resolves, so calling `changeLanguage` unconditionally on every render would briefly stomp a correctly browser-detected pre-login guess (e.g. `"en-us"`) with the default the instant `AppRoute` mounts, before the real synced value arrives.

Then thread `hideDistantThresholdMonths` through to `ItemList` (this line will not compile correctly until Task 6 adds the prop to `ItemList` — that's expected and fine, this task's own tests don't render `ItemList`):

```tsx
<ItemList
	uid={user.uid}
	category={category}
	lowStockThreshold={settings.lowStockThreshold}
	hideDistantThresholdMonths={settings.hideDistantThresholdMonths}
/>
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/routes/app-route.test.tsx
```

Note: `tsc` will report an error on the `ItemList` prop until Task 6 lands — this is expected; don't skip it, but don't try to fix `ItemList.tsx` from this task either. `npm run typecheck`/`npm run build` will not be run as part of this task's own verification for that reason (Task 6 verifies the whole tree builds again).

- [x] **Step 5: Run test/lint verification and commit**

```bash
npm run format
npx vitest run src/routes/app-route.test.tsx src/features/settings/SettingsPane.test.tsx src/features/settings/BackupSection.test.tsx
```

(Skip `npm run lint`/`npm run build` for this task specifically — both will fail on the expected, temporary `ItemList` prop mismatch until Task 6. Task 6's own verification step runs the full suite including these.)

```bash
git add src/routes/app-route.tsx src/routes/app-route.test.tsx
git commit -m "feat: propagate language changes across devices in AppRoute"
```

---

### Task 6: `filterDistantItems` + `ItemList` wiring

**Files:**
- Modify: `src/features/pantry-items/sortItems.ts`, `src/features/pantry-items/sortItems.test.ts`, `src/features/pantry-items/ItemList.tsx`

**Interfaces:**
- Consumes: `hideDistantThresholdMonths` prop, already threaded from `AppRoute` in Task 5.
- Produces: `filterDistantItems(items: PantryItem[], thresholdMonths: number, now: Date): PantryItem[]`. `ItemList` gains a `hideDistantThresholdMonths: number` prop (this task makes the Task-5-added JSX prop actually valid — `tsc`/`npm run build` become clean again after this task).

- [x] **Step 1: Write failing tests**

Add to `src/features/pantry-items/sortItems.test.ts` (add `import dayjs from "dayjs";` and `filterDistantItems` to the existing `./sortItems` import):

```typescript
describe("filterDistantItems", () => {
	const now = new Date("2026-08-17T12:00:00Z");

	it("keeps items expiring within the threshold", () => {
		const item = makeItem({ expiringDate: new Date("2026-09-01") });
		expect(filterDistantItems([item], 3, now)).toEqual([item]);
	});

	it("drops items expiring beyond the threshold", () => {
		const item = makeItem({ expiringDate: new Date("2027-06-01") });
		expect(filterDistantItems([item], 3, now)).toEqual([]);
	});

	it("keeps an item exactly at the threshold boundary", () => {
		const cutoff = dayjs(now).add(3, "month").toDate();
		const item = makeItem({ expiringDate: cutoff });
		expect(filterDistantItems([item], 3, now)).toEqual([item]);
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/sortItems.test.ts
```

Expected: FAIL — `filterDistantItems` is not exported yet.

- [x] **Step 3: Implement `filterDistantItems`**

Add to `src/features/pantry-items/sortItems.ts` (add `import dayjs from "dayjs";` at the top):

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

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/sortItems.test.ts
```

- [x] **Step 5: Wire it into `ItemList`**

Read the current `src/features/pantry-items/ItemList.tsx` first. Add `hideDistantThresholdMonths: number` to its props destructuring and type, add `filterDistantItems` to the import from `./sortItems`, and change:

```typescript
const filtered = items.filter((item) => {
	if (filter === "opened") return item.opened;
	if (filter === "unopened") return !item.opened;
	return true;
});
const sorted = sortItems(filtered);
```

to:

```typescript
const filtered = items.filter((item) => {
	if (filter === "opened") return item.opened;
	if (filter === "unopened") return !item.opened;
	return true;
});
const notDistant = filterDistantItems(filtered, hideDistantThresholdMonths, new Date());
const sorted = sortItems(notDistant);
```

`ShoppingList` (rendered in the `shoppingModeOn` branch) already receives raw `items`, not `sorted`/`filtered` — leave that untouched, satisfying "never runs in Shopping Mode."

- [x] **Step 6: Verify the whole tree builds and tests pass**

```bash
npm run format
npm run lint
npm run build
npm test
```

This is the point where Task 5's `ItemList` prop and this task's new prop finally match — `npm run build`/`npm run lint` should be clean now.

- [x] **Step 7: Commit**

```bash
git add src/features/pantry-items/sortItems.ts src/features/pantry-items/sortItems.test.ts \
  src/features/pantry-items/ItemList.tsx
git commit -m "feat: add filterDistantItems and wire it into ItemList"
```

---

### Task 7: PWA installability

**Files:**
- Modify: `vite.config.ts`, `index.html`, `package.json`, `package-lock.json`
- Create: `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/apple-touch-icon.png`
- Delete: `public/favicon.svg`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks — this is a self-contained build-config change.

- [x] **Step 1: Install `vite-plugin-pwa`**

```bash
npm install --save-dev vite-plugin-pwa
```

- [x] **Step 2: Generate the icon assets**

v1's existing 512×512 source icon lives at `/home/gca/repos/expiring_products/assets/img/favicon.png` on this machine (confirmed during planning — a different local checkout of the v1 repo, not part of this git repository). `imagemagick`'s `convert` is already installed. Run:

```bash
convert /home/gca/repos/expiring_products/assets/img/favicon.png -resize 192x192 public/pwa-192x192.png
cp /home/gca/repos/expiring_products/assets/img/favicon.png public/pwa-512x512.png
convert /home/gca/repos/expiring_products/assets/img/favicon.png -resize 180x180 public/apple-touch-icon.png
rm public/favicon.svg
```

If the v1 source file isn't present at that exact path in your environment (e.g. a different machine than the one this plan was written on), ask for the correct path to v1's icon before proceeding — do not substitute a placeholder.

- [x] **Step 3: Configure the plugin**

Replace the full contents of `vite.config.ts`:

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

(This exact config shape was verified during planning against the installed `vite-plugin-pwa@1.3.0`'s own TypeScript type declarations — `registerType`, `manifest.icons` as `{ src, sizes, type }[]`, and `includeAssets` for public-dir files not already in the manifest icon list, like the apple-touch icon. `injectRegister` defaults to `'auto'`, which handles both the service-worker registration script and the `<link rel="manifest">` tag automatically — no manual index.html changes needed for either of those.)

- [x] **Step 4: Update `index.html`**

Read the current `index.html` first. Replace the `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` line with:

```html
<link rel="icon" type="image/png" sizes="192x192" href="/pwa-192x192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

(The `apple-touch-icon` link is required regardless of the web manifest — iOS Safari does not read the manifest for its home-screen icon, only this tag.)

- [x] **Step 5: Build and verify the manifest/service-worker output**

```bash
npm run build
cat dist/manifest.webmanifest
ls dist/sw.js dist/pwa-192x192.png dist/pwa-512x512.png dist/apple-touch-icon.png
```

Expected: `dist/manifest.webmanifest` contains `"name":"Produtos a vencer"`, `"theme_color":"#6e6197"`, and both icon entries; `dist/sw.js` and all four asset files exist.

- [x] **Step 6: Manual installability check**

```bash
npm run preview
```

Open the printed local URL in Chrome, open DevTools → Application → Manifest, and confirm it loads without errors and shows both icon sizes. Optionally run a Lighthouse PWA audit from the same DevTools panel. This step can't be scripted — it's the one piece of this task that needs an actual human (or you, interactively) looking at a real browser.

- [x] **Step 7: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add vite.config.ts index.html package.json package-lock.json \
  public/pwa-192x192.png public/pwa-512x512.png public/apple-touch-icon.png
git rm public/favicon.svg
git commit -m "feat: add PWA manifest, icons, and offline app-shell caching"
```

---

### Task 8: E2e coverage and final verification

**Files:**
- Modify: `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full feature set built in Tasks 1–7.

- [x] **Step 1: Add a hide-distant-items e2e case**

Add to `e2e/core-loop.spec.ts`, following its established conventions (pt-br button/label text, the `.ant-picker-cell-today` workaround for a near/today date). For the far date, clicking through the calendar's month navigation is impractical (the `.ant-picker-cell-today` cell simply isn't present once you've navigated to a month grid that doesn't include today's real date, so that selector can't be reused) — instead, type the date directly into the picker's input and confirm with Enter, using a date computed at test-run time (`new Date()` inside the test executes when the test actually runs, so this is always "8 months from whenever the suite runs," not a stale hardcoded date). The default `hideDistantThresholdMonths` is 3, so an item expiring next month stays visible and one expiring 8 months out should not.

```typescript
test("items expiring beyond the hide-distant threshold are not shown", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-distant-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Near Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Near Item")).toBeVisible();

	// A far-future date beyond the default 3-month hide-distant threshold.
	// Verify the DatePicker's actual typed-input format against the running
	// app before trusting this — antd's default (no ConfigProvider locale is
	// set in this project) is "YYYY-MM-DD", but confirm empirically.
	const farDate = new Date();
	farDate.setMonth(farDate.getMonth() + 8);
	const farDateStr = farDate.toISOString().slice(0, 10);

	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Far Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").fill(farDateStr);
	await page.getByLabel("Data de validade").press("Enter");
	await page.getByRole("button", { name: "OK" }).click();

	await expect(page.getByText("Near Item")).toBeVisible();
	await expect(page.getByText("Far Item")).not.toBeVisible();
});
```

- [x] **Step 2: Add a language-switch e2e case**

```typescript
test("switching language updates the rendered UI immediately", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-lang-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: "⚙️" }).click();
	await expect(page.getByText("Aviso de estoque baixo")).toBeVisible();

	await page.getByRole("combobox").click();
	await page.getByText("English", { exact: true }).click();

	await expect(page.getByText("Low stock warning threshold")).toBeVisible();
});
```

Verify every selector in both new cases empirically against the real running app (`npm run dev`) rather than trusting this brief blindly — check the actual rendered DOM/accessible names before assuming they match. Every prior phase's e2e task has found at least one brief-guessed selector needed adjusting after checking reality.

- [x] **Step 3: Run the e2e suite against the emulator**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (all existing cases plus the two new ones).

- [x] **Step 4: Run the full verification suite one more time**

```bash
npm run format
npm run lint
npm run build
npm test
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

All five must be clean before this task is considered done.

- [x] **Step 5: Commit**

```bash
git add e2e/core-loop.spec.ts
git commit -m "test: add e2e coverage for hide-distant filtering and language switching"
```

---

## Self-Review Notes

- **Spec coverage:** data model additions (Task 1) ✓; language sync + UI + the casing-gotcha-safe binding (Tasks 1, 2, 4) ✓; cross-device propagation (Task 5) ✓; hide-distant filtering, Shopping-Mode-exempt (Tasks 1, 2, 6) ✓; PWA manifest/icons/offline shell (Task 7) ✓; every "out of scope" item (notifications settings, separate enable flag, session override, Firestore offline persistence, localized manifest) has no corresponding task, as intended. The `BackupSection` extraction (Task 3) isn't itself a spec requirement — it's the plan's own targeted file-size fix, called out explicitly as such, that Task 4 depends on to keep `SettingsPane.tsx` from growing unreviewable.
- **Type consistency:** `Settings` (Task 1) is the single shape threaded through `useSettings`, `firestoreWrites.ts`, `SettingsPane`, and `AppRoute` — no redefinition anywhere. `filterDistantItems`'s exact signature (Task 6) matches what Task 5's `AppRoute` passthrough and this plan's Global Constraints both assume. `BackupSection`'s `{ uid: string }` prop (Task 3) matches every call site.
- **Placeholder scan:** no TBD/TODO markers. Task 4's antd `Select`/`InputNumber` JSX is given in full (unlike prior phases' plans, which deliberately withheld antd JSX) because it's a direct extension of a pattern already reviewed and shipped in this exact file — not new API surface being guessed from memory; the Global Constraints section still requires re-verifying the live API before implementing, since versions can drift between planning and implementation. Task 7's `vite-plugin-pwa` config was verified against the installed package's own type declarations during planning, not written from training-data memory.
