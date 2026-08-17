import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useCategories } from "./useCategories";

const uid = "test-user-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useCategories", () => {
	it("creates default Foods and Medicines categories when none exist", async () => {
		const { result } = renderHook(() => useCategories(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		const keys = result.current.categories.map((c) => c.key).sort();
		expect(keys).toEqual(["foods", "medicines"]);
	});

	it("does not duplicate defaults when categories already exist", async () => {
		await addDoc(collection(db, "users", uid, "categories"), {
			key: "freezer",
			name: "Freezer",
			emoji: "🧊",
			order: 0,
		});
		const { result } = renderHook(() => useCategories(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.categories).toHaveLength(1);
		expect(result.current.categories[0].key).toBe("freezer");
	});
});
