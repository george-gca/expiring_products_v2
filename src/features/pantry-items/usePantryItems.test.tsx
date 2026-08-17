import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { usePantryItems } from "./usePantryItems";

const uid = "test-user-2";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("usePantryItems", () => {
	it("only returns items for the requested category", async () => {
		const itemsRef = collection(db, "users", uid, "items");
		await addDoc(itemsRef, {
			name: "Milk",
			category: "foods",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2026-09-01")),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		await addDoc(itemsRef, {
			name: "Aspirin",
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

		const { result } = renderHook(() => usePantryItems(uid, "foods"));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0].name).toBe("Milk");
	});
});
