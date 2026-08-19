# Phase 3: Backup/Export & Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user download a full JSON backup of their account (settings, categories, items, recurring-item history) and restore an account from a previously downloaded backup file, replacing whatever is currently there.

**Architecture:** A new `src/features/backup/` feature owns the backup file's own Zod schema (distinct from each existing feature's Firestore-document schema, since the JSON file uses camelCase fields and ISO date strings rather than Firestore's snake_case + `Timestamp`), a pure `buildBackup(uid)` function that reads every collection via the existing per-feature parse functions, and a pure `importBackup(uid, backup)` function that deletes existing data and writes the backup's contents back — both plain Firestore SDK calls, no Cloud Functions, no batched/transactional writes (see the design spec's Approach section for why). `SettingsPane.tsx` gets an Export button (triggers a browser file download) and an Import button (file picker → typed-confirmation modal → `importBackup`).

**Tech Stack:** Same as Phases 1–2 — Vite, React 19, TypeScript, Ant Design v6, Firebase (Auth + Firestore, Local Emulator Suite for tests), react-i18next, Zod v4, Vitest + Testing Library, Playwright, Biome.

**Spec:** [docs/superpowers/specs/2026-08-19-phase-3-backup-export-design.md](../specs/2026-08-19-phase-3-backup-export-design.md)

## Global Constraints

- Firestore reads/writes go through a Zod schema at the boundary — no untyped `doc.data()` access anywhere in this phase.
- **The backup file's Zod schema (`src/features/backup/schema.ts`) is a separate schema from each feature's Firestore-document schema** (`itemDocSchema`, `categoryDocSchema`, `itemHistoryDocSchema`, `settingsDocSchema`) — do not attempt to `.extend()`/reuse those Zod objects directly, since the JSON file's field shapes differ (camelCase vs snake_case, ISO date strings vs Firestore `Timestamp`). Instead, reuse each feature's existing **parse functions** (`parseItemDoc`, `parseCategoryDoc`, `parseSettingsDoc`, `safeParseItemHistoryDoc`) when reading Firestore data in `exportBackup.ts`, and `toItemDoc` when writing it back in `importBackup.ts`. Never redefine field-mapping logic that already exists in those functions.
- Zod v4.4.3 (confirmed installed) — `z.string().datetime()` validates ISO-8601 strings ending in `Z`, which is exactly what `Date.prototype.toISOString()` produces; no `{ offset: true }` option needed.
- `afterEach` emulator cleanup always calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal.
- For emulator-backed tests, run the full `npm test`, or `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"` for a filtered run — `npm test -- <path>` does not filter (see CLAUDE.md). Pure-schema and component tests that never touch Firestore (this phase's `schema.test.ts` and `SettingsPane.test.tsx`) don't need the emulator wrapper — plain `npx vitest run <path>` is enough.
- Always run the FULL `npm run lint` (`biome check . && eslint .`) before considering a task done — `tsc`/Biome alone won't catch `eslint-plugin-react-hooks`'s `rules-of-hooks` violations.
- **Before writing any Ant Design component code, verify the current API with `antd info <Component>` / `antd demo <Component> <name>` — do not write component JSX from memory.** This plan deliberately does not hand you pasteable JSX for the antd-specific parts of Tasks 4–5 (Button, Modal, Input usage) — it specifies the exact behavior and the exact strings/props/handlers your code must produce, verified against by the task's tests; you verify the exact antd API yourself. The plain-DOM parts (the hidden `<input type="file">`, the `Blob`/`<a download>` export mechanism) need no antd verification — code for those is given exactly.
- Error-handling convention established in Phases 1–2: hooks/write-function callers wrap calls in `try/catch` and show `message.error(...)` on failure. This phase adds three new, more specific messages (invalid backup file, unsupported backup version, import partial-failure) alongside the existing generic `"Something went wrong, please try again"` string (reused for export failures, which have no more specific failure mode worth naming) — see Task 5 for exactly which message goes where.
- No Firestore security-rule changes are in scope (no `firestore.rules` file exists in this project; unchanged since Phase 1).
- **Import is destructive and has no undo.** The typed-confirmation step built in Task 5 is a hard requirement, not optional UX polish — no code path may call `importBackup` without the user first typing the exact confirmation word shown on screen.
- `version: 1` is the only supported backup version. A file with any other `version` value is rejected with a distinct "unsupported version" message (checked *before* full schema validation, so it doesn't get lumped in with the generic "invalid file" message) — no migration logic exists yet, and none should be written speculatively.

---

## File Structure

```
src/
├── features/
│   ├── backup/                              # NEW feature
│   │   ├── schema.ts                        # Backup type, backupSchema, parseBackup, safeParseBackup
│   │   ├── schema.test.ts
│   │   ├── exportBackup.ts                  # buildBackup(uid): Promise<Backup>
│   │   ├── exportBackup.test.ts
│   │   ├── importBackup.ts                  # importBackup(uid, backup): Promise<void>
│   │   └── importBackup.test.ts
│   ├── settings/
│   │   ├── SettingsPane.tsx                 # MODIFY: add Backup section (export + import)
│   │   └── SettingsPane.test.tsx            # NEW
│   ├── categories/                           # unchanged (schema reused, not modified)
│   └── pantry-items/                         # unchanged (schema reused, not modified)
└── locales/
    ├── en-us.json                            # MODIFY: add settings.* backup keys
    └── pt-br.json                            # MODIFY: add settings.* backup keys
e2e/
└── core-loop.spec.ts                         # MODIFY: add export/import round-trip case
```

---

### Task 1: Backup file schema

**Files:**
- Create: `src/features/backup/schema.ts`, `src/features/backup/schema.test.ts`

**Interfaces:**
- Produces:
  - `interface Backup { version: 1; exportedAt: string; settings: { lowStockThreshold: number }; categories: { key: string; name: string; emoji: string; order: number }[]; items: { name: string; category: string; quantity: number; expiringDate: string; duration: number | null; dateOpened: string | null; opened: boolean; recurring: boolean; barcode: string | null; source: "manual" | "barcode" }[]; itemHistory: { name: string; category: string; duration: string; recurring: boolean }[] }`
  - `export const backupSchema: ZodType<Backup>`
  - `parseBackup(data: unknown): Backup` — throws on invalid input.
  - `safeParseBackup(data: unknown): Backup | null` — returns `null` on invalid input instead of throwing (mirrors `safeParseItemHistoryDoc`'s existing convention in `src/features/pantry-items/schema.ts`).

- [ ] **Step 1: Write failing tests for the schema**

`src/features/backup/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseBackup, safeParseBackup } from "./schema";

const validBackup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: { lowStockThreshold: 3 },
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

describe("parseBackup", () => {
	it("parses a well-formed backup", () => {
		expect(parseBackup(validBackup)).toEqual(validBackup);
	});

	it("rejects an unsupported version", () => {
		expect(() => parseBackup({ ...validBackup, version: 2 })).toThrow();
	});

	it("rejects a malformed item entry", () => {
		expect(() =>
			parseBackup({
				...validBackup,
				items: [{ ...validBackup.items[0], quantity: -1 }],
			}),
		).toThrow();
	});

	it("rejects a non-integer settings threshold", () => {
		expect(() =>
			parseBackup({
				...validBackup,
				settings: { lowStockThreshold: 2.5 },
			}),
		).toThrow();
	});
});

describe("safeParseBackup", () => {
	it("returns null instead of throwing for invalid input", () => {
		expect(safeParseBackup({ not: "a backup" })).toBeNull();
	});

	it("returns the parsed backup for valid input", () => {
		expect(safeParseBackup(validBackup)).toEqual(validBackup);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/backup/schema.test.ts
```

Expected: FAIL with "Cannot find module './schema'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Implement the schema**

`src/features/backup/schema.ts`:

```typescript
import { z } from "zod";

const backupSettingsSchema = z.object({
	lowStockThreshold: z.number().int().positive(),
});

const backupCategorySchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1),
	emoji: z.string().min(1),
	order: z.number().int().nonnegative(),
});

const backupItemSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	quantity: z.number().int().nonnegative(),
	expiringDate: z.string().datetime(),
	duration: z.number().int().positive().nullable(),
	dateOpened: z.string().datetime().nullable(),
	opened: z.boolean(),
	recurring: z.boolean(),
	barcode: z.string().nullable(),
	source: z.enum(["manual", "barcode"]),
});

const backupItemHistorySchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	duration: z.string(),
	recurring: z.boolean(),
});

export const backupSchema = z.object({
	version: z.literal(1),
	exportedAt: z.string().datetime(),
	settings: backupSettingsSchema,
	categories: z.array(backupCategorySchema),
	items: z.array(backupItemSchema),
	itemHistory: z.array(backupItemHistorySchema),
});

export type Backup = z.infer<typeof backupSchema>;

export function parseBackup(data: unknown): Backup {
	return backupSchema.parse(data);
}

export function safeParseBackup(data: unknown): Backup | null {
	const result = backupSchema.safeParse(data);
	return result.success ? result.data : null;
}
```

Note: `backupSettingsSchema`'s `lowStockThreshold` deliberately does **not** use `.catch()` the way `settingsDocSchema` does (see `src/features/settings/schema.ts`) — that `.catch()` exists to keep a live Firestore `onSnapshot` listener from getting stuck on bad data that's already in production. A backup *file* being imported is different: if it's malformed, the right behavior is to reject the whole import loudly (Task 5's "invalid backup file" message), not silently substitute a default and proceed.

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/backup/schema.test.ts
```

- [ ] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npx vitest run src/features/backup/schema.test.ts
```

```bash
git add src/features/backup/schema.ts src/features/backup/schema.test.ts
git commit -m "feat: add backup file schema"
```

---

### Task 2: Export — `buildBackup`

**Files:**
- Create: `src/features/backup/exportBackup.ts`, `src/features/backup/exportBackup.test.ts`

**Interfaces:**
- Consumes: `Backup` type (Task 1); `db` (`src/lib/firebase.ts`); `parseCategoryDoc` (`src/features/categories/schema.ts`); `parseItemDoc`, `safeParseItemHistoryDoc` (`src/features/pantry-items/schema.ts`); `parseSettingsDoc` (`src/features/settings/schema.ts`).
- Produces: `buildBackup(uid: string): Promise<Backup>`.

- [ ] **Step 1: Write a failing test**

`src/features/backup/exportBackup.test.ts`:

```typescript
import { addDoc, collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { buildBackup } from "./exportBackup";

const uid = "test-user-backup-export-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("buildBackup", () => {
	it("assembles settings, categories, items, and item_history into a versioned backup", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 5 });
		await setDoc(doc(db, "users", uid, "categories", "foods"), {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Milk",
			category: "foods",
			quantity: 2,
			expiring_date: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		});
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Milk")),
			{ name: "Milk", category: "foods", duration: "7", recurring: true },
		);

		const backup = await buildBackup(uid);

		expect(backup.version).toBe(1);
		expect(backup.settings).toEqual({ lowStockThreshold: 5 });
		expect(backup.categories).toEqual([
			{ key: "foods", name: "Foods", emoji: "🍎", order: 0 },
		]);
		expect(backup.items).toEqual([
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
		]);
		expect(backup.itemHistory).toEqual([
			{ name: "Milk", category: "foods", duration: "7", recurring: true },
		]);
	});

	it("defaults settings to the standard threshold when no settings doc exists yet", async () => {
		const backup = await buildBackup(uid);
		expect(backup.settings).toEqual({ lowStockThreshold: 3 });
	});

	it("skips a malformed item_history doc rather than throwing", async () => {
		await setDoc(
			doc(db, "users", uid, "item_history", "broken"),
			{ name: "Broken" }, // missing category/duration/recurring
		);
		const backup = await buildBackup(uid);
		expect(backup.itemHistory).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/backup/exportBackup.test.ts"
```

Expected: FAIL with "Cannot find module './exportBackup'".

- [ ] **Step 3: Implement `buildBackup`**

`src/features/backup/exportBackup.ts`:

```typescript
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { parseCategoryDoc } from "../categories/schema";
import { parseItemDoc, safeParseItemHistoryDoc } from "../pantry-items/schema";
import { parseSettingsDoc } from "../settings/schema";
import type { Backup } from "./schema";

export async function buildBackup(uid: string): Promise<Backup> {
	const [settingsSnap, categoriesSnap, itemsSnap, itemHistorySnap] =
		await Promise.all([
			getDoc(doc(db, "users", uid)),
			getDocs(collection(db, "users", uid, "categories")),
			getDocs(collection(db, "users", uid, "items")),
			getDocs(collection(db, "users", uid, "item_history")),
		]);

	// `parseSettingsDoc({})` deliberately reuses that function's own
	// `.catch(3)` default (see settings/schema.ts) rather than duplicating
	// the literal default value 3 here.
	const settings = parseSettingsDoc(
		settingsSnap.exists() ? settingsSnap.data() : {},
	);

	const categories = categoriesSnap.docs
		.map((d) => parseCategoryDoc(d.id, d.data()))
		.map(({ key, name, emoji, order }) => ({ key, name, emoji, order }));

	const items = itemsSnap.docs
		.map((d) => parseItemDoc(d.id, d.data()))
		.map((item) => ({
			name: item.name,
			category: item.category,
			quantity: item.quantity,
			expiringDate: item.expiringDate.toISOString(),
			duration: item.duration,
			dateOpened: item.dateOpened ? item.dateOpened.toISOString() : null,
			opened: item.opened,
			recurring: item.recurring,
			barcode: item.barcode,
			source: item.source,
		}));

	const itemHistory = itemHistorySnap.docs
		.map((d) => safeParseItemHistoryDoc(d.data()))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		settings,
		categories,
		items,
		itemHistory,
	};
}
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/backup/exportBackup.test.ts"
```

- [ ] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/backup/exportBackup.ts src/features/backup/exportBackup.test.ts
git commit -m "feat: add buildBackup export function"
```

---

### Task 3: Import — `importBackup`

**Files:**
- Create: `src/features/backup/importBackup.ts`, `src/features/backup/importBackup.test.ts`

**Interfaces:**
- Consumes: `Backup` type (Task 1); `db`; `toItemDoc` (`src/features/pantry-items/schema.ts`).
- Produces: `importBackup(uid: string, backup: Backup): Promise<void>`.

- [ ] **Step 1: Write a failing test**

`src/features/backup/importBackup.test.ts`:

```typescript
import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	Timestamp,
} from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { importBackup } from "./importBackup";
import type { Backup } from "./schema";

const uid = "test-user-backup-import-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

const backup: Backup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: { lowStockThreshold: 5 },
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

describe("importBackup", () => {
	it("replaces existing categories/items/item_history/settings with the backup's contents", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await setDoc(doc(db, "users", uid, "categories", "medicines"), {
			key: "medicines",
			name: "Medicines",
			emoji: "💊",
			order: 0,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Stale",
			category: "medicines",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("medicines_Stale")),
			{ name: "Stale", category: "medicines", duration: "", recurring: false },
		);

		await importBackup(uid, backup);

		const settingsSnap = await getDoc(doc(db, "users", uid));
		expect(settingsSnap.data()).toEqual({ lowStockThreshold: 5 });

		const categoriesSnap = await getDocs(
			collection(db, "users", uid, "categories"),
		);
		expect(categoriesSnap.docs.map((d) => d.id)).toEqual(["foods"]);
		expect(categoriesSnap.docs[0].data()).toEqual({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});

		const itemsSnap = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnap.size).toBe(1);
		expect(itemsSnap.docs[0].data().name).toBe("Whole Milk");

		const historySnap = await getDocs(
			collection(db, "users", uid, "item_history"),
		);
		expect(historySnap.docs.map((d) => d.id)).toEqual([
			encodeURIComponent("foods_Whole Milk"),
		]);
		expect(historySnap.docs[0].data()).toEqual({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/backup/importBackup.test.ts"
```

Expected: FAIL with "Cannot find module './importBackup'".

- [ ] **Step 3: Implement `importBackup`**

`src/features/backup/importBackup.ts`:

```typescript
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toItemDoc } from "../pantry-items/schema";
import type { Backup } from "./schema";

export async function importBackup(
	uid: string,
	backup: Backup,
): Promise<void> {
	const [existingCategories, existingItems, existingHistory] =
		await Promise.all([
			getDocs(collection(db, "users", uid, "categories")),
			getDocs(collection(db, "users", uid, "items")),
			getDocs(collection(db, "users", uid, "item_history")),
		]);

	await Promise.all([
		...existingCategories.docs.map((d) => deleteDoc(d.ref)),
		...existingItems.docs.map((d) => deleteDoc(d.ref)),
		...existingHistory.docs.map((d) => deleteDoc(d.ref)),
	]);

	await Promise.all([
		setDoc(doc(db, "users", uid), backup.settings),
		...backup.categories.map((category) =>
			setDoc(doc(db, "users", uid, "categories", category.key), category),
		),
		...backup.items.map((item) =>
			addDoc(
				collection(db, "users", uid, "items"),
				toItemDoc({
					...item,
					expiringDate: new Date(item.expiringDate),
					dateOpened: item.dateOpened ? new Date(item.dateOpened) : null,
				}),
			),
		),
		...backup.itemHistory.map((entry) =>
			setDoc(
				doc(
					db,
					"users",
					uid,
					"item_history",
					encodeURIComponent(`${entry.category}_${entry.name}`),
				),
				entry,
			),
		),
	]);
}
```

Note the two-phase structure (delete everything, *then* write everything) is deliberate — see the design spec's Approach section for why this isn't wrapped in a single atomic transaction, and the accepted partial-failure risk that follows from that.

- [ ] **Step 4: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/backup/importBackup.test.ts"
```

- [ ] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/backup/importBackup.ts src/features/backup/importBackup.test.ts
git commit -m "feat: add importBackup function"
```

---

### Task 4: Export UI

**Files:**
- Modify: `src/features/settings/SettingsPane.tsx`, `src/locales/en-us.json`, `src/locales/pt-br.json`
- Create: `src/features/settings/SettingsPane.test.tsx`

**Interfaces:**
- Consumes: `buildBackup` (Task 2).
- Produces: `SettingsPane` gains a "Backup" section with an Export button. No prop-signature change (`SettingsPane` still takes `{ uid: string; settings: Settings }`).

- [ ] **Step 1: Write a failing test**

`src/features/settings/SettingsPane.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as exportBackupModule from "../backup/exportBackup";
import { SettingsPane } from "./SettingsPane";
import type { Settings } from "./schema";

const settings: Settings = { lowStockThreshold: 3 };

const fixtureBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings,
	categories: [],
	items: [],
	itemHistory: [],
};

describe("SettingsPane export", () => {
	beforeEach(() => {
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn(() => "blob:mock-url"),
			revokeObjectURL: vi.fn(),
		});
	});

	it("builds and downloads a backup file when Export is clicked", async () => {
		const buildBackupSpy = vi
			.spyOn(exportBackupModule, "buildBackup")
			.mockResolvedValue(fixtureBackup);
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		render(<SettingsPane uid="test-user-export-ui" settings={settings} />);
		await userEvent.click(
			screen.getByRole("button", { name: /export backup/i }),
		);

		expect(buildBackupSpy).toHaveBeenCalledWith("test-user-export-ui");
		await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
		expect(URL.createObjectURL).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

Expected: FAIL — no button with an accessible name matching `/export backup/i` exists yet.

- [ ] **Step 3: Add locale keys**

Add to the `"settings"` object in **both** `src/locales/en-us.json` and `src/locales/pt-br.json`:

en-us.json:
```json
"backupTitle": "Backup",
"exportBackup": "Export backup"
```

pt-br.json:
```json
"backupTitle": "Backup",
"exportBackup": "Exportar backup"
```

- [ ] **Step 4: Add the Export button to `SettingsPane`**

Modify `src/features/settings/SettingsPane.tsx`. Run `antd info Button` first to confirm current props. Add, below the existing `lowStockThreshold` `Form.Item`, a new `Form.Item label={t("settings.backupTitle")}` containing a `Button` with `icon={<DownloadOutlined />}` (from `@ant-design/icons`, already a project dependency — see `ItemList.tsx`/`ShoppingList.tsx` for existing `@ant-design/icons` import examples) whose visible text is `{t("settings.exportBackup")}`, and an `onClick` handler doing exactly this (plain DOM APIs, no antd verification needed):

```typescript
const handleExport = async () => {
	try {
		const backup = await buildBackup(uid);
		const blob = new Blob([JSON.stringify(backup, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `expiring-products-backup-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	} catch {
		message.error("Something went wrong, please try again");
	}
};
```

Import `buildBackup` from `../backup/exportBackup`.

- [ ] **Step 5: Run it, verify it passes**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Sign in, open the Settings tab, click "Export backup" (or "Exportar backup"), confirm a `.json` file downloads and its contents look like a `Backup` object with your actual data.

- [ ] **Step 7: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx \
  src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add backup export to Settings"
```

---

### Task 5: Import UI

**Files:**
- Modify: `src/features/settings/SettingsPane.tsx`, `src/features/settings/SettingsPane.test.tsx`, `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `safeParseBackup`, `Backup` type (Task 1); `importBackup` (Task 3).
- Produces: `SettingsPane`'s Backup section gains an Import button, a hidden file input, and a typed-confirmation `Modal`. No prop-signature change.

- [ ] **Step 1: Write failing tests**

Append to `src/features/settings/SettingsPane.test.tsx` (add these imports alongside the existing ones, and this new `describe` block after the existing one):

```tsx
import * as importBackupModule from "../backup/importBackup";
```

```tsx
const fixtureImportBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: { lowStockThreshold: 5 },
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [],
	itemHistory: [],
};

describe("SettingsPane import", () => {
	it("shows an error for a non-JSON file and does not open the confirm modal", async () => {
		render(<SettingsPane uid="test-user-import-ui-1" settings={settings} />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File(["not json"], "backup.json", { type: "application/json" }),
		);

		expect(
			await screen.findByText(/doesn't look like a valid backup file/i),
		).toBeInTheDocument();
		expect(screen.queryByText(/replace all data/i)).not.toBeInTheDocument();
	});

	it("rejects an unsupported backup version without opening the confirm modal", async () => {
		render(<SettingsPane uid="test-user-import-ui-2" settings={settings} />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File(
				[JSON.stringify({ ...fixtureImportBackup, version: 2 })],
				"backup.json",
				{ type: "application/json" },
			),
		);

		expect(
			await screen.findByText(/newer version of the app/i),
		).toBeInTheDocument();
		expect(screen.queryByText(/replace all data/i)).not.toBeInTheDocument();
	});

	it("requires typing the confirm word before Import is enabled, then calls importBackup", async () => {
		const importBackupSpy = vi
			.spyOn(importBackupModule, "importBackup")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-import-ui-3" settings={settings} />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File([JSON.stringify(fixtureImportBackup)], "backup.json", {
				type: "application/json",
			}),
		);

		expect(await screen.findByText(/replace all data/i)).toBeInTheDocument();
		const okButton = screen.getByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "replace");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);
		expect(importBackupSpy).toHaveBeenCalledWith(
			"test-user-import-ui-3",
			fixtureImportBackup,
		);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

Expected: FAIL — no element with accessible name matching `/import backup/i` exists yet.

- [ ] **Step 3: Add locale keys**

Add to the `"settings"` object in **both** locale files, alongside the Task 4 keys:

en-us.json:
```json
"importBackup": "Import backup",
"invalidBackupFile": "This doesn't look like a valid backup file.",
"unsupportedBackupVersion": "This backup file was created by a newer version of the app and can't be imported.",
"importConfirmTitle": "Replace all data?",
"importConfirmBody": "This will permanently delete your current {{itemCount}} items and {{categoryCount}} categories and replace them with the contents of this backup file. Type \"{{confirmWord}}\" to confirm.",
"importConfirmWord": "replace",
"importConfirmInputLabel": "Confirmation",
"importConfirmPlaceholder": "Type \"{{confirmWord}}\" to confirm",
"importSuccess": "Backup imported successfully.",
"importPartialFailure": "Something went wrong during import — some data may not have imported. Check your pantry and try again if needed."
```

pt-br.json:
```json
"importBackup": "Importar backup",
"invalidBackupFile": "Isso não parece ser um arquivo de backup válido.",
"unsupportedBackupVersion": "Este arquivo de backup foi criado por uma versão mais nova do aplicativo e não pode ser importado.",
"importConfirmTitle": "Substituir todos os dados?",
"importConfirmBody": "Isso vai apagar permanentemente seus {{itemCount}} itens e {{categoryCount}} categorias atuais e substituí-los pelo conteúdo deste arquivo de backup. Digite \"{{confirmWord}}\" para confirmar.",
"importConfirmWord": "substituir",
"importConfirmInputLabel": "Confirmação",
"importConfirmPlaceholder": "Digite \"{{confirmWord}}\" para confirmar",
"importSuccess": "Backup importado com sucesso.",
"importPartialFailure": "Algo deu errado durante a importação — alguns dados podem não ter sido importados. Verifique sua despensa e tente novamente se necessário."
```

- [ ] **Step 4: Add the Import button, file input, and confirm modal**

Modify `src/features/settings/SettingsPane.tsx`. Run `antd info Modal` and `antd info Input` first to confirm current props (you already have `antd info Button` from Task 4).

Structure required, in the same "Backup" `Form.Item` added in Task 4, next to the Export button:

1. A visible `Button` with `icon={<UploadOutlined />}` and text `{t("settings.importBackup")}`, whose `onClick` calls `.click()` on a ref to a hidden native file input (do not use antd's `Upload` component — a plain `<input>` is simpler here and this app has no other use for `Upload`).
2. A hidden native `<input type="file" accept=".json" ref={fileInputRef} aria-label={t("settings.importBackup")} style={{ display: "none" }} onChange={handleFileChange} />`. It's deliberately given the *same* accessible name as the visible button (they represent the same user-facing action; tests select the input directly via `getByLabelText` since `userEvent.upload` needs the actual `<input>` element, while `antd`'s `Button` needs its own separate `getByRole("button", ...)` — this dual-affordance pattern is why the button's `onClick` must forward the click rather than the input being reachable/clickable directly).
3. `handleFileChange`, with this exact logic:

```typescript
const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
	const file = event.target.files?.[0];
	event.target.value = ""; // allow re-selecting the same file later
	if (!file) return;

	let json: unknown;
	try {
		json = JSON.parse(await file.text());
	} catch {
		message.error(t("settings.invalidBackupFile"));
		return;
	}

	if (
		typeof json === "object" &&
		json !== null &&
		"version" in json &&
		(json as { version: unknown }).version !== 1
	) {
		message.error(t("settings.unsupportedBackupVersion"));
		return;
	}

	const parsed = safeParseBackup(json);
	if (!parsed) {
		message.error(t("settings.invalidBackupFile"));
		return;
	}

	setPendingBackup(parsed);
	setConfirmText("");
	setImportModalOpen(true);
};
```

4. Three new pieces of component state: `pendingBackup` (`Backup | null`, initially `null`), `confirmText` (`string`, initially `""`), `importModalOpen` (`boolean`, initially `false`).
5. A controlled `Modal`:
   - `open={importModalOpen}`, `title={t("settings.importConfirmTitle")}`.
   - Body: a paragraph with `t("settings.importConfirmBody", { itemCount: pendingBackup?.items.length ?? 0, categoryCount: pendingBackup?.categories.length ?? 0, confirmWord: t("settings.importConfirmWord") })`, and an `Input` bound to `confirmText`, with `aria-label={t("settings.importConfirmInputLabel")}` and `placeholder={t("settings.importConfirmPlaceholder", { confirmWord: t("settings.importConfirmWord") })}`.
   - `okButtonProps={{ disabled: confirmText.trim() !== t("settings.importConfirmWord"), danger: true }}`.
   - `onOk={handleImportConfirm}`, `onCancel={handleImportCancel}`.
6. `handleImportConfirm` and `handleImportCancel`:

```typescript
const handleImportConfirm = async () => {
	if (!pendingBackup) return;
	try {
		await importBackup(uid, pendingBackup);
		message.success(t("settings.importSuccess"));
	} catch {
		message.error(t("settings.importPartialFailure"));
	} finally {
		setImportModalOpen(false);
		setPendingBackup(null);
		setConfirmText("");
	}
};

const handleImportCancel = () => {
	setImportModalOpen(false);
	setPendingBackup(null);
	setConfirmText("");
};
```

Import `safeParseBackup`/`Backup` from `../backup/schema` and `importBackup` from `../backup/importBackup`.

- [ ] **Step 5: Run it, verify it passes**

```bash
npx vitest run src/features/settings/SettingsPane.test.tsx
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Sign in, export a backup (Task 4's button), add another item, then import the file you just exported. Confirm the modal shows correct item/category counts, that OK stays disabled until you type the exact confirmation word, and that after confirming, the pantry reflects the imported file's contents (the extra item you added after exporting should be gone).

- [ ] **Step 7: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx \
  src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add backup import to Settings"
```

---

### Task 6: E2e round-trip coverage and final verification

**Files:**
- Modify: `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full feature built in Tasks 1–5.

- [ ] **Step 1: Add an export/import round-trip e2e case**

Add a new `test(...)` to `e2e/core-loop.spec.ts`, following its established conventions (pt-br button/label text, the `.ant-picker-cell-today` date-picker workaround, `page.getByRole("tab", { name: ... })` for tab switching). The Settings tab's accessible tab name is the literal emoji `"⚙️"` (see `src/features/categories/CategoryTabs.tsx`).

```typescript
test("exports a backup and re-imports it, restoring the pantry to the exported state (round trip)", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-backup-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Whole Milk");
	await page.getByLabel("Quantidade").fill("2");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Whole Milk")).toBeVisible();

	await page.getByRole("tab", { name: "⚙️" }).click();

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Exportar backup" }).click();
	const download = await downloadPromise;
	const backupPath = await download.path();
	if (!backupPath) throw new Error("expected a downloaded file path");

	// Add a second item the exported backup does NOT contain, so re-importing
	// the export proves it actually replaced current state rather than
	// leaving things as they already were.
	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Extra Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Extra Item")).toBeVisible();

	await page.getByRole("tab", { name: "⚙️" }).click();
	await page.getByLabel("Importar backup").setInputFiles(backupPath);

	await expect(page.getByText(/substituir todos os dados/i)).toBeVisible();
	await page.getByLabel("Confirmação").fill("substituir");
	await page.getByRole("button", { name: "OK" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await expect(page.getByText("Whole Milk")).toBeVisible();
	await expect(page.getByText("Extra Item")).not.toBeVisible();
});
```

Verify every selector empirically against the real running app rather than trusting this brief blindly — check the actual rendered DOM/accessible names before assuming they match (Phase 1's and Phase 2's e2e tasks both found brief-guessed selectors needed small adjustments after checking reality).

- [ ] **Step 2: Run it against the emulator**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (all existing cases plus the new round-trip case).

- [ ] **Step 3: Run the full verification suite one more time**

```bash
npm run format
npm run lint
npm run build
npm test
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

All five must be clean before this task is considered done.

- [ ] **Step 4: Commit**

```bash
git add e2e/core-loop.spec.ts
git commit -m "test: add e2e coverage for backup export/import round trip"
```

---

## Self-Review Notes

- **Spec coverage:** full-account backup file format with versioning (Task 1) ✓; export reading every collection via existing parse functions (Task 2) ✓; full-replace import with the accepted-risk two-phase delete/write (Task 3) ✓; Export UI triggering a real browser download (Task 4) ✓; Import UI with malformed-file/unsupported-version/typed-confirmation handling exactly as specced (Task 5) ✓; end-to-end round-trip proof (Task 6) ✓. Every "Out of scope" item from the spec (merge-on-import, scheduled backups, format migrations, server-side export/import) has no corresponding task, as intended.
- **Type consistency:** `Backup` (Task 1) is the single shape threaded through `buildBackup` (Task 2), `importBackup` (Task 3), and `SettingsPane` (Tasks 4–5) — no redefinition anywhere. `safeParseBackup`'s `Backup | null` return type is what `handleFileChange` (Task 5) checks with a plain `if (!parsed)` guard, matching the existing `safeParseItemHistoryDoc` convention it was modeled on.
- **Placeholder scan:** no TBD/TODO markers. Tasks 4–5's antd-specific JSX (Button/Modal/Input wiring) is deliberately left to be verified against the live antd API rather than pasted from memory, per this project's established plan-writing convention (see Global Constraints) — every other piece of logic (handlers, locale strings, test assertions) is given exactly.
