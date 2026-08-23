import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import {
	addItem,
	setItemRecurring,
	updateItemQuantities,
} from "./firestoreWrites";
import { toItemDoc } from "./schema";

const uid = "test-user-3";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("addItem", () => {
	it("writes the item and upserts item_history with the same name/category/duration", async () => {
		await addItem(uid, {
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiringDate: new Date("2026-09-01"),
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		});

		const itemsSnapshot = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnapshot.size).toBe(1);
		expect(itemsSnapshot.docs[0].data().name).toBe("Whole Milk");

		const historyDoc = await getDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("foods_Whole Milk"),
			),
		);
		expect(historyDoc.exists()).toBe(true);
		expect(historyDoc.data()?.duration).toBe("7");
		expect(historyDoc.data()?.recurring).toBe(true);
	});

	// Regression test for C1: the shopping list's cart-icon flow pre-fills
	// Add Item with the clicked entry's name but leaves the recurring switch
	// at its default false. Before this fix, addItem's item_history write was
	// a full non-merge setDoc that always included `recurring: item.recurring`
	// — so re-buying a recurring item via that flow silently un-marked it as
	// recurring, and it could vanish from the shopping list on the very next
	// render. addItem must never clobber an existing `recurring: true` down to
	// `false`; only setItemRecurring (the Edit modal's deliberate action) may
	// do that.
	it("does not clobber an existing item_history.recurring=true when re-added with recurring=false", async () => {
		const historyId = encodeURIComponent("foods_Oat Milk");
		await setDoc(doc(db, "users", uid, "item_history", historyId), {
			name: "Oat Milk",
			category: "foods",
			duration: "",
			recurring: true,
		});

		await addItem(uid, {
			name: "Oat Milk",
			category: "foods",
			quantity: 3,
			expiringDate: new Date("2026-09-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false, // e.g. AddItemModal's default, unset by the cart-icon flow
			barcode: null,
			source: "manual",
		});

		const historyDoc = await getDoc(
			doc(db, "users", uid, "item_history", historyId),
		);
		expect(historyDoc.data()?.recurring).toBe(true);
	});

	it("sanitizes item names containing a slash into a valid history doc id", async () => {
		await addItem(uid, {
			name: "Milk 1/2 gal",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2026-09-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});

		const historyDoc = await getDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("foods_Milk 1/2 gal"),
			),
		);
		expect(historyDoc.exists()).toBe(true);
		expect(historyDoc.data()?.name).toBe("Milk 1/2 gal");
	});
});

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

describe("updateItemQuantities waste_events", () => {
	async function seedItem(overrides: {
		quantity: number;
		expiringDate: Date;
		opened: boolean;
	}) {
		const itemRef = doc(collection(db, "users", uid, "items"));
		await setDoc(
			itemRef,
			toItemDoc({
				name: "Test Item",
				category: "foods",
				quantity: overrides.quantity,
				expiringDate: overrides.expiringDate,
				duration: null,
				dateOpened: null,
				opened: overrides.opened,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);
		return itemRef.id;
	}

	it("writes a waste_events doc with was_expired: false for a consumed, non-expired item", async () => {
		const itemId = await seedItem({
			quantity: 2,
			expiringDate: new Date("2099-01-01"),
			opened: false,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 0,
			consumed: 1,
			discarded: 0,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(1);
		const event = eventsSnapshot.docs[0].data();
		expect(event.category).toBe("foods");
		expect(event.was_opened).toBe(false);
		expect(event.was_expired).toBe(false);
		expect(event.consumed).toBe(1);
		expect(event.discarded).toBe(0);
	});

	it("writes was_opened: true and was_expired: true when discarding an overdue, previously opened item", async () => {
		const itemId = await seedItem({
			quantity: 1,
			expiringDate: new Date("2020-01-01"),
			opened: true,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 0,
			consumed: 0,
			discarded: 1,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(1);
		const event = eventsSnapshot.docs[0].data();
		expect(event.was_opened).toBe(true);
		expect(event.was_expired).toBe(true);
		expect(event.discarded).toBe(1);
	});

	it("writes no waste_events doc for a pure opened action", async () => {
		const itemId = await seedItem({
			quantity: 3,
			expiringDate: new Date("2099-01-01"),
			opened: false,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 1,
			consumed: 0,
			discarded: 0,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(0);
	});
});
