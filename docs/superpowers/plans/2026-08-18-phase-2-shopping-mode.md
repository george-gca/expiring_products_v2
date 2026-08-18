# Phase 2: Shopping Mode + Recurring Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-category Shopping Mode that shows recurring items whose pantry stock has dropped to or below a shared, user-editable threshold, with quick re-add and per-session skip — plus let recurring status be edited after the fact, and give the Settings tab its first real content.

**Architecture:** The shopping list is derived, not stored — computed client-side from `item_history` (which items are recurring) joined against already-fetched pantry quantities (summed by name). A new `users/{uid}` root Firestore doc holds the one shared setting (`lowStockThreshold`), following `useCategories`' bootstrap-if-missing pattern. Everything else follows Phase 1's established layering: Zod schema at the Firestore boundary, plain hooks wrapping `onSnapshot`, writes isolated to `firestoreWrites.ts` files, Zustand for local per-device UI state.

**Tech Stack:** Same as Phase 1 — Vite, React 19, TypeScript, Ant Design v6, Firebase (Auth + Firestore, Local Emulator Suite for tests), Zustand, react-i18next, Zod, Vitest, Playwright, Biome.

## Global Constraints

- Firestore reads go through a Zod schema — no untyped `doc.data()` access. This phase adds the first schema for `item_history` (write-only since Phase 1) and a new one for the settings doc.
- `afterEach` emulator cleanup always calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal.
- For emulator-backed tests, run the full `npm test`, or `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"` for a filtered run — `npm test -- <path>` does not filter (see CLAUDE.md).
- Always run the FULL `npm run lint` (`biome check . && eslint .`) before considering a task done, not just `tsc` — `eslint-plugin-react-hooks`'s `rules-of-hooks` check only runs there, and Phase 1 shipped a real crash once from skipping this.
- **Before writing any Ant Design component code, verify the current API with `antd info <Component>` / `antd demo <Component> <name>` — do not write component JSX from memory.** Phase 1's plan wrote full antd component bodies directly into task briefs, and several shipped with real bugs (a deprecated `List` no one re-checked, a dropped import, wrong config). This plan deliberately does NOT hand you pasteable component code for UI tasks — it describes the required structure and behavior, and you verify the exact API yourself.
- Ant Design v6's `DatePicker` uses `dayjs`, not native `Date` — irrelevant to this phase's new UI (no new date pickers), noted only because `AddItemModal` (which this phase modifies) already has one.
- The error-handling convention established in Phase 1: hooks call `message.error("Something went wrong, please try again")` inside their `onSnapshot` error callback (see `useCategories.ts`/`usePantryItems.ts` for the exact pattern); write functions throw and the calling component wraps the call in `try/catch` + the same `message.error` call (see `AddItemModal.tsx`/`EditItemModal.tsx`). Follow this exact convention for every new hook/write in this phase — don't invent a different error-handling shape.
- No Firestore security-rule changes are in scope (no `firestore.rules` file exists yet in this project — out of scope since Phase 1, unchanged here).
- **Phase 1 built `useUiPreferencesStore`'s sort/filter state but never built the UI controls to change it (no visible sort/filter widget exists in `ItemList.tsx` today).** The design spec's "hide sort/filter controls in Shopping Mode" therefore has nothing to actually hide right now — don't go looking for controls to hide; just conditionally render the shopping-list view instead of the normal list.

---

## File Structure

```
src/
├── features/
│   ├── settings/                          # NEW feature
│   │   ├── schema.ts                      # Settings type, parseSettingsDoc
│   │   ├── schema.test.ts
│   │   ├── useSettings.ts                 # read hook, bootstrap-if-missing
│   │   ├── useSettings.test.tsx
│   │   ├── firestoreWrites.ts             # updateLowStockThreshold
│   │   ├── firestoreWrites.test.ts
│   │   └── SettingsPane.tsx               # replaces AppRoute's placeholder div
│   ├── pantry-items/
│   │   ├── schema.ts                      # MODIFY: add itemHistoryDocSchema/parseItemHistoryDoc
│   │   ├── schema.test.ts                 # MODIFY: add tests for the above
│   │   ├── useShoppingList.ts             # NEW
│   │   ├── useShoppingList.test.tsx       # NEW
│   │   ├── store.ts                       # MODIFY: add shoppingModeOn + skippedNames
│   │   ├── store.test.ts                  # MODIFY: add tests for the above
│   │   ├── firestoreWrites.ts             # MODIFY: add setItemRecurring
│   │   ├── firestoreWrites.test.ts        # MODIFY: add tests for the above
│   │   ├── ShoppingList.tsx               # NEW
│   │   ├── AddItemModal.tsx               # MODIFY: add initialName prop
│   │   ├── EditItemModal.tsx              # MODIFY: add recurring Switch
│   │   └── ItemList.tsx                   # MODIFY: shopping-mode toggle + threshold prop
│   └── categories/                        # unchanged
├── routes/
│   └── app-route.tsx                      # MODIFY: wire useSettings, SettingsPane, threshold passthrough
└── test/                                  # unchanged
e2e/
└── core-loop.spec.ts                      # MODIFY: extend with a shopping-mode case
```

---

### Task 1: Settings schema + read hook

**Files:**
- Create: `src/features/settings/schema.ts`, `src/features/settings/schema.test.ts`, `src/features/settings/useSettings.ts`, `src/features/settings/useSettings.test.tsx`

**Interfaces:**
- Produces: `interface Settings { lowStockThreshold: number }`; `parseSettingsDoc(data: unknown): Settings`; `useSettings(uid: string): { settings: Settings; loading: boolean }`. `settings` is never `null` — the hook seeds `{ lowStockThreshold: 3 }` synchronously as initial state and only flips `loading` to `false` once the real `onSnapshot` data (bootstrapped or existing) arrives, exactly mirroring `useCategories`'s non-nullable `categories: Category[]` (defaults to `[]`) return shape.

- [ ] **Step 1: Write failing tests for the schema**

`src/features/settings/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseSettingsDoc } from "./schema";

describe("parseSettingsDoc", () => {
	it("parses a valid settings document", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 3 })).toEqual({
			lowStockThreshold: 3,
		});
	});

	it("throws on a missing lowStockThreshold field", () => {
		expect(() => parseSettingsDoc({})).toThrow();
	});

	it("throws on a non-positive lowStockThreshold", () => {
		expect(() => parseSettingsDoc({ lowStockThreshold: 0 })).toThrow();
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/settings/schema.test.ts
```

Expected: FAIL — module `./schema` doesn't exist.

- [ ] **Step 3: Implement the schema**

`src/features/settings/schema.ts` — a Zod object schema with one field, `lowStockThreshold: z.number().int().positive()`; a `Settings` interface with that same field; `parseSettingsDoc(data: unknown): Settings` that parses and returns it. Follow the exact style of `src/features/categories/schema.ts` (object schema + interface + parse function), minus the `id` parameter — this doc has no separate id to thread through (it lives at the fixed path `users/{uid}`, not in a subcollection with per-doc ids).

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/settings/schema.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write a failing test for `useSettings`**

`src/features/settings/useSettings.test.tsx`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useSettings } from "./useSettings";

const uid = "test-user-settings-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useSettings", () => {
	it("bootstraps the default threshold when no settings doc exists", async () => {
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(3);
	});

	it("does not overwrite an existing settings doc", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 7 });
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(7);
	});
});
```

- [ ] **Step 6: Run it, verify it fails**

```bash
npm test -- src/features/settings/useSettings.test.tsx
```

(Filtering won't work per the Global Constraints note — run the full `npm test` and confirm these two new tests fail with "module not found" among the output.)

- [ ] **Step 7: Implement `useSettings`**

Follow `src/features/categories/useCategories.ts`'s exact structure: an internal `ensureSettingsDoc(uid)` async function that does a `getDoc(doc(db, "users", uid))`, and if it doesn't exist, `setDoc`s the default `{ lowStockThreshold: 3 }` (no merge needed — the doc doesn't exist yet). Then, inside a `useEffect`, call `ensureSettingsDoc(uid).then(() => subscribe via onSnapshot(doc(db, "users", uid), ...))`, same two-step bootstrap-then-subscribe shape as `useCategories`. The `onSnapshot` success callback parses via `parseSettingsDoc` and calls `setSettings`; the error callback calls `message.error("Something went wrong, please try again")` and still sets `loading` to `false`. Return `{ settings, loading }`.

- [ ] **Step 8: Run it, verify it passes**

```bash
npm test
```

Expected: all tests pass, including the 2 new `useSettings` tests.

- [ ] **Step 9: Commit**

```bash
git add src/features/settings/schema.ts src/features/settings/schema.test.ts \
  src/features/settings/useSettings.ts src/features/settings/useSettings.test.tsx
git commit -m "feat: add settings schema and bootstrap-if-missing read hook"
```

---

### Task 2: Settings write function, SettingsPane, and AppRoute wiring

**Files:**
- Create: `src/features/settings/firestoreWrites.ts`, `src/features/settings/firestoreWrites.test.ts`, `src/features/settings/SettingsPane.tsx`
- Modify: `src/routes/app-route.tsx`

**Interfaces:**
- Consumes: `db` (`src/lib/firebase.ts`), `useSettings` (Task 1).
- Produces: `updateLowStockThreshold(uid: string, value: number): Promise<void>`. `AppRoute` now calls `useSettings(user.uid)` and threads `settings.lowStockThreshold` through to `ItemList` (Task 8 will consume this) and `settings` + `user.uid` through to `SettingsPane`.

- [ ] **Step 1: Write a failing test for the write function**

`src/features/settings/firestoreWrites.test.ts`:

```typescript
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { updateLowStockThreshold } from "./firestoreWrites";

const uid = "test-user-settings-2";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("updateLowStockThreshold", () => {
	it("updates an existing settings doc's threshold", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateLowStockThreshold(uid, 5);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.lowStockThreshold).toBe(5);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/settings/firestoreWrites.test.ts
```

Run the full `npm test` per the filtering gotcha; confirm this test fails with "module not found."

- [ ] **Step 3: Implement `updateLowStockThreshold`**

`src/features/settings/firestoreWrites.ts`: one function, `updateLowStockThreshold(uid: string, value: number): Promise<void>`, doing `setDoc(doc(db, "users", uid), { lowStockThreshold: value }, { merge: true })`.

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test
```

- [ ] **Step 5: Build `SettingsPane`**

Create `src/features/settings/SettingsPane.tsx`, a component taking `{ uid: string; settings: Settings }` as props. Verify Ant Design's `InputNumber` current API with `antd info InputNumber` before writing this — you need: a labeled number input bound to `settings.lowStockThreshold`, calling `updateLowStockThreshold(uid, newValue)` when the value is committed (check `InputNumber`'s `onChange`/`changeOnBlur` behavior via the CLI — you want the write to happen once the user finishes editing, not on every keystroke), wrapped in `try/catch` + `message.error("Something went wrong, please try again")` matching the established convention. Use the `t()` translation function for the label (add a new key, e.g. `settings.lowStockThreshold`, to both `src/locales/pt-br.json` and `src/locales/en-us.json` — pick reasonable translations, e.g. pt-br: "Aviso de estoque baixo" / en-us: "Low stock warning threshold"). Minimum input value should be 1 (can't have a non-positive threshold, matching the schema's `.positive()` constraint).

- [ ] **Step 6: Wire `useSettings` and `SettingsPane` into `AppRoute`**

Modify `src/routes/app-route.tsx`: call `useSettings(user.uid)`, rename the existing `useCategories` destructured `loading` to `categoriesLoading` and the new one to `settingsLoading` to avoid a name collision, and gate rendering on both being false (`if (categoriesLoading || settingsLoading) return null;`). Replace the `settingsPane={<div>Settings — Phase 4</div>}` placeholder with `settingsPane={<SettingsPane uid={user.uid} settings={settings} />}`.

- [ ] **Step 7: Verify manually**

```bash
npm run dev
```

Sign in, open the Settings tab, confirm the threshold input shows `3` and that changing it and navigating away/back shows the new value (confirms the Firestore round-trip).

- [ ] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/settings/firestoreWrites.ts src/features/settings/firestoreWrites.test.ts \
  src/features/settings/SettingsPane.tsx src/routes/app-route.tsx \
  src/locales/pt-br.json src/locales/en-us.json
git commit -m "feat: add settings write function, SettingsPane, and AppRoute wiring"
```

---

### Task 3: `item_history` Zod schema

**Files:**
- Modify: `src/features/pantry-items/schema.ts`, `src/features/pantry-items/schema.test.ts`

**Interfaces:**
- Produces: `interface ItemHistoryEntry { name: string; category: string; duration: string; recurring: boolean }`; `parseItemHistoryDoc(data: unknown): ItemHistoryEntry`. Task 4's `useShoppingList` consumes this.

This is `item_history`'s first Firestore *read* in the codebase (it's been write-only since Phase 1's `addItem`) — match the exact field shapes that write already produces: `name: string`, `category: string`, `duration: string` (yes, a string — `addItem` stores `String(item.duration)` or `""`, not a number), `recurring: boolean`.

- [ ] **Step 1: Write failing tests**

Append to `src/features/pantry-items/schema.test.ts`:

```typescript
describe("parseItemHistoryDoc", () => {
	it("parses a valid item_history document", () => {
		const result = parseItemHistoryDoc({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
		expect(result).toEqual({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
	});

	it("parses a document with an empty duration string", () => {
		const result = parseItemHistoryDoc({
			name: "Aspirin",
			category: "medicines",
			duration: "",
			recurring: false,
		});
		expect(result.duration).toBe("");
	});

	it("throws on a missing recurring field", () => {
		expect(() =>
			parseItemHistoryDoc({ name: "X", category: "foods", duration: "" }),
		).toThrow();
	});
});
```

Add the import for `parseItemHistoryDoc` alongside the file's existing imports.

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

Expected: FAIL — `parseItemHistoryDoc` is not exported.

- [ ] **Step 3: Implement it**

Append to `src/features/pantry-items/schema.ts`: an `itemHistoryDocSchema` (Zod object: `name: z.string().min(1)`, `category: z.string().min(1)`, `duration: z.string()`, `recurring: z.boolean()`), an `ItemHistoryEntry` interface matching it, and `parseItemHistoryDoc(data: unknown): ItemHistoryEntry` that parses and returns it directly (no field renaming/Timestamp conversion needed — unlike `parseItemDoc`, every field here maps straight through).

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

Expected: PASS (existing tests + 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/schema.ts src/features/pantry-items/schema.test.ts
git commit -m "feat: add item_history Zod schema for its first Firestore read"
```

---

### Task 4: `useShoppingList` hook

**Files:**
- Create: `src/features/pantry-items/useShoppingList.ts`, `src/features/pantry-items/useShoppingList.test.tsx`

**Interfaces:**
- Consumes: `parseItemHistoryDoc` (Task 3), `PantryItem` (existing `schema.ts`).
- Produces: `interface ShoppingListEntry { name: string; quantity: number }`; `useShoppingList(uid: string, categoryKey: string, pantryItems: PantryItem[], threshold: number): { shoppingList: ShoppingListEntry[]; loading: boolean }`. This hook does NOT know about session-skipped names — that filtering happens in the `ShoppingList` component (Task 8), same layering as `usePantryItems` (raw Firestore data) vs. `ItemList` (applies Zustand-derived sort/filter on top). The returned list is unsorted; Task 8's component sorts it.

Internally, only subscribe to Firestore inside the `useEffect` (deps: `[uid, categoryKey]`) and store just the recurring names + `loading` in state — do NOT put `pantryItems` in that effect's dependency array or try to read it inside the `onSnapshot` callback via a ref. Instead, compute `shoppingList` as a plain derived value on every call (no `useState`/`useEffect` involved for it): from the stored recurring names, `pantryItems`, and `threshold`, computed fresh each render. This keeps the Firestore subscription stable across parent re-renders (which pass a new `pantryItems` array reference every time) without needing a ref workaround.

- [ ] **Step 1: Write failing tests**

`src/features/pantry-items/useShoppingList.test.tsx`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { PantryItem } from "./schema";
import { useShoppingList } from "./useShoppingList";

const uid = "test-user-shopping-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

async function seedHistory(name: string, recurring: boolean) {
	const historyId = encodeURIComponent(`foods_${name}`);
	await setDoc(doc(db, "users", uid, "item_history", historyId), {
		name,
		category: "foods",
		duration: "",
		recurring,
	});
}

function makeItem(name: string, quantity: number): PantryItem {
	return {
		id: name,
		name,
		category: "foods",
		quantity,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: true,
		barcode: null,
		source: "manual",
	};
}

describe("useShoppingList", () => {
	it("includes a recurring item at or below the threshold", async () => {
		await seedHistory("Milk", true);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 2)], 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([{ name: "Milk", quantity: 2 }]);
	});

	it("excludes a recurring item above the threshold", async () => {
		await seedHistory("Milk", true);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 5)], 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("excludes a non-recurring item even with zero stock", async () => {
		await seedHistory("Napkins", false);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [], 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("includes a recurring item with zero current pantry quantity", async () => {
		await seedHistory("Eggs", true);
		const { result } = renderHook(() => useShoppingList(uid, "foods", [], 3));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([{ name: "Eggs", quantity: 0 }]);
	});

	it("aggregates quantity across multiple item docs with the same name", async () => {
		await seedHistory("Milk", true);
		const items = [makeItem("Milk", 1), { ...makeItem("Milk", 1), id: "milk-2", opened: true }];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([{ name: "Milk", quantity: 2 }]);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/pantry-items/useShoppingList.test.tsx
```

Run the full `npm test`; confirm these 5 new tests fail with "module not found."

- [ ] **Step 3: Implement `useShoppingList`**

`src/features/pantry-items/useShoppingList.ts`: inside a `useEffect` with deps `[uid, categoryKey]`, subscribe via `onSnapshot` to `query(collection(db, "users", uid, "item_history"), where("category", "==", categoryKey), where("recurring", "==", true))`. On each snapshot, parse each doc via `parseItemHistoryDoc`, store the resulting entries' `name`s as state (e.g. `recurringNames: string[]`), and flip `loading` to `false`. Error callback: same `message.error(...)` convention as `usePantryItems`.

Then, on every call (not inside the effect, not stored in its own `useState` — a plain computed value, recalculated each render from the current `pantryItems`/`threshold` arguments and the `recurringNames` state): for each name in `recurringNames`, sum `quantity` across every item in `pantryItems` whose `name` matches exactly (default `0` if none match), and keep it as a `ShoppingListEntry` if that sum is `<= threshold`. Return `{ shoppingList: <that computed array>, loading }`.

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test
```

Expected: all tests pass, including the 5 new `useShoppingList` tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/useShoppingList.ts src/features/pantry-items/useShoppingList.test.tsx
git commit -m "feat: add useShoppingList hook deriving low-stock recurring items"
```

---

### Task 5: Zustand store — shopping mode + skipped names

**Files:**
- Modify: `src/features/pantry-items/store.ts`, `src/features/pantry-items/store.test.ts`

**Interfaces:**
- Produces (added to the existing `useUiPreferencesStore`): `isShoppingModeOn(categoryKey: string): boolean`; `setShoppingModeOn(categoryKey: string, on: boolean): void` (setting `on` to `false` also clears that category's skipped names); `getSkippedNames(categoryKey: string): Set<string>`; `skipItem(categoryKey: string, name: string): void`.

- [ ] **Step 1: Write failing tests**

Append to `src/features/pantry-items/store.test.ts`:

```typescript
describe("shopping mode state", () => {
	it("defaults to off with no skipped names for an unseen category", () => {
		const state = useUiPreferencesStore.getState();
		expect(state.isShoppingModeOn("foods")).toBe(false);
		expect(state.getSkippedNames("foods")).toEqual(new Set());
	});

	it("tracks shopping mode and skipped names per category independently", () => {
		const { setShoppingModeOn, skipItem, isShoppingModeOn, getSkippedNames } =
			useUiPreferencesStore.getState();
		setShoppingModeOn("foods", true);
		skipItem("foods", "Coffee");
		expect(isShoppingModeOn("foods")).toBe(true);
		expect(getSkippedNames("foods")).toEqual(new Set(["Coffee"]));
		expect(isShoppingModeOn("medicines")).toBe(false);
		expect(getSkippedNames("medicines")).toEqual(new Set());
	});

	it("clears skipped names for a category when shopping mode turns off", () => {
		const { setShoppingModeOn, skipItem, getSkippedNames } =
			useUiPreferencesStore.getState();
		setShoppingModeOn("foods", true);
		skipItem("foods", "Coffee");
		setShoppingModeOn("foods", false);
		expect(getSkippedNames("foods")).toEqual(new Set());
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/store.test.ts
```

Expected: FAIL — the new methods don't exist on the store.

- [ ] **Step 3: Implement the store extension**

Add to `UiPreferencesState` and the `create<UiPreferencesState>((set, get) => ({...}))` body in `store.ts`: `shoppingModeOnByCategory: Record<string, boolean>` and `skippedNamesByCategory: Record<string, Set<string>>` state fields (both defaulting to `{}`); `isShoppingModeOn`/`getSkippedNames` getters mirroring the existing `getSortDirection`/`getFilter` pattern (default `false` / `new Set()` for an unseen key); `setShoppingModeOn(categoryKey, on)` that updates `shoppingModeOnByCategory` and, when `on` is `false`, also resets that category's entry in `skippedNamesByCategory` to a fresh empty `Set` in the same `set()` call; `skipItem(categoryKey, name)` that adds `name` to a **new** `Set` built from the category's current skipped names (don't mutate the existing `Set` in place — Zustand needs a new reference to trigger re-renders, same immutability discipline as the existing `setSortDirection`/`setFilter`).

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/store.test.ts
```

Expected: PASS (existing tests + 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/store.ts src/features/pantry-items/store.test.ts
git commit -m "feat: add shopping-mode and per-category skip state to UI preferences store"
```

---

### Task 6: `setItemRecurring` write function

**Files:**
- Modify: `src/features/pantry-items/firestoreWrites.ts`, `src/features/pantry-items/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `PantryItem` (existing `schema.ts`).
- Produces: `setItemRecurring(uid: string, item: PantryItem, recurring: boolean): Promise<void>`.

This updates the item's `item_history` entry (the authoritative "is this item type recurring" flag, per the design spec) and mirrors the flag onto the specific item doc being edited, for schema consistency.

- [ ] **Step 1: Write a failing test**

Append to `src/features/pantry-items/firestoreWrites.test.ts`:

```typescript
describe("setItemRecurring", () => {
	it("updates item_history and the item doc's own recurring field", async () => {
		await addItem(uid, {
			name: "Coffee",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		const itemsSnapshot = await getDocs(collection(db, "users", uid, "items"));
		const itemId = itemsSnapshot.docs[0].id;

		await setItemRecurring(
			uid,
			{
				id: itemId,
				name: "Coffee",
				category: "foods",
				quantity: 1,
				expiringDate: new Date("2027-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			},
			true,
		);

		const historyDoc = await getDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Coffee")),
		);
		expect(historyDoc.data()?.recurring).toBe(true);

		const itemDoc = await getDoc(doc(db, "users", uid, "items", itemId));
		expect(itemDoc.data()?.recurring).toBe(true);
	});
});
```

Add `setItemRecurring` to the test file's existing `import { addItem } from "./firestoreWrites"` line. The test itself only calls `getDoc` to verify results (already imported in this file) — it never calls `updateDoc` directly, so no new `firebase/firestore` imports are needed in the test file; `updateDoc` is only used inside the implementation (next step).

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/pantry-items/firestoreWrites.test.ts
```

Run the full `npm test`; confirm the new test fails — `setItemRecurring` is not exported.

- [ ] **Step 3: Implement `setItemRecurring`**

Add to `src/features/pantry-items/firestoreWrites.ts`: add `updateDoc` to the existing `firebase/firestore` import. `setItemRecurring(uid, item, recurring)`: writes the full `item_history` doc (not a merge — recompute every field the same way `addItem` does: `{ name: item.name, category: item.category, duration: item.duration !== null ? String(item.duration) : "", recurring }`) via `setDoc` at `doc(db, "users", uid, "item_history", encodeURIComponent(\`${item.category}_${item.name}\`))`, and separately `updateDoc(doc(db, "users", uid, "items", item.id), { recurring })` on the item doc itself.

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/firestoreWrites.ts src/features/pantry-items/firestoreWrites.test.ts
git commit -m "feat: add setItemRecurring, making item_history the recurring source of truth"
```

---

### Task 7: Edit Item — recurring switch

**Files:**
- Modify: `src/features/pantry-items/EditItemModal.tsx`

**Interfaces:**
- Consumes: `setItemRecurring` (Task 6).

- [ ] **Step 1: Add the recurring field to the form**

Verify Ant Design's `Switch` API with `antd info Switch` (it's already used elsewhere in this codebase, in `AddItemModal.tsx` — read that file's existing `Switch` usage as your reference for the established pattern in this project, rather than writing it from scratch). Add `recurring: boolean` to `EditFormValues`. Add `recurring: item.recurring` to the `Form`'s `initialValues`. Add a new `Form.Item` with `name="recurring"`, `valuePropName="checked"`, a translated label (add a `items.recurring` key if not already present in the locale files — check `src/locales/*.json` first, since `AddItemModal` already uses an `items.recurring` key that may be directly reusable here), wrapping a `Switch`.

- [ ] **Step 2: Wire the write into `handleOk`**

In the existing `handleOk`, alongside the current `updateItemQuantities(uid, item.id, values)` call (inside the same `try` block), also call `setItemRecurring(uid, item, values.recurring)`. Both calls should happen before `onClose()`; if either throws, the existing `catch` block's `message.error(...)` already covers it.

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

Add an item without marking it recurring, then open it in Edit, toggle "Recurring purchase" on, save. Confirm no console errors. (Full verification that this actually changed `item_history` comes from Task 9's e2e test — this step is just a smoke check that the UI doesn't crash.)

- [ ] **Step 4: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/pantry-items/EditItemModal.tsx
git commit -m "feat: let recurring status be edited from the Edit Item modal"
```

---

### Task 8: `ShoppingList` component, `AddItemModal` pre-fill, and `ItemList` wiring

**Files:**
- Modify: `src/features/pantry-items/AddItemModal.tsx`, `src/features/pantry-items/ItemList.tsx`, `src/routes/app-route.tsx`
- Create: `src/features/pantry-items/ShoppingList.tsx`

**Interfaces:**
- Consumes: `useShoppingList` (Task 4), `useUiPreferencesStore`'s new shopping-mode methods (Task 5).
- Produces: `AddItemModal` gains an optional `initialName?: string` prop. `ItemList` gains a required `lowStockThreshold: number` prop.

This is the main integration task — it wires everything built in Tasks 1–7 into the visible UI. No dedicated automated test for the components themselves (this codebase doesn't write component-level RTL tests for modals/panes — see `AddItemModal`/`EditItemModal`, which have none either; coverage comes from the hooks' own tests plus Task 9's e2e case). Verify manually and via the full test/lint/build suite instead.

- [ ] **Step 1: Add `initialName` to `AddItemModal`**

Add an optional `initialName?: string` prop to `AddItemModal`'s props type. The `Form`'s `initialValues` currently hardcodes `{ quantity: 1, recurring: false }` — add `name: initialName ?? ""` to that object. Since the `Modal` already uses `destroyOnHidden` (the form remounts fresh each time the modal opens), this is sufficient — no imperative `form.setFieldsValue` call needed. Leave `recurring` defaulting to `false` even when pre-filled from the shopping list (the item is already known-recurring via its existing `item_history` entry — don't over-scope this step by trying to pre-fill that too).

- [ ] **Step 2: Build `ShoppingList`**

Create `src/features/pantry-items/ShoppingList.tsx`, a component taking `{ uid, category, pantryItems, threshold, onAddItem }: { uid: string; category: Category; pantryItems: PantryItem[]; threshold: number; onAddItem: (name: string) => void }`. Internally: call `useShoppingList(uid, category.key, pantryItems, threshold)`, read `getSkippedNames`/`skipItem` from `useUiPreferencesStore`, filter the hook's `shoppingList` to exclude names in `getSkippedNames(category.key)`, sort the remainder alphabetically by `name` (`.sort((a, b) => a.name.localeCompare(b.name))`), and render via `Listy` (`items`/`rowKey="name"`/`itemRender`) following `ItemList.tsx`'s existing `Listy` usage as your structural reference (verify current `Listy` props with `antd demo Listy basic` if anything is unclear, rather than assuming the shape from `ItemList.tsx` alone — component library APIs can change between versions). Each row: the item name, a cart-icon button calling `onAddItem(entry.name)`, an eye-icon button calling `skipItem(category.key, entry.name)`. Verify current icon names in `@ant-design/icons` yourself (don't guess `ShoppingCartOutlined`/`EyeOutlined` from memory — confirm they exist in the installed version). Render `Empty` (same as `ItemList.tsx` does) with a translated message when the filtered list is empty — add a new locale key (e.g. `items.shoppingListEmpty`) to both `src/locales/pt-br.json` and `src/locales/en-us.json`.

- [ ] **Step 3: Add the toggle and wire `ShoppingList` into `ItemList`**

Add `lowStockThreshold: number` to `ItemList`'s props type. Add a `Switch` (or similar toggle — verify current API via `antd info Switch`) near the top of the rendered output, bound to `useUiPreferencesStore`'s `isShoppingModeOn(category.key)` / `setShoppingModeOn(category.key, ...)`. When shopping mode is on, render `<ShoppingList uid={uid} category={category} pantryItems={items} threshold={lowStockThreshold} onAddItem={(name) => { setAddInitialName(name); setAddOpen(true); }} />` instead of the existing `Empty`/`Listy` block (you'll need a new `addInitialName` piece of state, reset to `undefined` when the Add modal closes). When shopping mode is off, render the existing block unchanged. The `FloatButton` and both modals stay rendered in both modes — only the middle content (item list vs. shopping list) swaps. Pass `initialName={addInitialName}` to `AddItemModal`.

- [ ] **Step 4: Pass `lowStockThreshold` from `AppRoute`**

In `src/routes/app-route.tsx` (already calling `useSettings` since Task 2), update the `renderPane` closure passed to `CategoryTabs` to also pass `lowStockThreshold={settings.lowStockThreshold}` into `ItemList`.

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Add a recurring item with quantity 5 (threshold 3) — turn on Shopping Mode, confirm it does NOT appear. Edit it down to quantity 2 (consume 3) — confirm it now appears in Shopping Mode. Click its cart icon — confirm the Add Item modal opens with the name pre-filled. Click its eye icon (skip) — confirm it disappears from the list; toggle Shopping Mode off then on again — confirm it reappears (skip cleared).

- [ ] **Step 6: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/pantry-items/AddItemModal.tsx src/features/pantry-items/ShoppingList.tsx \
  src/features/pantry-items/ItemList.tsx src/routes/app-route.tsx \
  src/locales/pt-br.json src/locales/en-us.json
git commit -m "feat: add ShoppingList component and wire shopping mode into ItemList"
```

---

### Task 9: E2e coverage and final verification

**Files:**
- Modify: `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full app built in Tasks 1–8.

- [ ] **Step 1: Extend the e2e spec with a shopping-mode case**

Add a second `test(...)` to `e2e/core-loop.spec.ts` (or extend the existing one — check its current structure first and follow its established selector conventions, e.g. pt-br button/label text, the `.ant-picker-cell-today` date-picker workaround documented in Phase 1's plan). The new case should, at minimum: sign up, add an item marked recurring with a small quantity already at or below the default threshold of 3 (e.g. quantity 1), turn on Shopping Mode for that category, and assert the item's name is visible in the shopping list. Verify every selector empirically against the real running app rather than assuming — Phase 1's e2e task found the brief's guessed selectors didn't match reality and had to adjust them after checking the actual rendered DOM.

- [ ] **Step 2: Run it against the emulator**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (both the original core-loop case and the new shopping-mode case).

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
git commit -m "test: add e2e coverage for shopping mode"
```

---

## Self-Review Notes

- **Spec coverage:** shared editable low-stock threshold (Tasks 1–2) ✓, derived shopping list with aggregation across split item docs (Task 4) ✓, recurring editable after the fact (Tasks 6–7) ✓, per-session skip cleared on toggle-off (Task 5) ✓, cart-icon pre-fill (Task 8, `AddItemModal`) ✓, Settings tab real content (Task 2) ✓. The "hide sort/filter controls in Shopping Mode" spec line is explicitly addressed in Global Constraints as a non-issue (no such controls exist yet in this codebase to hide).
- **Type consistency:** `ShoppingListEntry` (Task 4) is the single shape threaded through `useShoppingList` → `ShoppingList.tsx` (Task 8) — no redefinition. `Settings`/`parseSettingsDoc` (Task 1) is the exact shape `updateLowStockThreshold` (Task 2) and `SettingsPane` (Task 2) consume. `setItemRecurring`'s exact signature (Task 6) matches what `EditItemModal` (Task 7) calls.
- **Placeholder scan:** no TBD/TODO markers. UI-component tasks (2, 7, 8) deliberately give structural/behavioral requirements rather than full antd JSX, per this plan's explicit process change from Phase 1 — this is an intentional scope decision, not an omission, and each such step still specifies exact prop names, exact function calls, and exact verification steps.
