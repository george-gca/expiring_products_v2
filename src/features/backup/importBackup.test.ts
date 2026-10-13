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
import { buildBackup } from "./exportBackup";
import { importBackup } from "./importBackup";
import { type Backup, parseBackup } from "./schema";

const uid = "test-user-backup-import-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

const backup: Backup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 5,
		language: "en-us",
		hideDistantThresholdMonths: 3,
		hideDistantEnabled: true,
		notificationsEnabled: true,
		notifyDaysBeforeExpiry: 5,
		notifyHourLocal: 20,
		notifyTimezone: "America/New_York",
	},
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
	classes: [],
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
		expect(settingsSnap.data()).toEqual({
			lowStockThreshold: 5,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			hideDistantEnabled: true,
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 5,
			notifyHourLocal: 20,
			notifyTimezone: "America/New_York",
		});

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

	it("imports an item with a null expiringDate as an item with no expiration", async () => {
		await importBackup(uid, {
			...backup,
			items: [{ ...backup.items[0], expiringDate: null }],
		});

		const itemsSnap = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnap.docs[0].data().expiring_date).toBeNull();
	});

	it("round-trips classes and class assignments through export and import", async () => {
		await setDoc(doc(db, "users", uid, "classes", "soap-key"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: true,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
			class_key: "soap-key",
		});
		const historyId = encodeURIComponent("cleaning_Dove Soap");
		await setDoc(doc(db, "users", uid, "item_history", historyId), {
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
			class_key: "soap-key",
		});

		// Through JSON + parseBackup, exactly like a real file round trip.
		const exported = parseBackup(
			JSON.parse(JSON.stringify(await buildBackup(uid))),
		);
		await importBackup(uid, exported);

		const classesSnap = await getDocs(collection(db, "users", uid, "classes"));
		expect(classesSnap.docs.map((d) => d.id)).toEqual(["soap-key"]);
		expect(classesSnap.docs[0].data()).toEqual({
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: true,
		});

		const itemsSnap = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnap.size).toBe(1);
		expect(itemsSnap.docs[0].data().class_key).toBe("soap-key");

		const historySnap = await getDoc(
			doc(db, "users", uid, "item_history", historyId),
		);
		expect(historySnap.data()).toEqual({
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
			class_key: "soap-key",
		});
	});

	it("replaces existing classes with the backup's (none, for a pre-classes file)", async () => {
		await setDoc(doc(db, "users", uid, "classes", "stale-key"), {
			key: "stale-key",
			category: "foods",
			name: "Stale",
			archived: false,
		});

		const { classes: _classes, ...oldFile } = backup;
		await importBackup(uid, parseBackup(JSON.parse(JSON.stringify(oldFile))));

		const classesSnap = await getDocs(collection(db, "users", uid, "classes"));
		expect(classesSnap.size).toBe(0);

		const itemsSnap = await getDocs(collection(db, "users", uid, "items"));
		expect(itemsSnap.docs[0].data().class_key).toBeNull();

		const historySnap = await getDocs(
			collection(db, "users", uid, "item_history"),
		);
		expect(historySnap.docs[0].data()).not.toHaveProperty("class_key");
	});
});
