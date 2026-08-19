import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	Timestamp,
} from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { importBackup } from "./importBackup";
import type { Backup } from "./schema";

const uid = "test-user-backup-import-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

const backup: Backup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: { lowStockThreshold: 5 },
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [
		{
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiringDate: "2026-09-01T00:00:00.000Z",
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		},
	],
	itemHistory: [
		{ name: "Whole Milk", category: "foods", duration: "7", recurring: true },
	],
};

describe("importBackup", () => {
	it("replaces existing categories/items/item_history/settings with the backup's contents", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await setDoc(doc(db, "users", uid, "categories", "medicines"), {
			key: "medicines",
			name: "Medicines",
			emoji: "💊",
			order: 0,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Stale",
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
		await setDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("medicines_Stale"),
			),
			{ name: "Stale", category: "medicines", duration: "", recurring: false },
		);

		await importBackup(uid, backup);

		const settingsSnap = await getDoc(doc(db, "users", uid));
		expect(settingsSnap.data()).toEqual({ lowStockThreshold: 5 });

		const categoriesSnap = await getDocs(
			collection(db, "users", uid, "categories"),
		);
		expect(categoriesSnap.docs.map((d) => d.id)).toEqual(["foods"]);
		expect(categoriesSnap.docs[0].data()).toEqual({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});

		const itemsSnap = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnap.size).toBe(1);
		expect(itemsSnap.docs[0].data().name).toBe("Whole Milk");

		const historySnap = await getDocs(
			collection(db, "users", uid, "item_history"),
		);
		expect(historySnap.docs.map((d) => d.id)).toEqual([
			encodeURIComponent("foods_Whole Milk"),
		]);
		expect(historySnap.docs[0].data()).toEqual({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
	});
});
