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
