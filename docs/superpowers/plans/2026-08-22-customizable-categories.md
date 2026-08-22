# Customizable Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create, rename, delete (archive), reorder, and set the
icon of their category tabs from a new Settings section, on top of the
already-per-user `users/{uid}/categories` data model.

**Architecture:** A small schema addition (`archived: boolean`, optional
for backward compatibility) plus four new/modified Firestore write
functions, a shared create/rename modal (`CategoryFormModal`, using
`emoji-picker-react` for the icon), a management list component
(`CategorySection`), and one new Card wired into the existing
`SettingsPane`. `useCategories` (already the tab bar's data source) gets
one added filter line so archived categories vanish from both the tab bar
and the management list through the same code path.

**Tech Stack:** React 19, TypeScript, Ant Design v6, Firebase
(Firestore + `firebase/firestore` client SDK), Zod, `emoji-picker-react`,
Vitest + Testing Library, Firebase Local Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-08-22-customizable-categories-design.md`

## Global Constraints

- `archived` must be `.optional()` in the Zod schema and normalized to
  `false` when absent, so every pre-existing `foods`/`medicines` doc (which
  has no `archived` field) keeps parsing without a data migration.
- `useCategories` filters archived categories **client-side** after
  parsing (`.filter((c) => !c.archived)`), never via a Firestore
  `where("archived", "==", false)` query — Firestore equality queries do
  not match documents where the field is absent, so a query-level filter
  would silently hide every existing category the moment this ships.
- A new category's `key` is the Firestore auto-generated document ID
  (`doc(collection(...)).id`), never a slug derived from the name.
- Delete always means **archive** (`archived: true`), never a hard
  `deleteDoc` — a category's `items`/`item_history` docs are never touched.
- Archiving is always gated behind a modal requiring the user to type the
  category's exact current name to enable the confirm button — regardless
  of whether the category has any items. This is enforced in the UI layer
  (`CategorySection`), not in `archiveCategory` itself.
- Archiving the last remaining active category must be blocked (disabled
  button), enforced client-side in `CategorySection` before any write.
- Icon selection uses `emoji-picker-react`'s `EmojiStyle.NATIVE` only — no
  other style (those fetch images from a CDN, which this offline-capable
  PWA must avoid).
- Every write function follows this codebase's existing pattern: the
  calling component wraps the call in `try {} catch { message.error(...)
  }`; write functions themselves don't catch/report errors.
- No `restore an archived category` UI in this plan — out of scope per the
  spec.
- No Firestore security rules changes — the deployed
  `users/{userId}/{document=**}` rule already covers
  `users/{uid}/categories/**`.

---

### Task 1: Category schema — add `archived` field

**Files:**
- Modify: `src/features/categories/schema.ts`
- Test: `src/features/categories/schema.test.ts`

**Interfaces:**
- Produces: `Category.archived: boolean` (always present after parsing,
  normalized from an optional Firestore field). `toCategoryDoc(category:
  Omit<Category, "id">): { key, name, emoji, order, archived }` — new
  export later tasks use when writing category docs.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/features/categories/schema.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseCategoryDoc, toCategoryDoc } from "./schema";

describe("parseCategoryDoc", () => {
	it("parses a valid category document", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		expect(result).toEqual({
			id: "cat1",
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
	});

	it("throws on a document missing required fields", () => {
		expect(() => parseCategoryDoc("cat1", { key: "foods" })).toThrow();
	});

	it("defaults archived to false when the field is absent (pre-existing docs)", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
		expect(result.archived).toBe(false);
	});

	it("defaults archived to false when the field is present but invalid", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: "not-a-boolean",
		});
		expect(result.archived).toBe(false);
	});

	it("keeps archived true when the document has it set", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: true,
		});
		expect(result.archived).toBe(true);
	});
});

describe("toCategoryDoc", () => {
	it("returns a plain object with all five fields, dropping id", () => {
		const result = toCategoryDoc({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		expect(result).toEqual({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/categories/schema.test.ts`
Expected: FAIL — `toCategoryDoc` is not exported, and the `archived`
assertions fail against the current schema shape.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `src/features/categories/schema.ts` with:

```ts
import { z } from "zod";

export const categoryDocSchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1),
	emoji: z.string().min(1),
	order: z.number().int().nonnegative(),
	archived: z.boolean().optional().catch(undefined),
});

export interface Category {
	id: string;
	key: string;
	name: string;
	emoji: string;
	order: number;
	archived: boolean;
}

export function parseCategoryDoc(id: string, data: unknown): Category {
	const parsed = categoryDocSchema.parse(data);
	return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toCategoryDoc(category: Omit<Category, "id">) {
	return {
		key: category.key,
		name: category.name,
		emoji: category.emoji,
		order: category.order,
		archived: category.archived,
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/categories/schema.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors. If Biome reports formatting issues, run
`npx biome check --write src/features/categories/schema.ts
src/features/categories/schema.test.ts` and re-run lint.

- [ ] **Step 6: Commit**

```bash
git add src/features/categories/schema.ts src/features/categories/schema.test.ts
git commit -m "feat: add archived field to Category schema"
```

---

### Task 2: Category Firestore writes

**Files:**
- Create: `src/features/categories/firestoreWrites.ts`
- Test: `src/features/categories/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `toCategoryDoc` from `./schema` (Task 1).
- Produces:
  - `createCategory(uid: string, name: string, emoji: string, order:
    number): Promise<void>`
  - `renameCategory(uid: string, categoryId: string, name: string, emoji:
    string): Promise<void>`
  - `archiveCategory(uid: string, categoryId: string): Promise<void>`
  - `swapCategoryOrder(uid: string, a: { id: string; order: number }, b: {
    id: string; order: number }): Promise<void>`

  All four are consumed by `CategoryFormModal` (Task 4) and
  `CategorySection` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `src/features/categories/firestoreWrites.test.ts`:

```ts
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import {
	archiveCategory,
	createCategory,
	renameCategory,
	swapCategoryOrder,
} from "./firestoreWrites";

const uid = "test-user-cat-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("createCategory", () => {
	it("writes a new category doc whose key equals its own doc id", async () => {
		await createCategory(uid, "Freezer", "🧊", 2);

		// The real doc id is Firestore-auto-generated and unknown ahead of
		// time, so read the whole (otherwise-empty) collection back rather
		// than a specific doc id.
		const all = await getDocs(collection(db, "users", uid, "categories"));
		expect(all.docs).toHaveLength(1);
		const created = all.docs[0];
		expect(created.data()).toEqual({
			key: created.id,
			name: "Freezer",
			emoji: "🧊",
			order: 2,
			archived: false,
		});
	});
});

describe("renameCategory", () => {
	it("updates only name and emoji, leaving key/order/archived untouched", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});

		await renameCategory(uid, "cat1", "Pantry", "🥫");

		const snapshot = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		expect(snapshot.data()).toEqual({
			key: "cat1",
			name: "Pantry",
			emoji: "🥫",
			order: 0,
			archived: false,
		});
	});
});

describe("archiveCategory", () => {
	it("sets archived to true without touching other fields", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});

		await archiveCategory(uid, "cat1");

		const snapshot = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		expect(snapshot.data()?.archived).toBe(true);
		expect(snapshot.data()?.name).toBe("Foods");
	});
});

describe("swapCategoryOrder", () => {
	it("swaps the order field of both categories atomically", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		await setDoc(doc(db, "users", uid, "categories", "cat2"), {
			key: "cat2",
			name: "Medicines",
			emoji: "💊",
			order: 1,
			archived: false,
		});

		await swapCategoryOrder(
			uid,
			{ id: "cat1", order: 0 },
			{ id: "cat2", order: 1 },
		);

		const cat1 = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		const cat2 = await getDoc(doc(db, "users", uid, "categories", "cat2"));
		expect(cat1.data()?.order).toBe(1);
		expect(cat2.data()?.order).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/firestoreWrites.test.ts"
```
Expected: FAIL — `./firestoreWrites` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/features/categories/firestoreWrites.ts`:

```ts
import { collection, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toCategoryDoc } from "./schema";

export async function createCategory(
	uid: string,
	name: string,
	emoji: string,
	order: number,
): Promise<void> {
	const categoriesRef = collection(db, "users", uid, "categories");
	const newDocRef = doc(categoriesRef);
	await setDoc(
		newDocRef,
		toCategoryDoc({
			key: newDocRef.id,
			name,
			emoji,
			order,
			archived: false,
		}),
	);
}

export async function renameCategory(
	uid: string,
	categoryId: string,
	name: string,
	emoji: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "categories", categoryId), {
		name,
		emoji,
	});
}

export async function archiveCategory(
	uid: string,
	categoryId: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "categories", categoryId), {
		archived: true,
	});
}

export async function swapCategoryOrder(
	uid: string,
	a: { id: string; order: number },
	b: { id: string; order: number },
): Promise<void> {
	const batch = writeBatch(db);
	batch.update(doc(db, "users", uid, "categories", a.id), { order: b.order });
	batch.update(doc(db, "users", uid, "categories", b.id), { order: a.order });
	await batch.commit();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/firestoreWrites.test.ts"
```
Expected: PASS (4 tests)

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors (fix formatting with `npx biome check --write` on the
two new files if needed, then re-run).

- [ ] **Step 6: Commit**

```bash
git add src/features/categories/firestoreWrites.ts src/features/categories/firestoreWrites.test.ts
git commit -m "feat: add category create/rename/archive/reorder Firestore writes"
```

---

### Task 3: Filter archived categories out of `useCategories`

**Files:**
- Modify: `src/features/categories/useCategories.ts`
- Test: `src/features/categories/useCategories.test.tsx`

**Interfaces:**
- Consumes: `parseCategoryDoc` (unchanged signature from Task 1, now
  returns `archived` too).
- Produces: `useCategories(uid: string): { categories: Category[];
  loading: boolean }` — unchanged signature; `categories` now excludes
  anything with `archived === true`. `CategorySection` (Task 5) and
  `CategoryTabs`/`AppRoute` (unchanged, already consume this hook) rely on
  this filtered list.

- [ ] **Step 1: Write the failing test**

Add to the end of `src/features/categories/useCategories.test.tsx` (inside
the existing `describe("useCategories", ...)` block, after the last
`it(...)`):

```ts
	it("excludes archived categories from the returned list", async () => {
		await addDoc(collection(db, "users", uid, "categories"), {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "categories"), {
			key: "old-category",
			name: "Old Category",
			emoji: "🗑️",
			order: 1,
			archived: true,
		});

		const { result } = renderHook(() => useCategories(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.categories).toHaveLength(1);
		expect(result.current.categories[0].key).toBe("foods");
	});

	it("still includes a category doc that predates the archived field", async () => {
		await addDoc(collection(db, "users", uid, "categories"), {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});

		const { result } = renderHook(() => useCategories(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.categories).toHaveLength(1);
		expect(result.current.categories[0].archived).toBe(false);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/useCategories.test.tsx"
```
Expected: FAIL — the archived category is currently included in the
returned list (2 categories instead of 1).

- [ ] **Step 3: Update the implementation**

In `src/features/categories/useCategories.ts`, find this block inside the
`onSnapshot` success callback:

```ts
					unsubscribe = onSnapshot(
						categoriesQuery,
						(snapshot) => {
							setCategories(
								snapshot.docs.map((d) => parseCategoryDoc(d.id, d.data())),
							);
							setLoading(false);
						},
```

Replace it with:

```ts
					unsubscribe = onSnapshot(
						categoriesQuery,
						(snapshot) => {
							setCategories(
								snapshot.docs
									.map((d) => parseCategoryDoc(d.id, d.data()))
									.filter((category) => !category.archived),
							);
							setLoading(false);
						},
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/useCategories.test.tsx"
```
Expected: PASS (4 tests total)

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/categories/useCategories.ts src/features/categories/useCategories.test.tsx
git commit -m "feat: exclude archived categories from useCategories"
```

---

### Task 4: `CategoryFormModal` (create/rename + icon picker)

**Files:**
- Create: `src/features/categories/CategoryFormModal.tsx`
- Test: `src/features/categories/CategoryFormModal.test.tsx`
- Modify: `package.json` / `package-lock.json` (new dependency)
- Modify: `src/locales/en-us.json`
- Modify: `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `createCategory`, `renameCategory` from `./firestoreWrites`
  (Task 2); `Category` type from `./schema` (Task 1).
- Produces: `CategoryFormModal({ uid: string; open: boolean; onClose: ()
  => void; editingCategory: Category | null; nextOrder: number }):
  JSX.Element` — `editingCategory === null` means create mode.
  `CategorySection` (Task 5) renders this and owns `open`/`editingCategory`
  state.

- [ ] **Step 1: Install the dependency**

Run: `npm install emoji-picker-react`
Expected: `package.json` gains `"emoji-picker-react": "^4.19.1"` (or
whatever the latest 4.x release is) under `dependencies`.

- [ ] **Step 2: Add i18n keys**

In `src/locales/en-us.json`, inside the `"settings"` object, add after
`"languageEnUs": "English",`:

```json
    "addCategory": "Add category",
    "editCategory": "Edit category",
    "categoryName": "Name",
    "categoryIcon": "Icon",
```

In `src/locales/pt-br.json`, inside the `"settings"` object, add after
`"languageEnUs": "English",`:

```json
    "addCategory": "Adicionar categoria",
    "editCategory": "Editar categoria",
    "categoryName": "Nome",
    "categoryIcon": "Ícone",
```

- [ ] **Step 3: Write the failing tests**

Create `src/features/categories/CategoryFormModal.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryFormModal } from "./CategoryFormModal";
import * as firestoreWritesModule from "./firestoreWrites";
import type { Category } from "./schema";

vi.mock("emoji-picker-react", () => ({
	default: ({
		onEmojiClick,
	}: {
		onEmojiClick: (data: { emoji: string }) => void;
	}) => (
		<button type="button" onClick={() => onEmojiClick({ emoji: "🧊" })}>
			pick-freezer-emoji
		</button>
	),
	EmojiStyle: { NATIVE: "native" },
}));

afterEach(() => {
	vi.restoreAllMocks();
});

const editingCategory: Category = {
	id: "cat1",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

describe("CategoryFormModal create mode", () => {
	it("calls createCategory with the entered name, default icon, and given order", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createCategory")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-1"
				open
				onClose={onClose}
				editingCategory={null}
				nextOrder={2}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-cat-form-1",
				"Freezer",
				"🏷️",
				2,
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});

describe("CategoryFormModal rename mode", () => {
	it("pre-fills the existing name and icon, and calls renameCategory on submit", async () => {
		const renameSpy = vi
			.spyOn(firestoreWritesModule, "renameCategory")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-2"
				open
				onClose={onClose}
				editingCategory={editingCategory}
				nextOrder={1}
			/>,
		);

		const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
		expect(nameInput.value).toBe("Foods");
		expect(screen.getByRole("button", { name: /icon/i })).toHaveTextContent(
			"🍎",
		);

		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Pantry");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(renameSpy).toHaveBeenCalledWith(
				"test-user-cat-form-2",
				"cat1",
				"Pantry",
				"🍎",
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});

describe("CategoryFormModal icon picker", () => {
	it("updates the icon button and submits the newly picked emoji", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createCategory")
			.mockResolvedValue();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-3"
				open
				onClose={vi.fn()}
				editingCategory={null}
				nextOrder={0}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /icon/i }));
		await userEvent.click(
			await screen.findByRole("button", { name: "pick-freezer-emoji" }),
		);
		expect(screen.getByRole("button", { name: /icon/i })).toHaveTextContent(
			"🧊",
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-cat-form-3",
				"Freezer",
				"🧊",
				0,
			),
		);
	});
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/features/categories/CategoryFormModal.test.tsx`
Expected: FAIL — `./CategoryFormModal` does not exist yet.

- [ ] **Step 5: Write the implementation**

Create `src/features/categories/CategoryFormModal.tsx`:

```tsx
import { Button, Form, Input, message, Modal, Popover } from "antd";
import EmojiPicker, { EmojiStyle, type EmojiClickData } from "emoji-picker-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createCategory, renameCategory } from "./firestoreWrites";
import type { Category } from "./schema";

const DEFAULT_EMOJI = "🏷️";

interface CategoryFormValues {
	name: string;
}

export function CategoryFormModal({
	uid,
	open,
	onClose,
	editingCategory,
	nextOrder,
}: {
	uid: string;
	open: boolean;
	onClose: () => void;
	editingCategory: Category | null;
	nextOrder: number;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<CategoryFormValues>();
	const [emoji, setEmoji] = useState(editingCategory?.emoji ?? DEFAULT_EMOJI);
	const [pickerOpen, setPickerOpen] = useState(false);

	// Re-derived during render (rather than in a useEffect) — the
	// React-recommended "adjusting state when a prop changes" pattern,
	// matching SettingsPane.tsx's established use of the same approach.
	const [prevEditingCategory, setPrevEditingCategory] =
		useState(editingCategory);
	if (prevEditingCategory !== editingCategory) {
		setPrevEditingCategory(editingCategory);
		setEmoji(editingCategory?.emoji ?? DEFAULT_EMOJI);
		form.setFieldsValue({ name: editingCategory?.name ?? "" });
	}

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			if (editingCategory) {
				await renameCategory(
					uid,
					editingCategory.id,
					values.name.trim(),
					emoji,
				);
			} else {
				await createCategory(uid, values.name.trim(), emoji, nextOrder);
			}
			form.resetFields();
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={
				editingCategory ? t("settings.editCategory") : t("settings.addCategory")
			}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form form={form} layout="vertical">
				<Form.Item label={t("settings.categoryIcon")}>
					<Popover
						trigger="click"
						open={pickerOpen}
						onOpenChange={setPickerOpen}
						content={
							<EmojiPicker
								emojiStyle={EmojiStyle.NATIVE}
								onEmojiClick={(emojiData: EmojiClickData) => {
									setEmoji(emojiData.emoji);
									setPickerOpen(false);
								}}
							/>
						}
					>
						<Button aria-label={t("settings.categoryIcon")}>{emoji}</Button>
					</Popover>
				</Form.Item>
				<Form.Item
					name="name"
					label={t("settings.categoryName")}
					rules={[{ required: true }]}
				>
					<Input />
				</Form.Item>
			</Form>
		</Modal>
	);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/features/categories/CategoryFormModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/locales/en-us.json src/locales/pt-br.json src/features/categories/CategoryFormModal.tsx src/features/categories/CategoryFormModal.test.tsx
git commit -m "feat: add CategoryFormModal for creating/renaming categories"
```

---

### Task 5: `CategorySection` (management list)

**Files:**
- Create: `src/features/categories/CategorySection.tsx`
- Test: `src/features/categories/CategorySection.test.tsx`
- Modify: `src/locales/en-us.json`
- Modify: `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `useCategories` (Task 3); `archiveCategory`,
  `swapCategoryOrder` (Task 2); `CategoryFormModal` (Task 4); `Category`
  type (Task 1).
- Produces: `CategorySection({ uid: string }): JSX.Element`. `SettingsPane`
  (Task 6) renders this directly.

- [ ] **Step 1: Add i18n keys**

In `src/locales/en-us.json`, inside `"settings"`, add after
`"categoryIcon": "Icon",`:

```json
    "deleteCategory": "Delete category",
    "deleteCategoryConfirmTitle": "Delete this category?",
    "deleteCategoryConfirmBody": "This will hide \"{{categoryName}}\" from your tabs. Its items are kept, but the tab won't be recoverable from the app. Type \"{{categoryName}}\" to confirm.",
    "deleteCategoryConfirmInputLabel": "Confirmation",
    "deleteCategoryConfirmPlaceholder": "Type \"{{categoryName}}\" to confirm",
    "cannotDeleteLastCategory": "You need at least one category",
    "moveCategoryUp": "Move up",
    "moveCategoryDown": "Move down",
```

In `src/locales/pt-br.json`, inside `"settings"`, add after
`"categoryIcon": "Ícone",`:

```json
    "deleteCategory": "Excluir categoria",
    "deleteCategoryConfirmTitle": "Excluir esta categoria?",
    "deleteCategoryConfirmBody": "Isso vai ocultar \"{{categoryName}}\" das suas abas. Os itens são mantidos, mas a aba não poderá ser recuperada pelo aplicativo. Digite \"{{categoryName}}\" para confirmar.",
    "deleteCategoryConfirmInputLabel": "Confirmação",
    "deleteCategoryConfirmPlaceholder": "Digite \"{{categoryName}}\" para confirmar",
    "cannotDeleteLastCategory": "Você precisa de pelo menos uma categoria",
    "moveCategoryUp": "Mover para cima",
    "moveCategoryDown": "Mover para baixo",
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/categories/CategorySection.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { CategorySection } from "./CategorySection";

const uid = "test-user-cat-section-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

async function seedCategory(
	key: string,
	name: string,
	emoji: string,
	order: number,
) {
	await setDoc(doc(db, "users", uid, "categories", key), {
		key,
		name,
		emoji,
		order,
		archived: false,
	});
}

describe("CategorySection reorder", () => {
	it("swaps order when moving a category down", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);
		await seedCategory("medicines", "Medicines", "💊", 1);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		await userEvent.click(screen.getByRole("button", { name: /move down/i }));

		await waitFor(async () => {
			const foodsDoc = await getDoc(
				doc(db, "users", uid, "categories", "foods"),
			);
			expect(foodsDoc.data()?.order).toBe(1);
		});
		const medicinesDoc = await getDoc(
			doc(db, "users", uid, "categories", "medicines"),
		);
		expect(medicinesDoc.data()?.order).toBe(0);
	});
});

describe("CategorySection delete", () => {
	it("disables delete when only one category remains", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		expect(
			screen.getByRole("button", { name: /delete category/i }),
		).toBeDisabled();
	});

	it("requires typing the exact category name before archiving it", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);
		await seedCategory("medicines", "Medicines", "💊", 1);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		const deleteButtons = screen.getAllByRole("button", {
			name: /delete category/i,
		});
		await userEvent.click(deleteButtons[0]);

		const okButton = await screen.findByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "Wrong Name");
		expect(okButton).toBeDisabled();

		await userEvent.clear(screen.getByLabelText(/confirmation/i));
		await userEvent.type(screen.getByLabelText(/confirmation/i), "Foods");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);

		await waitFor(async () => {
			const foodsDoc = await getDoc(
				doc(db, "users", uid, "categories", "foods"),
			);
			expect(foodsDoc.data()?.archived).toBe(true);
		});
		expect(screen.queryByText("Foods")).not.toBeInTheDocument();
	});
});

describe("CategorySection add", () => {
	it("creates a new category appended after the current highest order", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		await userEvent.click(screen.getByRole("button", { name: /add category/i }));
		await userEvent.type(await screen.findByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await screen.findByText("Freezer");
		const snapshot = await getDocs(collection(db, "users", uid, "categories"));
		const freezer = snapshot.docs.find((d) => d.data().name === "Freezer");
		expect(freezer?.data().order).toBe(1);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/CategorySection.test.tsx"
```
Expected: FAIL — `./CategorySection` does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `src/features/categories/CategorySection.tsx`:

```tsx
import {
	DeleteOutlined,
	DownOutlined,
	EditOutlined,
	PlusOutlined,
	UpOutlined,
} from "@ant-design/icons";
import { Button, Flex, Input, message, Modal, theme, Tooltip, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryFormModal } from "./CategoryFormModal";
import { archiveCategory, swapCategoryOrder } from "./firestoreWrites";
import type { Category } from "./schema";
import { useCategories } from "./useCategories";

export function CategorySection({ uid }: { uid: string }) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { categories, loading } = useCategories(uid);
	const [formOpen, setFormOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(
		null,
	);
	const [categoryPendingDelete, setCategoryPendingDelete] =
		useState<Category | null>(null);
	const [confirmText, setConfirmText] = useState("");

	if (loading) return null;

	const sorted = [...categories].sort((a, b) => a.order - b.order);
	const nextOrder =
		sorted.length === 0 ? 0 : Math.max(...sorted.map((c) => c.order)) + 1;

	const handleMoveUp = async (index: number) => {
		if (index === 0) return;
		try {
			await swapCategoryOrder(uid, sorted[index], sorted[index - 1]);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleMoveDown = async (index: number) => {
		if (index === sorted.length - 1) return;
		try {
			await swapCategoryOrder(uid, sorted[index], sorted[index + 1]);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleDeleteConfirm = async () => {
		if (!categoryPendingDelete) return;
		try {
			await archiveCategory(uid, categoryPendingDelete.id);
		} catch {
			message.error("Something went wrong, please try again");
		} finally {
			setCategoryPendingDelete(null);
			setConfirmText("");
		}
	};

	return (
		<>
			{sorted.map((category, index) => (
				<Flex
					key={category.id}
					justify="space-between"
					align="center"
					style={{
						padding: "12px 0",
						borderBottom: `1px solid ${token.colorSplit}`,
					}}
				>
					<Flex align="center" gap="small">
						<span>{category.emoji}</span>
						<Typography.Text strong>{category.name}</Typography.Text>
					</Flex>
					<Flex gap="small">
						<Button
							type="text"
							icon={<UpOutlined />}
							disabled={index === 0}
							onClick={() => handleMoveUp(index)}
							aria-label={t("settings.moveCategoryUp")}
						/>
						<Button
							type="text"
							icon={<DownOutlined />}
							disabled={index === sorted.length - 1}
							onClick={() => handleMoveDown(index)}
							aria-label={t("settings.moveCategoryDown")}
						/>
						<Button
							type="text"
							icon={<EditOutlined />}
							onClick={() => {
								setEditingCategory(category);
								setFormOpen(true);
							}}
							aria-label={t("settings.editCategory")}
						/>
						<Tooltip
							title={
								sorted.length <= 1
									? t("settings.cannotDeleteLastCategory")
									: undefined
							}
						>
							<Button
								type="text"
								danger
								icon={<DeleteOutlined />}
								disabled={sorted.length <= 1}
								onClick={() => setCategoryPendingDelete(category)}
								aria-label={t("settings.deleteCategory")}
							/>
						</Tooltip>
					</Flex>
				</Flex>
			))}
			<Button
				icon={<PlusOutlined />}
				onClick={() => {
					setEditingCategory(null);
					setFormOpen(true);
				}}
				style={{ marginTop: 12 }}
			>
				{t("settings.addCategory")}
			</Button>
			<CategoryFormModal
				uid={uid}
				open={formOpen}
				onClose={() => {
					setFormOpen(false);
					setEditingCategory(null);
				}}
				editingCategory={editingCategory}
				nextOrder={nextOrder}
			/>
			<Modal
				title={t("settings.deleteCategoryConfirmTitle")}
				open={categoryPendingDelete !== null}
				onOk={handleDeleteConfirm}
				onCancel={() => {
					setCategoryPendingDelete(null);
					setConfirmText("");
				}}
				okButtonProps={{
					disabled: categoryPendingDelete
						? confirmText.trim() !== categoryPendingDelete.name
						: true,
					danger: true,
				}}
			>
				<p>
					{t("settings.deleteCategoryConfirmBody", {
						categoryName: categoryPendingDelete?.name ?? "",
					})}
				</p>
				<Input
					value={confirmText}
					onChange={(event) => setConfirmText(event.target.value)}
					aria-label={t("settings.deleteCategoryConfirmInputLabel")}
					placeholder={t("settings.deleteCategoryConfirmPlaceholder", {
						categoryName: categoryPendingDelete?.name ?? "",
					})}
				/>
			</Modal>
		</>
	);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/categories/CategorySection.test.tsx"
```
Expected: PASS (4 tests)

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/locales/en-us.json src/locales/pt-br.json src/features/categories/CategorySection.tsx src/features/categories/CategorySection.test.tsx
git commit -m "feat: add CategorySection with reorder, edit, and archive-on-delete"
```

---

### Task 6: Wire `CategorySection` into `SettingsPane`

**Files:**
- Modify: `src/features/settings/SettingsPane.tsx`
- Modify: `src/features/settings/SettingsPane.test.tsx`
- Modify: `src/locales/en-us.json`
- Modify: `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `CategorySection` (Task 5).

- [ ] **Step 1: Add the i18n key**

In `src/locales/en-us.json`, inside `"settings"`, add after
`"backupTitle": "Backup",`:

```json
    "sectionCategories": "Categories",
```

In `src/locales/pt-br.json`, inside `"settings"`, add after
`"backupTitle": "Backup",`:

```json
    "sectionCategories": "Categorias",
```

- [ ] **Step 2: Write the failing test**

In `src/features/settings/SettingsPane.test.tsx`, replace this line:

```ts
import { describe, expect, it, vi } from "vitest";
```

with:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
```

Then add this import right after the `import i18n from "../../lib/i18n";`
line:

```ts
import { clearFirestoreEmulator } from "../../test/emulator";
```

Add this `afterEach` call right after the `settings` constant declaration
(before the first `describe`):

```ts
afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);
```

Add this new `describe` block at the end of the file:

```ts
describe("SettingsPane categories", () => {
	it("renders the Categories section with the default categories", async () => {
		render(<SettingsPane uid="test-user-settings-ui-3" settings={settings} />);

		await screen.findByText("Foods");
		await screen.findByText("Medicines");
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/SettingsPane.test.tsx"
```
Expected: FAIL — no "Foods"/"Medicines" text is rendered yet (the
Categories card doesn't exist).

- [ ] **Step 4: Update the implementation**

In `src/features/settings/SettingsPane.tsx`, add this import alongside the
other feature imports (after the `BackupSection` import):

```ts
import { CategorySection } from "../categories/CategorySection";
```

Find the closing of the Backup `Card` (the last `Card` before `</Space>`):

```tsx
			<Card title={t("settings.backupTitle")}>
				<BackupSection uid={uid} />
			</Card>
		</Space>
```

Replace it with:

```tsx
			<Card title={t("settings.backupTitle")}>
				<BackupSection uid={uid} />
			</Card>
			<Card title={t("settings.sectionCategories")}>
				<CategorySection uid={uid} />
			</Card>
		</Space>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/SettingsPane.test.tsx"
```
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, all files (this is the last task — the whole suite,
including every earlier task's tests, must be green).

- [ ] **Step 7: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run `npx firebase emulators:start --only auth,firestore` in one terminal
and `VITE_USE_FIREBASE_EMULATORS=true npm run dev` in another. Sign in,
open the Settings tab, and confirm:
- A "Categories" card lists Foods and Medicines.
- "Add category" opens a modal; picking an icon via the picker button and
  entering a name creates a new tab that appears both in the Categories
  list and the tab bar.
- The pencil icon renames a category and updates its label in the tab bar.
- The up/down arrows reorder categories, and the tab bar order updates to
  match.
- Deleting the last remaining category is disabled (hover shows the
  tooltip).
- Deleting a category with 2+ remaining requires typing its exact name
  before the confirm button enables; after confirming, the tab disappears
  from both the Categories list and the tab bar, but its items are
  unaffected (check the Firestore Emulator UI at
  http://127.0.0.1:4000/firestore to confirm the `items` subcollection for
  that category's `key` is untouched).
- Check both light and dark `prefers-color-scheme`, and both desktop
  (1920×1080) and mobile (390×844) viewports, for visual regressions.

- [ ] **Step 9: Commit**

```bash
git add src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: wire CategorySection into the Settings tab"
```
