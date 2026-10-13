import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { ItemClass } from "../classes/schema";
import type { PantryItem } from "./schema";
import { useShoppingList } from "./useShoppingList";

const uid = "test-user-shopping-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

// Class membership is a property of the item NAME, recorded durably on its
// item_history doc (it must survive the name's item docs being consumed).
async function seedHistory(
	name: string,
	recurring: boolean,
	classKey: string | null = null,
) {
	const historyId = encodeURIComponent(`foods_${name}`);
	await setDoc(doc(db, "users", uid, "item_history", historyId), {
		name,
		category: "foods",
		duration: "",
		recurring,
		class_key: classKey,
	});
}

// `classKey` is the per-purchase tag; most tests leave it null so grouping
// is proven to come from item_history alone.
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
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Lux Soap", true, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		const items = [makeItem("Dove Soap", 1), makeItem("Lux Soap", 1)];
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
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Lux Soap", false, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		// Lux's history doc is non-recurring, so it is outside the hook's
		// recurring-only query; its live item's own class tag (which addItem
		// writes alongside history) is what counts its stock toward Soap.
		const items = [
			makeItem("Dove Soap", 1),
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

	// Review Focus: a name's classKey pointing to a class not present in the
	// live `classes` list (archived, deleted, or belonging to another
	// category) must fall back to per-name aggregation, not vanish.
	it("falls back to per-name aggregation when an item's class is archived/missing from the live list", async () => {
		await seedHistory("Dove Soap", true, "stale-soap-key");
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
		await seedHistory("Dove Soap", true, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		const items = [makeItem("Dove Soap", 1)];
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

	// Regression tests for the final review's Critical finding: fully
	// consuming a brand deletes its item docs, so class membership must come
	// from item_history, not from live items.
	it("still groups a brand under its class after that brand's own stock reaches zero", async () => {
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Lux Soap", true, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		// Dove fully consumed (no pantry doc left for it), Lux has 2 in stock.
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Lux Soap", 2)], 3, [soapClass]),
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

	it("does not list a fully consumed brand on its own while its class is above threshold", async () => {
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Lux Soap", true, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Lux Soap", 5)], 3, [soapClass]),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([]);
	});

	it("produces one class entry (not per-name entries) when every member brand is fully consumed", async () => {
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Lux Soap", true, "soap-key");
		const soapClass = makeClass("soap-key", "Soap");
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [], 3, [soapClass]),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.shoppingList).toEqual([
			{
				key: "soap-key",
				label: "Soap",
				quantity: 0,
				name: null,
				classKey: "soap-key",
			},
		]);
	});

	it("merges a mixed list of classed and unclassed recurring names correctly", async () => {
		await seedHistory("Dove Soap", true, "soap-key");
		await seedHistory("Milk", true, null);
		const soapClass = makeClass("soap-key", "Soap");
		const { result } = renderHook(() =>
			useShoppingList(
				uid,
				"foods",
				[makeItem("Dove Soap", 1), makeItem("Milk", 2)],
				3,
				[soapClass],
			),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(
			[...result.current.shoppingList].sort((a, b) =>
				a.label.localeCompare(b.label),
			),
		).toEqual([
			{ key: "Milk", label: "Milk", quantity: 2, name: "Milk", classKey: null },
			{
				key: "soap-key",
				label: "Soap",
				quantity: 1,
				name: null,
				classKey: "soap-key",
			},
		]);
	});

	it("still groups a name by its live items' class tag when its item_history predates class_key", async () => {
		await seedHistory("Dove Soap", true);
		const soapClass = makeClass("soap-key", "Soap");
		const { result } = renderHook(() =>
			useShoppingList(uid, "foods", [makeItem("Dove Soap", 1, "soap-key")], 3, [
				soapClass,
			]),
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
