import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { toItemDoc } from "./schema";
import { useAllPantryItems } from "./useAllPantryItems";

const uid = "test-user-all-pantry-items-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useAllPantryItems", () => {
	it("returns items across every category, not just one", async () => {
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Milk",
				category: "foods",
				quantity: 1,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Aspirin",
				category: "medicines",
				quantity: 1,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);

		const { result } = renderHook(() => useAllPantryItems(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		const categories = result.current.items.map((item) => item.category).sort();
		expect(categories).toEqual(["foods", "medicines"]);
	});
});
