import { addDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { updateItemQuantities } from "./firestoreWrites";

const uid = "test-user-4";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("updateItemQuantities", () => {
	it("splits off an opened item with a duration-based expiry when quantity > 1 and duration is set", async () => {
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Milk",
			category: "foods",
			quantity: 3,
			expiring_date: Timestamp.fromDate(new Date("2026-12-01")),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});

		await updateItemQuantities(uid, original.id, {
			opened: 1,
			consumed: 0,
			discarded: 0,
		});

		const snapshot = await getDocs(itemsRef);
		expect(snapshot.size).toBe(2);
		const originalAfter = snapshot.docs.find((d) => d.id === original.id);
		const openedItem = snapshot.docs.find((d) => d.id !== original.id);
		expect(originalAfter?.data().quantity).toBe(2);
		expect(openedItem?.data().quantity).toBe(1);
		expect(openedItem?.data().opened).toBe(true);
	});

	it("removes the item when consumed quantity equals current quantity", async () => {
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
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

		await updateItemQuantities(uid, original.id, {
			opened: 0,
			consumed: 1,
			discarded: 0,
		});

		const snapshot = await getDocs(itemsRef);
		expect(snapshot.size).toBe(0);
	});

	it("keeps the original expiry date when opening an already-expired item, even with duration set", async () => {
		const itemsRef = collection(db, "users", uid, "items");
		const pastExpiringDate = new Date("2020-01-01");
		const original = await addDoc(itemsRef, {
			name: "Old Yogurt",
			category: "foods",
			quantity: 3,
			expiring_date: Timestamp.fromDate(pastExpiringDate),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});

		await updateItemQuantities(uid, original.id, {
			opened: 1,
			consumed: 0,
			discarded: 0,
		});

		const snapshot = await getDocs(itemsRef);
		expect(snapshot.size).toBe(2);
		const openedItem = snapshot.docs.find((d) => d.id !== original.id);
		if (!openedItem) throw new Error("opened item not found");
		const openedItemData = openedItem.data();
		expect(openedItemData.opened).toBe(true);
		expect((openedItemData.expiring_date as Timestamp).toDate()).toEqual(
			pastExpiringDate,
		);
	});
});
