# Item Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let items in the same category be grouped into user-defined Classes (e.g. "Soap" covering three brands), with a collapsible grouped view on the pantry list and class-level aggregation in Shopping Mode.

**Architecture:** A new `classes` feature owns a flat `users/{uid}/classes/{key}` Firestore collection (mirroring the existing `categories` collection's shape) and its own schema/writes/hook/management-UI, exactly like the `categories` feature. `pantry-items` gains an optional, nullable `classKey` on `PantryItem` (zero migration) that both a new grouped-list component and a rewritten `useShoppingList` consume — falling back to today's per-item/per-name behavior whenever an item has no class or its class is archived.

**Tech Stack:** React 19, TypeScript, Ant Design v6 (`Select`, `Collapse`, `Modal`), Zustand, Firebase/Firestore + the Local Emulator Suite, Zod, Vitest + Testing Library, react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-12-item-classes-design.md`

## Global Constraints

- Every Firestore read goes through a Zod schema boundary parser (`parseXDoc`/`safeParseXDoc`) — no component or hook reads `doc.data()` untyped.
- `afterEach` cleanup in every new/modified test file calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal.
- Run the full `npm run lint` (Biome + ESLint), not just `tsc`, before considering any task's step "passing" — it catches conditional-hook bugs `tsc`/Biome alone miss.
- `classKey` is optional and nullable everywhere it appears (`PantryItem.classKey?: string | null`, `class_key: z.string().nullable().optional()`) — existing items, and every existing test/call-site literal that omits it, must keep working with zero changes.
- Classes are flat (`users/{uid}/classes/{key}` with a `category` field), not nested under category docs — matches how `items` already reference `categories` by key string.
- An item whose `classKey` points to an archived, deleted, or cross-category class must degrade to "ungrouped"/"per-name" everywhere, never crash or silently disappear.
- No new third-party dependency is introduced by this feature.
- Add new i18n keys to both `src/locales/en-us.json` and `src/locales/pt-br.json` in the same step that introduces the UI needing them.

## Review Focus

- A class is archived, or an item is moved to a different category, while the item still carries that `classKey` — the grouped pantry view and Shopping Mode must both treat it as unclassed, not crash or drop it from either view. (Tasks 9, 14)
- `useClasses` is queried for a category that has no class docs (or whose docs all belong to other categories) — it must resolve to an empty list without erroring, not hang in `loading: true`. (Task 3)
- Nothing enforces unique class names within a category — two classes named "Soap" in the same category must both be creatable and independently rename/archivable by their own key, not collide. (Task 2)
- Opening Add Item from a Shopping Mode class entry (cart icon) pre-fills `classKey` but leaves `name` blank — the existing required-name validation must still block submission until a name is typed. (Task 11)
- Editing an item whose `classKey` refers to a class that's since been archived or deleted — the Edit modal must still open and render (Select showing no matching option), not throw. (Task 12)

---

## Task 1: Classes schema

**Files:**
- Create: `src/features/classes/schema.ts`
- Test: `src/features/classes/schema.test.ts`

**Interfaces:**
- Produces: `classDocSchema` (Zod schema), `interface ItemClass { id: string; key: string; category: string; name: string; archived: boolean }`, `parseClassDoc(id: string, data: unknown): ItemClass`, `toClassDoc(cls: Omit<ItemClass, "id">): object`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/classes/schema.test.ts
import { describe, expect, it } from "vitest";
import { parseClassDoc, toClassDoc } from "./schema";

describe("parseClassDoc", () => {
	it("parses a valid class document", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		expect(result).toEqual({
			id: "class1",
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});

	it("throws on a document missing required fields", () => {
		expect(() => parseClassDoc("class1", { key: "soap-key" })).toThrow();
	});

	it("defaults archived to false when the field is absent", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
		});
		expect(result.archived).toBe(false);
	});

	it("defaults archived to false when the field is present but invalid", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: "not-a-boolean",
		});
		expect(result.archived).toBe(false);
	});

	it("keeps archived true when the document has it set", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: true,
		});
		expect(result.archived).toBe(true);
	});
});

describe("toClassDoc", () => {
	it("returns a plain object with all four fields, dropping id", () => {
		const result = toClassDoc({
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		expect(result).toEqual({
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/classes/schema.test.ts`
Expected: FAIL — `src/features/classes/schema.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/classes/schema.ts
import { z } from "zod";

export const classDocSchema = z.object({
	key: z.string().min(1),
	category: z.string().min(1),
	name: z.string().min(1),
	archived: z.boolean().optional().catch(undefined),
});

export interface ItemClass {
	id: string;
	key: string;
	category: string;
	name: string;
	archived: boolean;
}

export function parseClassDoc(id: string, data: unknown): ItemClass {
	const parsed = classDocSchema.parse(data);
	return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toClassDoc(cls: Omit<ItemClass, "id">) {
	return {
		key: cls.key,
		category: cls.category,
		name: cls.name,
		archived: cls.archived,
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/classes/schema.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/classes/schema.ts src/features/classes/schema.test.ts
git commit -m "feat: add Zod schema for item classes"
```

---

## Task 2: Classes Firestore writes

**Files:**
- Create: `src/features/classes/firestoreWrites.ts`
- Test: `src/features/classes/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `toClassDoc` from Task 1 (`./schema`).
- Produces: `createClass(uid: string, category: string, name: string): Promise<string>` (returns the new class's key), `renameClass(uid: string, classId: string, name: string): Promise<void>`, `archiveClass(uid: string, classId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/classes/firestoreWrites.test.ts
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { archiveClass, createClass, renameClass } from "./firestoreWrites";

const uid = "test-user-class-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("createClass", () => {
	it("writes a new class doc whose key equals its own doc id", async () => {
		const classId = await createClass(uid, "cleaning", "Soap");

		const all = await getDocs(collection(db, "users", uid, "classes"));
		expect(all.docs).toHaveLength(1);
		const created = all.docs[0];
		expect(created.id).toBe(classId);
		expect(created.data()).toEqual({
			key: created.id,
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});

	// Review Focus: nothing enforces unique class names within a category —
	// two classes with the same name must both be creatable, each with its
	// own distinct key.
	it("allows creating two classes with the same name in the same category", async () => {
		const firstId = await createClass(uid, "cleaning", "Soap");
		const secondId = await createClass(uid, "cleaning", "Soap");

		expect(firstId).not.toBe(secondId);
		const all = await getDocs(collection(db, "users", uid, "classes"));
		expect(all.docs).toHaveLength(2);
		expect(all.docs.map((d) => d.data().name)).toEqual(["Soap", "Soap"]);
	});
});

describe("renameClass", () => {
	it("updates only name, leaving key/category/archived untouched", async () => {
		await setDoc(doc(db, "users", uid, "classes", "class1"), {
			key: "class1",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		await renameClass(uid, "class1", "Bar Soap");

		const snapshot = await getDoc(doc(db, "users", uid, "classes", "class1"));
		expect(snapshot.data()).toEqual({
			key: "class1",
			category: "cleaning",
			name: "Bar Soap",
			archived: false,
		});
	});
});

describe("archiveClass", () => {
	it("sets archived to true without touching other fields", async () => {
		await setDoc(doc(db, "users", uid, "classes", "class1"), {
			key: "class1",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		await archiveClass(uid, "class1");

		const snapshot = await getDoc(doc(db, "users", uid, "classes", "class1"));
		expect(snapshot.data()?.archived).toBe(true);
		expect(snapshot.data()?.name).toBe("Soap");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/firestoreWrites.test.ts"`
Expected: FAIL — `src/features/classes/firestoreWrites.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/classes/firestoreWrites.ts
import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toClassDoc } from "./schema";

export async function createClass(
	uid: string,
	category: string,
	name: string,
): Promise<string> {
	const classesRef = collection(db, "users", uid, "classes");
	const newDocRef = doc(classesRef);
	await setDoc(
		newDocRef,
		toClassDoc({ key: newDocRef.id, category, name, archived: false }),
	);
	return newDocRef.id;
}

export async function renameClass(
	uid: string,
	classId: string,
	name: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "classes", classId), { name });
}

export async function archiveClass(
	uid: string,
	classId: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "classes", classId), {
		archived: true,
	});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/firestoreWrites.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/classes/firestoreWrites.ts src/features/classes/firestoreWrites.test.ts
git commit -m "feat: add Firestore writes for creating, renaming, archiving classes"
```

---

## Task 3: `useClasses` hook

**Files:**
- Create: `src/features/classes/useClasses.ts`
- Test: `src/features/classes/useClasses.test.tsx`

**Interfaces:**
- Consumes: `ItemClass`, `parseClassDoc` from Task 1 (`./schema`).
- Produces: `useClasses(uid: string, categoryKey: string): { classes: ItemClass[]; loading: boolean }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/classes/useClasses.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useClasses } from "./useClasses";

const uid = "test-user-use-classes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useClasses", () => {
	it("returns only classes for the given category", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		const { result } = renderHook(() => useClasses(uid, "cleaning"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.classes).toHaveLength(1);
		expect(result.current.classes[0].name).toBe("Soap");
	});

	it("excludes archived classes from the returned list", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "old-key",
			category: "cleaning",
			name: "Old Class",
			archived: true,
		});

		const { result } = renderHook(() => useClasses(uid, "cleaning"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.classes).toHaveLength(1);
		expect(result.current.classes[0].name).toBe("Soap");
	});

	it("still includes a class doc that predates the archived field", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
		});

		const { result } = renderHook(() => useClasses(uid, "cleaning"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.classes).toHaveLength(1);
		expect(result.current.classes[0].archived).toBe(false);
	});

	// Review Focus: a category with no matching class docs (e.g. it was just
	// created, or every class doc belongs to other categories) must resolve
	// to an empty list, not hang in loading:true forever.
	it("resolves to an empty list without erroring for a category with no class docs", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		const { result } = renderHook(() => useClasses(uid, "cleaning"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.classes).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/useClasses.test.tsx"`
Expected: FAIL — `src/features/classes/useClasses.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/classes/useClasses.ts
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { message } from "../../lib/feedback";
import { db } from "../../lib/firebase";
import { type ItemClass, parseClassDoc } from "./schema";

export function useClasses(
	uid: string,
	categoryKey: string,
): { classes: ItemClass[]; loading: boolean } {
	const [classes, setClasses] = useState<ItemClass[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const classesQuery = query(
			collection(db, "users", uid, "classes"),
			where("category", "==", categoryKey),
		);
		const unsubscribe = onSnapshot(
			classesQuery,
			(snapshot) => {
				setClasses(
					snapshot.docs
						.map((d) => parseClassDoc(d.id, d.data()))
						.filter((cls) => !cls.archived),
				);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid, categoryKey]);

	return { classes, loading };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/useClasses.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/classes/useClasses.ts src/features/classes/useClasses.test.tsx
git commit -m "feat: add useClasses hook, scoped and filtered per category"
```

---

## Task 4: `ClassFormModal`

**Files:**
- Create: `src/features/classes/ClassFormModal.tsx`
- Test: `src/features/classes/ClassFormModal.test.tsx`
- Modify: `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `createClass`, `renameClass` from Task 2 (`./firestoreWrites`); `ItemClass` from Task 1 (`./schema`).
- Produces: `ClassFormModal` component, props `{ uid: string; category: string; open: boolean; onClose: () => void; editingClass: ItemClass | null; onCreated?: (classId: string) => void }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/classes/ClassFormModal.test.tsx
import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassFormModal } from "./ClassFormModal";
import * as firestoreWritesModule from "./firestoreWrites";
import type { ItemClass } from "./schema";

afterEach(() => {
	vi.restoreAllMocks();
});

const editingClass: ItemClass = {
	id: "class1",
	key: "soap-key",
	category: "cleaning",
	name: "Soap",
	archived: false,
};

describe("ClassFormModal create mode", () => {
	it("calls createClass with the entered name and reports the new key via onCreated", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createClass")
			.mockResolvedValue("new-class-key");
		const onClose = vi.fn();
		const onCreated = vi.fn();

		render(
			<ClassFormModal
				uid="test-user-class-form-1"
				category="cleaning"
				open
				onClose={onClose}
				editingClass={null}
				onCreated={onCreated}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Soap");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-class-form-1",
				"cleaning",
				"Soap",
			),
		);
		expect(onCreated).toHaveBeenCalledWith("new-class-key");
		expect(onClose).toHaveBeenCalled();
	});
});

describe("ClassFormModal rename mode", () => {
	it("pre-fills the existing name and calls renameClass on submit", async () => {
		const renameSpy = vi
			.spyOn(firestoreWritesModule, "renameClass")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<ClassFormModal
				uid="test-user-class-form-2"
				category="cleaning"
				open
				onClose={onClose}
				editingClass={editingClass}
			/>,
		);

		const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
		expect(nameInput.value).toBe("Soap");

		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Bar Soap");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(renameSpy).toHaveBeenCalledWith(
				"test-user-class-form-2",
				"class1",
				"Bar Soap",
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/classes/ClassFormModal.test.tsx`
Expected: FAIL — `src/features/classes/ClassFormModal.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/classes/ClassFormModal.tsx
import { Form, Input, Modal } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { createClass, renameClass } from "./firestoreWrites";
import type { ItemClass } from "./schema";

interface ClassFormValues {
	name: string;
}

export function ClassFormModal({
	uid,
	category,
	open,
	onClose,
	editingClass,
	onCreated,
}: {
	uid: string;
	category: string;
	open: boolean;
	onClose: () => void;
	editingClass: ItemClass | null;
	onCreated?: (classId: string) => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<ClassFormValues>();

	// form.setFieldsValue is an imperative call into an external mutable
	// object, not a React state setter — matches CategoryFormModal's identical
	// rationale for keeping this a useEffect.
	useEffect(() => {
		if (open) {
			form.setFieldsValue({ name: editingClass?.name ?? "" });
		}
	}, [open, editingClass, form]);

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			if (editingClass) {
				await renameClass(uid, editingClass.id, values.name.trim());
			} else {
				const classId = await createClass(uid, category, values.name.trim());
				onCreated?.(classId);
			}
			form.resetFields();
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={editingClass ? t("settings.editClass") : t("settings.addClass")}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ name: editingClass?.name ?? "" }}
			>
				<Form.Item
					name="name"
					label={t("settings.className")}
					rules={[{ required: true }]}
				>
					<Input />
				</Form.Item>
			</Form>
		</Modal>
	);
}
```

Add to `src/locales/en-us.json`, as new keys inside the existing top-level object (object has no nested `settings` key — keys are flat, matching every existing `settings.*` key already in the file):

```json
	"addClass": "Add class",
	"editClass": "Edit class",
	"className": "Name",
```

Add to `src/locales/pt-br.json`:

```json
	"addClass": "Adicionar classe",
	"editClass": "Editar classe",
	"className": "Nome",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/classes/ClassFormModal.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/classes/ClassFormModal.tsx src/features/classes/ClassFormModal.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add ClassFormModal for creating and renaming classes"
```

---

## Task 5: `ClassSection`

**Files:**
- Create: `src/features/classes/ClassSection.tsx`
- Test: `src/features/classes/ClassSection.test.tsx`
- Modify: `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `useCategories` from `../categories/useCategories`; `useClasses` from Task 3; `archiveClass` from Task 2; `ClassFormModal` from Task 4; `ItemClass` from Task 1.
- Produces: `ClassSection` component, props `{ uid: string }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/classes/ClassSection.test.tsx
import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { ClassSection } from "./ClassSection";

const uid = "test-user-class-section-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

async function seedCategory(key: string, name: string, emoji: string) {
	await setDoc(doc(db, "users", uid, "categories", key), {
		key,
		name,
		emoji,
		order: key === "foods" ? 0 : 1,
		archived: false,
	});
}

describe("ClassSection", () => {
	it("defaults to the first category and lists its classes", async () => {
		await seedCategory("foods", "Foods", "🍎");
		await seedCategory("cleaning", "Cleaning", "🧼");
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		render(<ClassSection uid={uid} />);

		await screen.findByText("Cheese");
	});

	it("switches the listed classes when a different category is selected", async () => {
		await seedCategory("foods", "Foods", "🍎");
		await seedCategory("cleaning", "Cleaning", "🧼");
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		render(<ClassSection uid={uid} />);
		await screen.findByText("Cheese");

		await userEvent.click(screen.getByRole("combobox"));
		await userEvent.click(await screen.findByText("🧼 Cleaning"));

		await screen.findByText("Soap");
		expect(screen.queryByText("Cheese")).not.toBeInTheDocument();
	});

	it("creates a new class under the selected category", async () => {
		await seedCategory("foods", "Foods", "🍎");

		render(<ClassSection uid={uid} />);
		await screen.findByRole("button", { name: /add class/i });

		await userEvent.click(screen.getByRole("button", { name: /add class/i }));
		await userEvent.type(await screen.findByLabelText(/name/i), "Cheese");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await screen.findByText("Cheese");
	});

	it("requires typing the exact class name before archiving it", async () => {
		await seedCategory("foods", "Foods", "🍎");
		const classRef = await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		render(<ClassSection uid={uid} />);
		await screen.findByText("Cheese");

		await userEvent.click(
			screen.getByRole("button", { name: /delete class/i }),
		);

		const okButton = await screen.findByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "Wrong Name");
		expect(okButton).toBeDisabled();

		await userEvent.clear(screen.getByLabelText(/confirmation/i));
		await userEvent.type(screen.getByLabelText(/confirmation/i), "Cheese");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);

		await waitFor(async () => {
			const classDoc = await getDoc(
				doc(db, "users", uid, "classes", classRef.id),
			);
			expect(classDoc.data()?.archived).toBe(true);
		});
		expect(screen.queryByText("Cheese")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/ClassSection.test.tsx"`
Expected: FAIL — `src/features/classes/ClassSection.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/features/classes/ClassSection.tsx
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
	Button,
	Flex,
	Input,
	Modal,
	Select,
	Typography,
	theme,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { useCategories } from "../categories/useCategories";
import { ClassFormModal } from "./ClassFormModal";
import { archiveClass } from "./firestoreWrites";
import type { ItemClass } from "./schema";
import { useClasses } from "./useClasses";

export function ClassSection({ uid }: { uid: string }) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { categories, loading: categoriesLoading } = useCategories(uid);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(
		null,
	);
	// Falls back to the first available category whenever nothing has been
	// explicitly picked yet (including after the previously selected one
	// disappears, e.g. archived elsewhere) — Select then just shows the new
	// first category rather than a stale, unmatched value.
	const activeCategory = selectedCategory ?? categories[0]?.key ?? null;
	const { classes, loading: classesLoading } = useClasses(
		uid,
		activeCategory ?? "",
	);
	const [formOpen, setFormOpen] = useState(false);
	const [editingClass, setEditingClass] = useState<ItemClass | null>(null);
	const [classPendingDelete, setClassPendingDelete] =
		useState<ItemClass | null>(null);
	const [confirmText, setConfirmText] = useState("");

	if (categoriesLoading || activeCategory === null) return null;

	const handleDeleteConfirm = async () => {
		if (!classPendingDelete) return;
		try {
			await archiveClass(uid, classPendingDelete.id);
		} catch {
			message.error("Something went wrong, please try again");
		} finally {
			setClassPendingDelete(null);
			setConfirmText("");
		}
	};

	return (
		<>
			<Select
				value={activeCategory}
				onChange={setSelectedCategory}
				options={categories.map((category) => ({
					value: category.key,
					label: `${category.emoji} ${category.name}`,
				}))}
				style={{ width: 280, maxWidth: "100%", marginBottom: 12 }}
			/>
			{!classesLoading &&
				classes.map((cls) => (
					<Flex
						key={cls.id}
						justify="space-between"
						align="center"
						style={{
							padding: "12px 0",
							borderBottom: `1px solid ${token.colorSplit}`,
						}}
					>
						<Typography.Text strong>{cls.name}</Typography.Text>
						<Flex gap="small">
							<Button
								type="text"
								icon={<EditOutlined />}
								onClick={() => {
									setEditingClass(cls);
									setFormOpen(true);
								}}
								aria-label={t("settings.editClass")}
							/>
							<Button
								type="text"
								danger
								icon={<DeleteOutlined />}
								onClick={() => setClassPendingDelete(cls)}
								aria-label={t("settings.deleteClass")}
							/>
						</Flex>
					</Flex>
				))}
			<Button
				icon={<PlusOutlined />}
				onClick={() => {
					setEditingClass(null);
					setFormOpen(true);
				}}
				style={{ marginTop: 12 }}
			>
				{t("settings.addClass")}
			</Button>
			<ClassFormModal
				uid={uid}
				category={activeCategory}
				open={formOpen}
				onClose={() => {
					setFormOpen(false);
					setEditingClass(null);
				}}
				editingClass={editingClass}
			/>
			<Modal
				title={t("settings.deleteClassConfirmTitle")}
				open={classPendingDelete !== null}
				onOk={handleDeleteConfirm}
				onCancel={() => {
					setClassPendingDelete(null);
					setConfirmText("");
				}}
				okButtonProps={{
					disabled: classPendingDelete
						? confirmText.trim() !== classPendingDelete.name
						: true,
					danger: true,
				}}
			>
				<p>
					{t("settings.deleteClassConfirmBody", {
						className: classPendingDelete?.name ?? "",
					})}
				</p>
				<Input
					value={confirmText}
					onChange={(event) => setConfirmText(event.target.value)}
					aria-label={t("settings.deleteClassConfirmInputLabel")}
					placeholder={t("settings.deleteClassConfirmPlaceholder", {
						className: classPendingDelete?.name ?? "",
					})}
				/>
			</Modal>
		</>
	);
}
```

Add to `src/locales/en-us.json`:

```json
	"deleteClass": "Delete class",
	"deleteClassConfirmTitle": "Delete this class?",
	"deleteClassConfirmBody": "This will ungroup any items currently using \"{{className}}\" — they stay in your pantry individually. Type \"{{className}}\" to confirm.",
	"deleteClassConfirmInputLabel": "Confirmation",
	"deleteClassConfirmPlaceholder": "Type \"{{className}}\" to confirm",
```

Add to `src/locales/pt-br.json`:

```json
	"deleteClass": "Excluir classe",
	"deleteClassConfirmTitle": "Excluir esta classe?",
	"deleteClassConfirmBody": "Isso vai desagrupar os itens que usam \"{{className}}\" — eles continuam na sua despensa individualmente. Digite \"{{className}}\" para confirmar.",
	"deleteClassConfirmInputLabel": "Confirmação",
	"deleteClassConfirmPlaceholder": "Digite \"{{className}}\" para confirmar",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/classes/ClassSection.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/classes/ClassSection.tsx src/features/classes/ClassSection.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add ClassSection management UI, scoped by category"
```

---

## Task 6: Wire `ClassSection` into Settings

**Files:**
- Modify: `src/features/settings/SettingsPane.tsx`
- Modify: `src/features/settings/SettingsPane.test.tsx`
- Modify: `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `ClassSection` from Task 5 (`../classes/ClassSection`).

- [ ] **Step 1: Write the failing test**

Add to `src/features/settings/SettingsPane.test.tsx` (new `describe` block, placed after the existing "SettingsPane categories" block):

```typescript
describe("SettingsPane classes", () => {
	it("renders the Classes section for the default category", async () => {
		render(<SettingsPane uid="test-user-settings-ui-7" settings={settings} />);

		await screen.findByText("Foods");
		await screen.findByRole("button", { name: /add class/i });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/SettingsPane.test.tsx"`
Expected: FAIL — no "add class" button rendered yet.

- [ ] **Step 3: Write the implementation**

In `src/features/settings/SettingsPane.tsx`, add the import:

```typescript
import { ClassSection } from "../classes/ClassSection";
```

and add a new `Card` after the existing Categories `Card` (around line 167):

```tsx
				<Card title={t("settings.sectionCategories")}>
					<CategorySection uid={uid} />
				</Card>
				<Card title={t("settings.sectionClasses")}>
					<ClassSection uid={uid} />
				</Card>
```

Add to `src/locales/en-us.json`:

```json
	"sectionClasses": "Classes",
```

Add to `src/locales/pt-br.json`:

```json
	"sectionClasses": "Classes",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/settings/SettingsPane.test.tsx"`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsPane.tsx src/features/settings/SettingsPane.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add Classes section to Settings"
```

---

## Task 7: `PantryItem.classKey`

**Files:**
- Modify: `src/features/pantry-items/schema.ts`
- Modify: `src/features/pantry-items/schema.test.ts`

**Interfaces:**
- Produces: `itemDocSchema` gains `class_key: z.string().nullable().optional()`; `PantryItem` gains `classKey?: string | null`; `parseItemDoc` sets it from `parsed.class_key ?? null`; `toItemDoc` writes `class_key: item.classKey ?? null`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/schema.test.ts` (new tests inside the existing `describe("parseItemDoc", ...)` and `describe("toItemDoc", ...)` blocks — check the file for the latter's exact name first; add alongside it):

```typescript
describe("parseItemDoc class_key", () => {
	it("defaults classKey to null when the field is absent", () => {
		const result = parseItemDoc("item1", {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result.classKey).toBeNull();
	});

	it("round-trips a provided class_key", () => {
		const result = parseItemDoc("item1", {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			class_key: "soap-key",
		});
		expect(result.classKey).toBe("soap-key");
	});
});

describe("toItemDoc class_key", () => {
	it("writes class_key: null when classKey is omitted", () => {
		const result = toItemDoc({
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		expect(result.class_key).toBeNull();
	});

	it("writes the provided classKey", () => {
		const result = toItemDoc({
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			classKey: "soap-key",
		});
		expect(result.class_key).toBe("soap-key");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/pantry-items/schema.test.ts`
Expected: FAIL — `classKey`/`class_key` not yet recognized (TS error on the `classKey` literal, and `result.classKey`/`result.class_key` are `undefined`, not matching the assertions).

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/schema.ts`:

```typescript
export const itemDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	quantity: z.number().int().nonnegative(),
	expiring_date: timestampSchema.nullable(),
	duration: z.number().int().positive().nullable(),
	date_opened: timestampSchema.nullable(),
	opened: z.boolean(),
	recurring: z.boolean(),
	barcode: z.string().nullable().optional(),
	source: z.enum(["manual", "barcode"]).optional(),
	last_notified_at: timestampSchema.nullable().optional(),
	class_key: z.string().nullable().optional(),
});

export interface PantryItem {
	id: string;
	name: string;
	category: string;
	quantity: number;
	expiringDate: Date | null;
	duration: number | null;
	dateOpened: Date | null;
	opened: boolean;
	recurring: boolean;
	barcode: string | null;
	source: "manual" | "barcode";
	lastNotifiedAt?: Date | null;
	classKey?: string | null;
}

export function parseItemDoc(id: string, data: unknown): PantryItem {
	const parsed = itemDocSchema.parse(data);
	return {
		id,
		name: parsed.name,
		category: parsed.category,
		quantity: parsed.quantity,
		expiringDate: parsed.expiring_date ? parsed.expiring_date.toDate() : null,
		duration: parsed.duration,
		dateOpened: parsed.date_opened ? parsed.date_opened.toDate() : null,
		opened: parsed.opened,
		recurring: parsed.recurring,
		barcode: parsed.barcode ?? null,
		source: parsed.source ?? "manual",
		lastNotifiedAt: parsed.last_notified_at
			? parsed.last_notified_at.toDate()
			: null,
		classKey: parsed.class_key ?? null,
	};
}
```

And in `toItemDoc`:

```typescript
export function toItemDoc(item: Omit<PantryItem, "id">) {
	return {
		name: item.name,
		category: item.category,
		quantity: item.quantity,
		expiring_date: item.expiringDate
			? Timestamp.fromDate(item.expiringDate)
			: null,
		duration: item.duration,
		date_opened: item.dateOpened ? Timestamp.fromDate(item.dateOpened) : null,
		opened: item.opened,
		recurring: item.recurring,
		barcode: item.barcode,
		source: item.source,
		last_notified_at: item.lastNotifiedAt
			? Timestamp.fromDate(item.lastNotifiedAt)
			: null,
		class_key: item.classKey ?? null,
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/pantry-items/schema.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/schema.ts src/features/pantry-items/schema.test.ts
git commit -m "feat: add optional classKey field to PantryItem"
```

---

## Task 8: Propagate `classKey` through item writes

**Files:**
- Modify: `src/features/pantry-items/firestoreWrites.ts`
- Modify: `src/features/pantry-items/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `PantryItem.classKey`, `toItemDoc` from Task 7.
- Produces: `updateItemDetails`'s `ItemDetailsChanges` gains `classKey: string | null`; the split "opened item" doc created inside `updateItemQuantities` carries the original item's `classKey` forward.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/firestoreWrites.test.ts`, inside the existing `describe("updateItemDetails", ...)` block:

```typescript
	it("updates class_key via updateItemDetails", async () => {
		const itemRef = doc(collection(db, "users", uid, "items"));
		await setDoc(
			itemRef,
			toItemDoc({
				name: "Dove Soap",
				category: "cleaning",
				quantity: 1,
				expiringDate: null,
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);

		await updateItemDetails(uid, itemRef.id, {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			classKey: "soap-key",
		});

		const itemDoc = await getDoc(doc(db, "users", uid, "items", itemRef.id));
		expect(itemDoc.data()?.class_key).toBe("soap-key");
	});
```

Add a new `describe` block for the split-doc carry-over:

```typescript
describe("updateItemQuantities classKey carry-over", () => {
	it("carries classKey onto the split opened-item doc", async () => {
		const itemRef = doc(collection(db, "users", uid, "items"));
		await setDoc(
			itemRef,
			toItemDoc({
				name: "Dove Soap",
				category: "cleaning",
				quantity: 3,
				expiringDate: null,
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
				classKey: "soap-key",
			}),
		);

		await updateItemQuantities(uid, itemRef.id, {
			opened: 1,
			consumed: 0,
			discarded: 0,
		});

		const itemsSnapshot = await getDocs(collection(db, "users", uid, "items"));
		const openedItem = itemsSnapshot.docs.find((d) => d.data().opened);
		expect(openedItem?.data().class_key).toBe("soap-key");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/firestoreWrites.test.ts"`
Expected: FAIL — `classKey` not yet accepted by `ItemDetailsChanges`/not yet carried onto the split doc.

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/firestoreWrites.ts`, update `ItemDetailsChanges` and `updateItemDetails`:

```typescript
interface ItemDetailsChanges {
	name: string;
	category: string;
	quantity: number;
	expiringDate: Date | null;
	duration: number | null;
	classKey: string | null;
}

export async function updateItemDetails(
	uid: string,
	itemId: string,
	changes: ItemDetailsChanges,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "items", itemId), {
		name: changes.name,
		category: changes.category,
		quantity: changes.quantity,
		expiring_date: changes.expiringDate
			? Timestamp.fromDate(changes.expiringDate)
			: null,
		duration: changes.duration,
		class_key: changes.classKey,
	});
}
```

And in `updateItemQuantities`'s split opened-item doc (inside the `if (changes.opened > 0)` block):

```typescript
			const openedItemDocRef = doc(collection(db, "users", uid, "items"));
			transaction.set(
				openedItemDocRef,
				toItemDoc({
					name: item.name,
					category: item.category,
					quantity: changes.opened,
					expiringDate: newExpiringDate,
					duration: item.duration,
					dateOpened: when,
					opened: true,
					recurring: item.recurring,
					barcode: item.barcode,
					source: item.source,
					classKey: item.classKey,
				}),
			);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/firestoreWrites.test.ts"`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/firestoreWrites.ts src/features/pantry-items/firestoreWrites.test.ts
git commit -m "feat: propagate classKey through item detail edits and quantity splits"
```

---

## Task 9: Class-aware `useShoppingList`

**Files:**
- Modify: `src/features/pantry-items/useShoppingList.ts`
- Modify: `src/features/pantry-items/useShoppingList.test.tsx`

**Interfaces:**
- Consumes: `ItemClass` from `../classes/schema` (Task 1); `PantryItem.classKey` from Task 7.
- Produces: `useShoppingList(uid, categoryKey, pantryItems, threshold, classes: ItemClass[]): { shoppingList: ShoppingListEntry[]; loading: boolean }`; `ShoppingListEntry` becomes `{ key: string; label: string; quantity: number; name: string | null; classKey: string | null }` (replacing the old `{ name, quantity }` shape).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/features/pantry-items/useShoppingList.test.tsx`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemClass } from "../classes/schema";
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

function makeItem(
	name: string,
	quantity: number,
	classKey: string | null = null,
): PantryItem {
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
		classKey,
	};
}

function makeClass(key: string, name: string): ItemClass {
	return { id: key, key, category: "foods", name, archived: false };
}

describe("useShoppingList", () => {
	it("includes a recurring item at or below the threshold", async () => {
		await seedHistory("Milk", true);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 2)], 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ key: "Milk", label: "Milk", quantity: 2, name: "Milk", classKey: null },
		]);
	});

	it("excludes a recurring item above the threshold", async () => {
		await seedHistory("Milk", true);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 5)], 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("excludes a non-recurring item even with zero stock", async () => {
		await seedHistory("Napkins", false);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [], 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("includes a recurring item with zero current pantry quantity", async () => {
		await seedHistory("Eggs", true);
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [], 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ key: "Eggs", label: "Eggs", quantity: 0, name: "Eggs", classKey: null },
		]);
	});

	it("skips a malformed item_history doc instead of breaking the whole listener", async () => {
		await seedHistory("Milk", true);
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Bad")),
			{ name: "Bad", category: "foods", duration: 7, recurring: true },
		);

		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 1)], 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ key: "Milk", label: "Milk", quantity: 1, name: "Milk", classKey: null },
		]);
	});

	it("aggregates quantity across multiple item docs with the same name", async () => {
		await seedHistory("Milk", true);
		const items = [
			makeItem("Milk", 1),
			{ ...makeItem("Milk", 1), id: "milk-2", opened: true },
		];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ key: "Milk", label: "Milk", quantity: 2, name: "Milk", classKey: null },
		]);
	});

	it("aggregates classed items by class, labeled with the class name", async () => {
		await seedHistory("Dove Soap", true);
		const soapClass = makeClass("soap-key", "Soap");
		const items = [
			makeItem("Dove Soap", 1, "soap-key"),
			makeItem("Lux Soap", 1, "soap-key"),
		];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3, [soapClass]),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{
				key: "soap-key",
				label: "Soap",
				quantity: 2,
				name: null,
				classKey: "soap-key",
			},
		]);
	});

	it("treats a class as recurring-eligible if any member name is recurring, even if others aren't", async () => {
		await seedHistory("Dove Soap", true);
		await seedHistory("Lux Soap", false);
		const soapClass = makeClass("soap-key", "Soap");
		const items = [
			makeItem("Dove Soap", 1, "soap-key"),
			makeItem("Lux Soap", 1, "soap-key"),
		];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 5, [soapClass]),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{
				key: "soap-key",
				label: "Soap",
				quantity: 2,
				name: null,
				classKey: "soap-key",
			},
		]);
	});

	// Review Focus: an item's classKey pointing to a class not present in the
	// live `classes` list (archived, deleted, or belonging to another
	// category) must fall back to per-name aggregation, not vanish.
	it("falls back to per-name aggregation when an item's class is archived/missing from the live list", async () => {
		await seedHistory("Dove Soap", true);
		const items = [makeItem("Dove Soap", 1, "stale-soap-key")];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3, []),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{
				key: "Dove Soap",
				label: "Dove Soap",
				quantity: 1,
				name: "Dove Soap",
				classKey: null,
			},
		]);
	});

	it("excludes a fully-classed recurring name from also appearing as its own separate entry", async () => {
		await seedHistory("Dove Soap", true);
		const soapClass = makeClass("soap-key", "Soap");
		const items = [makeItem("Dove Soap", 1, "soap-key")];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3, [soapClass]),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{
				key: "soap-key",
				label: "Soap",
				quantity: 1,
				name: null,
				classKey: "soap-key",
			},
		]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/useShoppingList.test.tsx"`
Expected: FAIL — the hook still returns `{ name, quantity }` entries and doesn't accept a `classes` argument.

- [ ] **Step 3: Write the implementation**

Replace `src/features/pantry-items/useShoppingList.ts` in full:

```typescript
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { message } from "../../lib/feedback";
import { db } from "../../lib/firebase";
import type { ItemClass } from "../classes/schema";
import { type PantryItem, safeParseItemHistoryDoc } from "./schema";

export interface ShoppingListEntry {
	key: string;
	label: string;
	quantity: number;
	name: string | null;
	classKey: string | null;
}

export function useShoppingList(
	uid: string,
	categoryKey: string,
	pantryItems: PantryItem[],
	threshold: number,
	classes: ItemClass[],
): { shoppingList: ShoppingListEntry[]; loading: boolean } {
	const [recurringNames, setRecurringNames] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const historyQuery = query(
			collection(db, "users", uid, "item_history"),
			where("category", "==", categoryKey),
			where("recurring", "==", true),
		);
		const unsubscribe = onSnapshot(
			historyQuery,
			(snapshot) => {
				const names: string[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemHistoryDoc(d.data());
					if (parsed) {
						names.push(parsed.name);
					} else {
						console.warn(
							`useShoppingList: skipping malformed item_history doc ${d.id}`,
						);
					}
				}
				setRecurringNames(names);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid, categoryKey]);

	const liveClassKeys = new Set(classes.map((cls) => cls.key));
	const classNameByKey = new Map(classes.map((cls) => [cls.key, cls.name]));
	const recurringNameSet = new Set(recurringNames);
	const isLiveClassed = (item: PantryItem) =>
		!!item.classKey && liveClassKeys.has(item.classKey);

	const shoppingList: ShoppingListEntry[] = [];

	const classGroups = new Map<string, PantryItem[]>();
	for (const item of pantryItems) {
		if (isLiveClassed(item)) {
			// isLiveClassed guarantees item.classKey is non-null here.
			const classKey = item.classKey as string;
			const group = classGroups.get(classKey) ?? [];
			group.push(item);
			classGroups.set(classKey, group);
		}
	}
	for (const [classKey, groupItems] of classGroups) {
		const isRecurring = groupItems.some((item) =>
			recurringNameSet.has(item.name),
		);
		if (!isRecurring) continue;
		const quantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
		if (quantity > threshold) continue;
		shoppingList.push({
			key: classKey,
			label: classNameByKey.get(classKey) ?? "",
			quantity,
			name: null,
			classKey,
		});
	}

	for (const name of recurringNames) {
		const occurrences = pantryItems.filter((item) => item.name === name);
		const fullyClassed =
			occurrences.length > 0 && occurrences.every(isLiveClassed);
		if (fullyClassed) continue;
		const quantity = occurrences
			.filter((item) => !isLiveClassed(item))
			.reduce((sum, item) => sum + item.quantity, 0);
		if (quantity > threshold) continue;
		shoppingList.push({ key: name, label: name, quantity, name, classKey: null });
	}

	return { shoppingList, loading };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/useShoppingList.test.tsx"`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/useShoppingList.ts src/features/pantry-items/useShoppingList.test.tsx
git commit -m "feat: aggregate shopping list entries by class, falling back per-name"
```

---

## Task 10: Wire classes into `ShoppingList`

**Files:**
- Modify: `src/features/pantry-items/ShoppingList.tsx`
- Modify: `src/features/pantry-items/ShoppingList.test.tsx` (create if it doesn't already exist — check first with `ls src/features/pantry-items/ShoppingList.test.tsx`)

**Interfaces:**
- Consumes: `useClasses` from `../classes/useClasses` (Task 3); `ShoppingListEntry` from Task 9.
- Produces: `ShoppingList`'s `onAddItem` prop changes from `(name: string) => void` to `(entry: { name?: string; classKey?: string }) => void`.

- [ ] **Step 1: Write the failing test**

First check whether `src/features/pantry-items/ShoppingList.test.tsx` exists:

Run: `ls src/features/pantry-items/ShoppingList.test.tsx`

If it doesn't exist, create it with this content. If it exists, add these `describe` blocks to it.

```typescript
// src/features/pantry-items/ShoppingList.test.tsx
import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection, doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../categories/schema";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { ShoppingList } from "./ShoppingList";
import type { PantryItem } from "./schema";

const uid = "test-user-shopping-list-1";

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

function makeItem(
	name: string,
	quantity: number,
	classKey: string | null = null,
): PantryItem {
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
		classKey,
	};
}

describe("ShoppingList class entries", () => {
	it("passes classKey (not name) to onAddItem for a classed entry's cart icon", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "foods",
			name: "Soap",
			archived: false,
		});
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Dove Soap")),
			{ name: "Dove Soap", category: "foods", duration: "", recurring: true },
		);
		const onAddItem = vi.fn();

		render(
			<ShoppingList
				uid={uid}
				category={category}
				pantryItems={[makeItem("Dove Soap", 1, "soap-key")]}
				threshold={3}
				onAddItem={onAddItem}
			/>,
		);

		await screen.findByText("Soap");
		await userEvent.click(screen.getByRole("button", { name: "" }));

		expect(onAddItem).toHaveBeenCalledWith({
			name: undefined,
			classKey: "soap-key",
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/ShoppingList.test.tsx"`
Expected: FAIL — `onAddItem` is still called with a bare name string, and the entry renders by `entry.name` (which is `null` for a class entry), not `entry.label`.

- [ ] **Step 3: Write the implementation**

Replace `src/features/pantry-items/ShoppingList.tsx` in full:

```tsx
import { EyeOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { Button, Empty, Flex, Listy, Typography, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { useClasses } from "../classes/useClasses";
import type { PantryItem } from "./schema";
import { useUiPreferencesStore } from "./store";
import { useShoppingList } from "./useShoppingList";

export function ShoppingList({
	uid,
	category,
	pantryItems,
	threshold,
	onAddItem,
}: {
	uid: string;
	category: Category;
	pantryItems: PantryItem[];
	threshold: number;
	onAddItem: (entry: { name?: string; classKey?: string }) => void;
}) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { classes, loading: classesLoading } = useClasses(uid, category.key);
	const { shoppingList, loading } = useShoppingList(
		uid,
		category.key,
		pantryItems,
		threshold,
		classes,
	);
	const { getSkippedNames, skipItem } = useUiPreferencesStore();
	const skippedNames = getSkippedNames(category.key);

	if (loading || classesLoading) return null;

	const sorted = shoppingList
		.filter((entry) => !skippedNames.has(entry.key))
		.sort((a, b) => a.label.localeCompare(b.label));

	if (sorted.length === 0) {
		return <Empty description={t("items.shoppingListEmpty")} />;
	}

	return (
		<Listy
			items={sorted}
			rowKey="key"
			styles={{
				item: {
					padding: "12px 0",
					borderBottom: `1px solid ${token.colorSplit}`,
				},
			}}
			itemRender={(entry) => (
				<Flex justify="space-between" align="center">
					<Typography.Text strong>{entry.label}</Typography.Text>
					<Flex gap="small">
						<Button
							type="text"
							icon={<ShoppingCartOutlined />}
							onClick={() =>
								onAddItem({
									name: entry.name ?? undefined,
									classKey: entry.classKey ?? undefined,
								})
							}
						/>
						<Button
							type="text"
							icon={<EyeOutlined />}
							onClick={() => skipItem(category.key, entry.key)}
						/>
					</Flex>
				</Flex>
			)}
		/>
	);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/ShoppingList.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/ShoppingList.tsx src/features/pantry-items/ShoppingList.test.tsx
git commit -m "feat: render class-aggregated shopping entries and prefill class on add"
```

---

## Task 11: Class field in `AddItemModal`

**Files:**
- Modify: `src/features/pantry-items/AddItemModal.tsx`
- Modify: `src/features/pantry-items/AddItemModal.test.tsx`
- Modify: `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `ItemClass` from `../classes/schema`; `ClassFormModal` from `../classes/ClassFormModal`.
- Produces: `AddItemModal` gains props `classes: ItemClass[]` and `initialClassKey?: string`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/AddItemModal.test.tsx`:

```typescript
import * as classWritesModule from "../classes/firestoreWrites";
import type { ItemClass } from "../classes/schema";
```

(alongside the existing imports), and add these new `describe` blocks:

```typescript
describe("AddItemModal class field", () => {
	const soapClass: ItemClass = {
		id: "class1",
		key: "soap-key",
		category: "foods",
		name: "Soap",
		archived: false,
	};

	it("pre-selects the class passed via initialClassKey", () => {
		render(
			<AddItemModal
				uid="test-user-add-modal-class-1"
				category={category}
				open
				onClose={vi.fn()}
				classes={[soapClass]}
				initialClassKey="soap-key"
			/>,
		);

		expect(screen.getByText("Soap")).toBeInTheDocument();
	});

	// Review Focus: a class entry's cart icon pre-fills classKey but leaves
	// name blank — the required-name validation must still block submission.
	it("blocks submission when only the class is pre-filled and no name is typed", async () => {
		const addSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const onClose = vi.fn();

		render(
			<AddItemModal
				uid="test-user-add-modal-class-2"
				category={category}
				open
				onClose={onClose}
				classes={[soapClass]}
				initialClassKey="soap-key"
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).not.toHaveBeenCalled());
		expect(addSpy).not.toHaveBeenCalled();
	});

	it("creates a new class inline and submits the item with its key", async () => {
		const createSpy = vi
			.spyOn(classWritesModule, "createClass")
			.mockResolvedValue("new-class-key");
		const addSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const onClose = vi.fn();

		render(
			<AddItemModal
				uid="test-user-add-modal-class-3"
				category={category}
				open
				onClose={onClose}
				classes={[]}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/^name$/i), "Lux Soap");
		await userEvent.click(screen.getByLabelText(/class/i));
		await userEvent.click(await screen.findByText(/create.*class/i));

		const classNameInput = await screen.findByLabelText(/^name$/i, {
			selector: "#name",
		});
		await userEvent.type(classNameInput, "Soap");
		await userEvent.click(screen.getAllByRole("button", { name: "OK" })[0]);

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-add-modal-class-3",
				"foods",
				"Soap",
			),
		);

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(addSpy).toHaveBeenCalledWith(
				"test-user-add-modal-class-3",
				expect.objectContaining({ classKey: "new-class-key" }),
			),
		);
	});
});
```

Note on the third test's selector ambiguity: once `ClassFormModal` is open, there are two fields labeled "Name" (the item's and the new class's). The `classNameInput` lookup disambiguates by the rendered `id` (antd sets `id="name"` on both `Form.Item name="name"` fields by default unless scoped — if this collides in practice, use `within(screen.getByRole("dialog", { name: /add class/i }))` to scope the lookup instead; confirm whichever approach actually resolves uniquely when running the test).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/pantry-items/AddItemModal.test.tsx`
Expected: FAIL — `AddItemModal` doesn't accept `classes`/`initialClassKey` yet, no Class field exists.

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/AddItemModal.tsx`, add imports:

```typescript
import { ClassFormModal } from "../classes/ClassFormModal";
import type { ItemClass } from "../classes/schema";
```

Add a sentinel constant near the top:

```typescript
const CREATE_CLASS_VALUE = "__create__";
```

Update `AddItemFormValues`:

```typescript
interface AddItemFormValues {
	name: string;
	barcode?: string;
	quantity: number;
	noExpiration: boolean;
	expiringDate?: Dayjs;
	duration?: number;
	recurring: boolean;
	classKey?: string;
}
```

Update the component's props and add local state:

```typescript
export function AddItemModal({
	uid,
	category,
	open,
	onClose,
	initialName,
	initialRecurring = false,
	classes,
	initialClassKey,
}: {
	uid: string;
	category: Category;
	open: boolean;
	onClose: () => void;
	initialName?: string;
	initialRecurring?: boolean;
	classes: ItemClass[];
	initialClassKey?: string;
}) {
	const { t, i18n } = useTranslation();
	const [form] = Form.useForm<AddItemFormValues>();
	const [scannerOpen, setScannerOpen] = useState(false);
	const [noExpiration, setNoExpiration] = useState(false);
	const [classFormOpen, setClassFormOpen] = useState(false);
```

Update the reset `useEffect` to also seed/clear `classKey`:

```typescript
	useEffect(() => {
		if (open) {
			form.setFieldsValue({
				name: initialName ?? "",
				barcode: "",
				recurring: initialRecurring,
				noExpiration: false,
				classKey: initialClassKey,
			});
		}
	}, [open, initialName, initialRecurring, initialClassKey, form]);
```

Update `handleOk` to pass `classKey` through to `addItem`:

```typescript
	const handleOk = async () => {
		const values = await form.validateFields();
		const barcode = values.barcode?.trim() || null;
		try {
			await addItem(uid, {
				name: values.name.trim(),
				category: category.key,
				quantity: values.quantity,
				expiringDate: values.noExpiration
					? null
					: (values.expiringDate?.toDate() ?? null),
				duration: values.noExpiration ? null : (values.duration ?? null),
				dateOpened: null,
				opened: false,
				recurring: values.recurring,
				barcode,
				source: barcode ? "barcode" : "manual",
				classKey: values.classKey ?? null,
			});
			// ... existing upsertBarcodeProduct block unchanged ...
			form.resetFields();
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};
```

Add the Class field to the form JSX, after the "recurring" `Form.Item` (and add `classKey: initialClassKey` to the `<Form>`'s `initialValues`):

```tsx
					<Form.Item name="classKey" label={t("items.itemClassLabel")}>
						<Select
							allowClear
							options={[
								...classes.map((cls) => ({ value: cls.key, label: cls.name })),
								{
									value: CREATE_CLASS_VALUE,
									label: t("items.itemClassCreateOption"),
								},
							]}
							onChange={(value) => {
								if (value === CREATE_CLASS_VALUE) {
									form.setFieldsValue({ classKey: undefined });
									setClassFormOpen(true);
								}
							}}
						/>
					</Form.Item>
```

Add `Select` to the antd import list at the top of the file, and render the inline create modal just before the closing `</Modal>`:

```tsx
			<ClassFormModal
				uid={uid}
				category={category.key}
				open={classFormOpen}
				onClose={() => setClassFormOpen(false)}
				editingClass={null}
				onCreated={(classId) => form.setFieldsValue({ classKey: classId })}
			/>
```

Add to `src/locales/en-us.json`:

```json
	"itemClassLabel": "Class",
	"itemClassCreateOption": "+ Create new class",
```

Add to `src/locales/pt-br.json`:

```json
	"itemClassLabel": "Classe",
	"itemClassCreateOption": "+ Criar nova classe",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/pantry-items/AddItemModal.test.tsx`
Expected: PASS (all tests in the file, including the 3 new ones). If the third test's dual-"Name"-field selector doesn't resolve as written, scope it with `within(screen.getByRole("dialog", { name: /add class/i }))` instead and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/AddItemModal.tsx src/features/pantry-items/AddItemModal.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add class field (with inline create) to Add Item"
```

---

## Task 12: Class field in `EditItemModal`

**Files:**
- Modify: `src/features/pantry-items/EditItemModal.tsx`
- Modify: `src/features/pantry-items/EditItemModal.test.tsx`

**Interfaces:**
- Consumes: `ItemClass` from `../classes/schema`; `ClassFormModal` from `../classes/ClassFormModal`.
- Produces: `EditItemModal` gains prop `classes: ItemClass[]`; its Details form gains a Class field, writing through `updateItemDetails`'s now-required `classKey`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/EditItemModal.test.tsx`, a new `describe` block:

```typescript
import type { ItemClass } from "../classes/schema";
```

(alongside existing imports), then:

```typescript
describe("EditItemModal class field", () => {
	const soapClass: ItemClass = {
		id: "class1",
		key: "soap-key",
		category: "foods",
		name: "Soap",
		archived: false,
	};

	it("updates classKey via the details form", async () => {
		const user = userEvent.setup();
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Dove Soap",
			category: "foods",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			class_key: null,
		});
		const item: PantryItem = {
			id: original.id,
			name: "Dove Soap",
			category: "foods",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			classKey: null,
		};
		const onClose = vi.fn();

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				classes={[soapClass]}
				onClose={onClose}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /fix item details/i }));
		await user.click(screen.getByLabelText(/class/i));
		await user.click(await screen.findByText("Soap"));
		await user.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const itemDoc = await getDoc(doc(db, "users", uid, "items", original.id));
		expect(itemDoc.data()?.class_key).toBe("soap-key");
	});

	// Review Focus: an item whose classKey refers to a class that's since
	// been archived/deleted must still render without crashing.
	it("renders without crashing when the item's classKey refers to a class not in the given list", () => {
		const item: PantryItem = {
			id: "item-stale-class",
			name: "Dove Soap",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			classKey: "stale-soap-key",
		};

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				classes={[]}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText("Dove Soap")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/EditItemModal.test.tsx"`
Expected: FAIL — `EditItemModal` doesn't accept `classes` yet, no Class field exists, and `updateItemDetails` isn't called with `classKey`.

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/EditItemModal.tsx`, add imports:

```typescript
import { ClassFormModal } from "../classes/ClassFormModal";
import type { ItemClass } from "../classes/schema";
```

and `Select` is already imported from `antd`. Add a sentinel near the top:

```typescript
const CREATE_CLASS_VALUE = "__create__";
```

Update `DetailsFormValues`:

```typescript
interface DetailsFormValues {
	name: string;
	category: string;
	quantity: number;
	noExpiration: boolean;
	expiringDate?: Dayjs;
	duration?: number;
	classKey?: string;
}
```

Update the component's props:

```typescript
export function EditItemModal({
	uid,
	item,
	categories,
	classes,
	onClose,
}: {
	uid: string;
	item: PantryItem;
	categories: Category[];
	classes: ItemClass[];
	onClose: () => void;
}) {
```

and add local state alongside the existing `mode`/`happeningNow`/`noExpiration` state:

```typescript
	const [classFormOpen, setClassFormOpen] = useState(false);
```

Update `handleDetailsOk`:

```typescript
	const handleDetailsOk = async () => {
		const values = await detailsForm.validateFields();
		try {
			await updateItemDetails(uid, item.id, {
				name: values.name.trim(),
				category: values.category,
				quantity: values.quantity,
				expiringDate: values.noExpiration
					? null
					: (values.expiringDate?.toDate() ?? null),
				duration: values.noExpiration ? null : (values.duration ?? null),
				classKey: values.classKey ?? null,
			});
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};
```

Update the details `<Form>`'s `initialValues` to include `classKey: item.classKey ?? undefined,`, and add the Class field after the "duration" `Form.Item` (inside the `!noExpiration` block's closing, i.e. as a sibling after that whole conditional block, before the closing `</Form>`):

```tsx
					<Form.Item name="classKey" label={t("items.itemClassLabel")}>
						<Select
							allowClear
							options={[
								...classes.map((cls) => ({ value: cls.key, label: cls.name })),
								{
									value: CREATE_CLASS_VALUE,
									label: t("items.itemClassCreateOption"),
								},
							]}
							onChange={(value) => {
								if (value === CREATE_CLASS_VALUE) {
									detailsForm.setFieldsValue({ classKey: undefined });
									setClassFormOpen(true);
								}
							}}
						/>
					</Form.Item>
```

and render the inline create modal just before the closing `</Modal>`:

```tsx
			<ClassFormModal
				uid={uid}
				category={item.category}
				open={classFormOpen}
				onClose={() => setClassFormOpen(false)}
				editingClass={null}
				onCreated={(classId) => detailsForm.setFieldsValue({ classKey: classId })}
			/>
```

Now update every call site of `<EditItemModal ... />` that's missing the new required `classes` prop:
- `src/features/pantry-items/ItemList.tsx` (handled in Task 15, not here — leave for now; `tsc` will flag it as a dangling error until Task 15 lands, which is fine mid-plan since each task's own test file is what's run per-step, but note it in Task 15's Step 1).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/EditItemModal.test.tsx"`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/EditItemModal.tsx src/features/pantry-items/EditItemModal.test.tsx
git commit -m "feat: add class field (with inline create) to Edit Item details"
```

---

## Task 13: `groupByClass` store state

**Files:**
- Modify: `src/features/pantry-items/store.ts`
- Modify: `src/features/pantry-items/store.test.ts`

**Interfaces:**
- Produces: `useUiPreferencesStore` gains `isGroupByClassOn(categoryKey: string): boolean` and `setGroupByClassOn(categoryKey: string, on: boolean): void`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/store.test.ts`:

```typescript
describe("group by class state", () => {
	it("defaults to off for an unseen category", () => {
		const state = useUiPreferencesStore.getState();
		expect(state.isGroupByClassOn("foods")).toBe(false);
	});

	it("tracks group-by-class per category independently", () => {
		const { setGroupByClassOn, isGroupByClassOn } =
			useUiPreferencesStore.getState();
		setGroupByClassOn("foods", true);
		expect(isGroupByClassOn("foods")).toBe(true);
		expect(isGroupByClassOn("medicines")).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/pantry-items/store.test.ts`
Expected: FAIL — `isGroupByClassOn`/`setGroupByClassOn` don't exist yet.

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/store.ts`, add to the `UiPreferencesState` interface:

```typescript
	groupByClassByCategory: Record<string, boolean>;
	isGroupByClassOn: (categoryKey: string) => boolean;
	setGroupByClassOn: (categoryKey: string, on: boolean) => void;
```

and to the store implementation:

```typescript
	groupByClassByCategory: {},
	isGroupByClassOn: (categoryKey) =>
		get().groupByClassByCategory[categoryKey] ?? false,
	setGroupByClassOn: (categoryKey, on) =>
		set((state) => ({
			groupByClassByCategory: { ...state.groupByClassByCategory, [categoryKey]: on },
		})),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/pantry-items/store.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/store.ts src/features/pantry-items/store.test.ts
git commit -m "feat: add per-category group-by-class UI preference"
```

---

## Task 14: `ClassGroupedItemList`

**Files:**
- Create: `src/features/pantry-items/ClassGroupedItemList.tsx`
- Test: `src/features/pantry-items/ClassGroupedItemList.test.tsx`

**Interfaces:**
- Consumes: `ItemClass` from `../classes/schema`; `PantryItem` from `./schema`; `ItemListItem` from `./ItemListItem`.
- Produces: `ClassGroupedItemList` component, props `{ items: PantryItem[]; classes: ItemClass[]; onItemClick: (item: PantryItem) => void }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/pantry-items/ClassGroupedItemList.test.tsx
import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ItemClass } from "../classes/schema";
import { ClassGroupedItemList } from "./ClassGroupedItemList";
import type { PantryItem } from "./schema";

function makeItem(
	id: string,
	name: string,
	quantity: number,
	classKey: string | null = null,
): PantryItem {
	return {
		id,
		name,
		category: "cleaning",
		quantity,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		classKey,
	};
}

const soapClass: ItemClass = {
	id: "class1",
	key: "soap-key",
	category: "cleaning",
	name: "Soap",
	archived: false,
};

describe("ClassGroupedItemList", () => {
	it("collapses classed items into one group row with member count and summed quantity", async () => {
		const items = [
			makeItem("dove", "Dove Soap", 2, "soap-key"),
			makeItem("lux", "Lux Soap", 1, "soap-key"),
		];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("Soap (2)")).toBeInTheDocument();
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.queryByText("Dove Soap")).not.toBeInTheDocument();

		await userEvent.click(screen.getByText("Soap (2)"));
		expect(screen.getByText("Dove Soap")).toBeInTheDocument();
		expect(screen.getByText("Lux Soap")).toBeInTheDocument();
	});

	it("renders an unclassed item individually, not inside any group", () => {
		const items = [makeItem("bags", "Trash Bags", 1, null)];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("Trash Bags")).toBeInTheDocument();
		expect(screen.queryByText("Soap")).not.toBeInTheDocument();
	});

	// Review Focus: an item whose classKey refers to a class absent from the
	// live `classes` list (archived, deleted, or cross-category) must render
	// individually, not disappear or crash.
	it("renders an item individually when its classKey isn't in the live classes list", () => {
		const items = [makeItem("dove", "Dove Soap", 1, "stale-key")];

		render(
			<ClassGroupedItemList items={items} classes={[]} onItemClick={vi.fn()} />,
		);

		expect(screen.getByText("Dove Soap")).toBeInTheDocument();
	});

	it("calls onItemClick with the clicked item, inside and outside groups", async () => {
		const onItemClick = vi.fn();
		const items = [
			makeItem("dove", "Dove Soap", 1, "soap-key"),
			makeItem("bags", "Trash Bags", 1, null),
		];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={onItemClick}
			/>,
		);

		await userEvent.click(screen.getByText("Trash Bags"));
		expect(onItemClick).toHaveBeenCalledWith(items[1]);

		await userEvent.click(screen.getByText("Soap (1)"));
		await userEvent.click(screen.getByText("Dove Soap"));
		expect(onItemClick).toHaveBeenCalledWith(items[0]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/pantry-items/ClassGroupedItemList.test.tsx`
Expected: FAIL — `src/features/pantry-items/ClassGroupedItemList.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/pantry-items/ClassGroupedItemList.tsx
import { Collapse, Listy, Tag, theme } from "antd";
import type { ItemClass } from "../classes/schema";
import { ItemListItem } from "./ItemListItem";
import type { PantryItem } from "./schema";

export function ClassGroupedItemList({
	items,
	classes,
	onItemClick,
}: {
	items: PantryItem[];
	classes: ItemClass[];
	onItemClick: (item: PantryItem) => void;
}) {
	const { token } = theme.useToken();
	const liveClassKeys = new Set(classes.map((cls) => cls.key));

	const grouped = new Map<string, PantryItem[]>();
	const ungrouped: PantryItem[] = [];
	for (const item of items) {
		if (item.classKey && liveClassKeys.has(item.classKey)) {
			const group = grouped.get(item.classKey) ?? [];
			group.push(item);
			grouped.set(item.classKey, group);
		} else {
			ungrouped.push(item);
		}
	}

	const rowStyles = {
		item: {
			padding: "12px 0",
			borderBottom: `1px solid ${token.colorSplit}`,
		},
	};

	const groupItems = classes
		.filter((cls) => grouped.has(cls.key))
		.map((cls) => {
			const members = grouped.get(cls.key) ?? [];
			const totalQuantity = members.reduce((sum, item) => sum + item.quantity, 0);
			return {
				key: cls.key,
				label: `${cls.name} (${members.length})`,
				extra: <Tag color="blue">{totalQuantity}</Tag>,
				children: (
					<Listy
						items={members}
						rowKey="id"
						styles={rowStyles}
						itemRender={(item) => (
							<ItemListItem item={item} onClick={() => onItemClick(item)} />
						)}
					/>
				),
			};
		});

	return (
		<>
			{groupItems.length > 0 && <Collapse items={groupItems} />}
			{ungrouped.length > 0 && (
				<Listy
					items={ungrouped}
					rowKey="id"
					styles={rowStyles}
					itemRender={(item) => (
						<ItemListItem item={item} onClick={() => onItemClick(item)} />
					)}
				/>
			)}
		</>
	);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/pantry-items/ClassGroupedItemList.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/ClassGroupedItemList.tsx src/features/pantry-items/ClassGroupedItemList.test.tsx
git commit -m "feat: add collapsible class-grouped pantry list component"
```

---

## Task 15: Wire everything into `ItemList`

**Files:**
- Modify: `src/features/pantry-items/ItemList.tsx`
- Modify: `src/features/pantry-items/ItemList.test.tsx` (create if it doesn't already exist — check first with `ls src/features/pantry-items/ItemList.test.tsx`)
- Modify: `src/locales/en-us.json`, `src/locales/pt-br.json`

**Interfaces:**
- Consumes: `useClasses` from `../classes/useClasses`; `isGroupByClassOn`/`setGroupByClassOn` from Task 13; `ClassGroupedItemList` from Task 14; `ShoppingList`'s new `onAddItem` shape from Task 10; `AddItemModal`'s new `classes`/`initialClassKey` props from Task 11; `EditItemModal`'s new `classes` prop from Task 12.

- [ ] **Step 1: Write the failing tests**

First check whether `src/features/pantry-items/ItemList.test.tsx` exists:

Run: `ls src/features/pantry-items/ItemList.test.tsx`

If it doesn't exist, create it with this content. If it exists, add these `describe` blocks to it, reusing its existing `uid`/`category`/`categories` fixtures if present instead of redeclaring them.

```typescript
// src/features/pantry-items/ItemList.test.tsx
import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import type { Category } from "../categories/schema";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { ItemList } from "./ItemList";

const uid = "test-user-item-list-class-1";

const category: Category = {
	id: "cleaning-id",
	key: "cleaning",
	name: "Cleaning",
	emoji: "🧼",
	order: 0,
	archived: false,
};

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("ItemList group by class", () => {
	it("collapses classed items into a group row when the toggle is switched on", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			class_key: "soap-key",
		});

		render(
			<ItemList
				uid={uid}
				category={category}
				categories={[category]}
				lowStockThreshold={3}
				hideDistantThresholdMonths={6}
				hideDistantEnabled={false}
			/>,
		);

		await screen.findByText("Dove Soap");
		expect(screen.queryByText("Soap (1)")).not.toBeInTheDocument();

		await userEvent.click(
			screen.getByRole("switch", { name: /group by class/i }),
		);

		await screen.findByText("Soap (1)");
		expect(screen.queryByText("Dove Soap")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/ItemList.test.tsx"`
Expected: FAIL — no "group by class" switch exists yet, and `ItemList` doesn't pass `classes` to its children (which now require it, so this will also surface as a type error until fixed).

- [ ] **Step 3: Write the implementation**

In `src/features/pantry-items/ItemList.tsx`, add imports:

```typescript
import { ClassGroupedItemList } from "./ClassGroupedItemList";
import { useClasses } from "../classes/useClasses";
```

Add the `classes` fetch and `groupByClass` store wiring, and extend the loading guard:

```typescript
	const { items, loading } = usePantryItems(uid, category.key);
	const { classes, loading: classesLoading } = useClasses(uid, category.key);
```

```typescript
	const {
		getSortDirection,
		getFilter,
		getSearch,
		setSearch,
		isShoppingModeOn,
		setShoppingModeOn,
		isGroupByClassOn,
		setGroupByClassOn,
	} = useUiPreferencesStore();
	const direction = getSortDirection(category.key);
	const filter = getFilter(category.key);
	const search = getSearch(category.key);
	const shoppingModeOn = isShoppingModeOn(category.key);
	const groupByClassOn = isGroupByClassOn(category.key);
```

Add an `addInitialClassKey` state alongside the existing `addInitialName`/`addInitialRecurring`:

```typescript
	const [addInitialClassKey, setAddInitialClassKey] = useState<
		string | undefined
	>(undefined);
```

Update the loading guard:

```typescript
	if (loading || classesLoading) return null;
```

Add the "Group by class" `Switch`, only shown outside Shopping Mode (since Shopping Mode already aggregates by class on its own), right after the existing Shopping Mode `Switch`:

```tsx
			{!shoppingModeOn && (
				<Switch
					checked={groupByClassOn}
					onChange={(checked) => setGroupByClassOn(category.key, checked)}
					checkedChildren={t("items.groupByClass")}
					unCheckedChildren={t("items.groupByClass")}
					style={{ marginBottom: 12 }}
				/>
			)}
```

Update `ShoppingList`'s `onAddItem` call to match its new signature:

```tsx
				<ShoppingList
					uid={uid}
					category={category}
					pantryItems={items}
					threshold={lowStockThreshold}
					onAddItem={(entry) => {
						setAddInitialName(entry.name);
						setAddInitialClassKey(entry.classKey);
						setAddInitialRecurring(true);
						setAddOpen(true);
					}}
				/>
```

Update the non-shopping-mode rendering branch to use `ClassGroupedItemList` when the toggle is on:

```tsx
				) : sorted.length === 0 ? (
					<Empty description={t("items.empty")} />
				) : groupByClassOn ? (
					<ClassGroupedItemList
						items={sorted}
						classes={classes}
						onItemClick={setEditingItem}
					/>
				) : (
					<Listy
						items={sorted}
						rowKey="id"
						styles={{
							item: {
								padding: "12px 0",
								borderBottom: `1px solid ${token.colorSplit}`,
							},
						}}
						itemRender={(item) => (
							<ItemListItem item={item} onClick={() => setEditingItem(item)} />
						)}
					/>
				)}
```

Update the `onClose` of the Add Item modal to also clear `addInitialClassKey`, and pass `classes`/`initialClassKey` to `AddItemModal` and `classes` to `EditItemModal`:

```tsx
				<AddItemModal
					uid={uid}
					category={category}
					open={addOpen}
					onClose={() => {
						setAddOpen(false);
						setAddInitialName(undefined);
						setAddInitialClassKey(undefined);
						setAddInitialRecurring(false);
					}}
					initialName={addInitialName}
					initialRecurring={addInitialRecurring}
					classes={classes}
					initialClassKey={addInitialClassKey}
				/>
				{editingItem && (
					<EditItemModal
						uid={uid}
						item={editingItem}
						categories={categories}
						classes={classes}
						onClose={() => setEditingItem(null)}
					/>
				)}
```

Add to `src/locales/en-us.json`:

```json
	"groupByClass": "Group by class",
```

Add to `src/locales/pt-br.json`:

```json
	"groupByClass": "Agrupar por classe",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/ItemList.test.tsx"`
Expected: PASS

- [ ] **Step 5: Run the full verification suite**

Run: `npm run lint`
Expected: no errors (catches any remaining prop-type mismatches across the files touched this plan, plus hook-order issues `tsc` alone would miss)

Run: `npm test`
Expected: the full emulator-backed suite passes, including every test file touched across all 15 tasks

- [ ] **Step 6: Commit**

```bash
git add src/features/pantry-items/ItemList.tsx src/features/pantry-items/ItemList.test.tsx src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: wire class-grouped view and class-aware shopping prefill into ItemList"
```
