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
