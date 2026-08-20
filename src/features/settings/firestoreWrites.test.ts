import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import {
	updateHideDistantThresholdMonths,
	updateLanguage,
	updateLowStockThreshold,
	updateNotificationsEnabled,
	updateNotifyDaysBeforeExpiry,
	updateNotifyHourLocal,
} from "./firestoreWrites";

const uid = "test-user-settings-2";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("updateLowStockThreshold", () => {
	it("updates an existing settings doc's threshold", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateLowStockThreshold(uid, 5);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.lowStockThreshold).toBe(5);
	});
});

describe("updateLanguage", () => {
	it("updates an existing settings doc's language", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateLanguage(uid, "en-us");
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.language).toBe("en-us");
	});
});

describe("updateHideDistantThresholdMonths", () => {
	it("updates an existing settings doc's hideDistantThresholdMonths", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateHideDistantThresholdMonths(uid, 6);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.hideDistantThresholdMonths).toBe(6);
	});
});

describe("updateNotificationsEnabled", () => {
	it("updates an existing settings doc's notificationsEnabled", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotificationsEnabled(uid, true);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notificationsEnabled).toBe(true);
	});
});

describe("updateNotifyDaysBeforeExpiry", () => {
	it("updates an existing settings doc's notifyDaysBeforeExpiry", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotifyDaysBeforeExpiry(uid, 5);
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notifyDaysBeforeExpiry).toBe(5);
	});
});

describe("updateNotifyHourLocal", () => {
	it("updates an existing settings doc's notifyHourLocal and notifyTimezone together", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 3 });
		await updateNotifyHourLocal(uid, 20, "America/New_York");
		const snapshot = await getDoc(doc(db, "users", uid));
		expect(snapshot.data()?.notifyHourLocal).toBe(20);
		expect(snapshot.data()?.notifyTimezone).toBe("America/New_York");
	});
});
