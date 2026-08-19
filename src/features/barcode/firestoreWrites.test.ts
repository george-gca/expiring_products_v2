import { doc, getDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { upsertBarcodeProduct } from "./firestoreWrites";

const uid = "test-user-barcode-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("upsertBarcodeProduct", () => {
	it("writes a new barcode_products doc", async () => {
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
		});
		const snapshot = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(snapshot.exists()).toBe(true);
		expect(snapshot.data()?.name).toBe("Whole Milk");
		expect(snapshot.data()?.source).toBe("openfoodfacts");
	});

	it("overwrites an existing doc (full replace, not merge)", async () => {
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "openfoodfacts",
		});
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk (2%)",
			category: "foods",
			suggestedDuration: 10,
			source: "manual",
		});
		const snapshot = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(snapshot.data()?.name).toBe("Whole Milk (2%)");
		expect(snapshot.data()?.suggestedDuration).toBe(10);
		expect(snapshot.data()?.source).toBe("manual");
	});
});
