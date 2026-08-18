import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { updateLowStockThreshold } from "./firestoreWrites";

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
