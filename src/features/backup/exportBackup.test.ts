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
			},
		]);
		expect(backup.itemHistory).toEqual([
			{ name: "Milk", category: "foods", duration: "7", recurring: true },
		]);
	});

	it("defaults settings to the standard threshold when no settings doc exists yet", async () => {
		const backup = await buildBackup(uid);
		expect(backup.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
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
