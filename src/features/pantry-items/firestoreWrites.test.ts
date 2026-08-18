import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { addItem } from "./firestoreWrites";

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
