import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
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
		expect(result.current.shoppingList).toEqual([
			{ name: "Milk", quantity: 2 },
		]);
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
		const { result } = renderHook(() => useShoppingList(uid, "foods", [], 3));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("includes a recurring item with zero current pantry quantity", async () => {
		await seedHistory("Eggs", true);
		const { result } = renderHook(() => useShoppingList(uid, "foods", [], 3));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ name: "Eggs", quantity: 0 },
		]);
	});

	// Regression test for I3: item_history is legacy v1 data this codebase has
	// never validated before Phase 2, so a real malformed doc is possible.
	// Before this fix, `snapshot.docs.map((d) => parseItemHistoryDoc(...))`
	// would throw inside the onSnapshot success callback (dispatched via a
	// bare setTimeout with no try/catch, bypassing the error callback) and
	// wedge `loading` at `true` forever for the whole listener — not just
	// break the one bad entry. It must instead skip the malformed doc and
	// still resolve the well-formed ones.
	it("skips a malformed item_history doc instead of breaking the whole listener", async () => {
		await seedHistory("Milk", true);
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Bad")),
			// recurring must stay `true` (boolean) to match the listener's own
			// `where("recurring", "==", true)` query — malformed here means it
			// fails parseItemHistoryDoc's other fields, specifically `duration`
			// (which the schema requires to be a string, not a number).
			{ name: "Bad", category: "foods", duration: 7, recurring: true },
		);

		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Milk", 1)], 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ name: "Milk", quantity: 1 },
		]);
	});

	it("aggregates quantity across multiple item docs with the same name", async () => {
		await seedHistory("Milk", true);
		const items = [
			makeItem("Milk", 1),
			{ ...makeItem("Milk", 1), id: "milk-2", opened: true },
		];
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", items, 3),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{ name: "Milk", quantity: 2 },
		]);
	});
});
