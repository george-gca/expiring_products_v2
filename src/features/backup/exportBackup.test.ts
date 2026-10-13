import { addDoc, collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { buildBackup } from "./exportBackup";

const uid = "test-user-backup-export-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("buildBackup", () => {
	it("assembles settings, categories, items, and item_history into a versioned backup", async () => {
		await setDoc(doc(db, "users", uid), {
			lowStockThreshold: 5,
			language: "en-us",
			hideDistantThresholdMonths: 6,
		});
		await setDoc(doc(db, "users", uid, "categories", "foods"), {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Milk",
			category: "foods",
			quantity: 2,
			expiring_date: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		});
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Milk")),
			{ name: "Milk", category: "foods", duration: "7", recurring: true },
		);

		const backup = await buildBackup(uid);

		expect(backup.version).toBe(1);
		expect(backup.settings).toEqual({
			lowStockThreshold: 5,
			language: "en-us",
			hideDistantThresholdMonths: 6,
			hideDistantEnabled: true,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
		expect(backup.categories).toEqual([
			{ key: "foods", name: "Foods", emoji: "🍎", order: 0 },
		]);
		expect(backup.items).toEqual([
			{
				name: "Milk",
				category: "foods",
				quantity: 2,
				expiringDate: "2026-09-01T00:00:00.000Z",
				duration: 7,
				dateOpened: null,
				opened: false,
				recurring: true,
				barcode: null,
				source: "manual",
				classKey: null,
			},
		]);
		expect(backup.itemHistory).toEqual([
			{
				name: "Milk",
				category: "foods",
				duration: "7",
				recurring: true,
				classKey: null,
			},
		]);
		expect(backup.classes).toEqual([]);
	});

	it("exports the classes collection and each item's and history entry's classKey", async () => {
		await setDoc(doc(db, "users", uid, "classes", "soap-key"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
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
		await setDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("cleaning_Dove Soap"),
			),
			{
				name: "Dove Soap",
				category: "cleaning",
				duration: "",
				recurring: true,
				class_key: "soap-key",
			},
		);

		const backup = await buildBackup(uid);

		expect(backup.classes).toEqual([
			{ key: "soap-key", category: "cleaning", name: "Soap", archived: false },
		]);
		expect(backup.items[0].classKey).toBe("soap-key");
		expect(backup.itemHistory[0].classKey).toBe("soap-key");
	});

	it("exports a null expiringDate for an item with no expiration date", async () => {
		await addDoc(collection(db, "users", uid, "items"), {
			name: "Trash Bags",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});

		const backup = await buildBackup(uid);

		expect(backup.items[0].expiringDate).toBeNull();
	});

	it("defaults settings to the standard threshold when no settings doc exists yet", async () => {
		const backup = await buildBackup(uid);
		expect(backup.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			hideDistantEnabled: true,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("skips a malformed item_history doc rather than throwing", async () => {
		await setDoc(
			doc(db, "users", uid, "item_history", "broken"),
			{ name: "Broken" }, // missing category/duration/recurring
		);
		const backup = await buildBackup(uid);
		expect(backup.itemHistory).toEqual([]);
	});
});
