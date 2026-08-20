import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { deleteFcmToken, upsertFcmToken } from "./firestoreWrites";

const uid = "test-user-fcm-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("upsertFcmToken", () => {
	it("writes a new fcm_tokens doc", async () => {
		await upsertFcmToken(uid, "device-1", "token-abc");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.exists()).toBe(true);
		expect(snapshot.data()?.token).toBe("token-abc");
	});

	it("overwrites an existing doc for the same device", async () => {
		await upsertFcmToken(uid, "device-1", "token-old");
		await upsertFcmToken(uid, "device-1", "token-new");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.data()?.token).toBe("token-new");
	});
});

describe("deleteFcmToken", () => {
	it("removes the device's fcm_tokens doc", async () => {
		await setDoc(doc(db, "users", uid, "fcm_tokens", "device-1"), {
			token: "token-abc",
			updatedAt: new Date(),
		});
		await deleteFcmToken(uid, "device-1");
		const snapshot = await getDoc(
			doc(db, "users", uid, "fcm_tokens", "device-1"),
		);
		expect(snapshot.exists()).toBe(false);
	});
});
