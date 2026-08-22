import { doc, getDoc, setDoc } from "firebase/firestore";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { lookupBarcode } from "./lookupBarcode";

const uid = "test-user-barcode-lookup-1";

const server = setupServer();
// "bypass" (not "error"): this suite also makes real network calls to the
// Firestore emulator (both from the SDK itself and from clearFirestoreEmulator's
// afterEach cleanup) — MSW's node interceptor patches fetch process-wide, so
// "error" would reject those unmocked emulator requests too, not just an
// actually-forgotten Open Food Facts mock.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);
afterAll(() => server.close());

describe("lookupBarcode", () => {
	it("returns a cached result without calling Open Food Facts", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/:barcode.json",
				() => {
					throw new Error("should not have called Open Food Facts");
				},
			),
		);
		await setDoc(doc(db, "users", uid, "barcode_products", "0123456789012"), {
			name: "Cached Milk",
			category: "foods",
			suggestedDuration: 5,
			source: "manual",
			updatedAt: new Date(),
		});

		const result = await lookupBarcode(uid, "0123456789012", "foods");
		expect(result).toEqual({ name: "Cached Milk", suggestedDuration: 5 });
	});

	it("falls back to Open Food Facts on a cache miss and writes the cache", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0123456789012.json",
				() => HttpResponse.json({ product: { product_name: "Whole Milk" } }),
			),
		);

		const result = await lookupBarcode(uid, "0123456789012", "foods");
		expect(result).toEqual({ name: "Whole Milk", suggestedDuration: null });

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(cached.data()?.name).toBe("Whole Milk");
		expect(cached.data()?.category).toBe("foods");
		expect(cached.data()?.source).toBe("openfoodfacts");
	});

	it("returns null and writes nothing when Open Food Facts has no match", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0000000000000.json",
				() => HttpResponse.json({ status: 0 }, { status: 404 }),
			),
		);

		const result = await lookupBarcode(uid, "0000000000000", "foods");
		expect(result).toBeNull();

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0000000000000"),
		);
		expect(cached.exists()).toBe(false);
	});

	it("returns null when the Open Food Facts request fails outright", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0000000000001.json",
				() => HttpResponse.error(),
			),
		);

		const result = await lookupBarcode(uid, "0000000000001", "foods");
		expect(result).toBeNull();
	});

	it("falls back to Open Products Facts on an Open Food Facts miss, and writes the cache", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0123456789013.json",
				() => HttpResponse.json({ status: 0 }, { status: 404 }),
			),
			http.get(
				"https://world.openproductsfacts.org/api/v2/product/0123456789013.json",
				() => HttpResponse.json({ product: { product_name: "Hand Soap" } }),
			),
		);

		const result = await lookupBarcode(uid, "0123456789013", "medicines");
		expect(result).toEqual({ name: "Hand Soap", suggestedDuration: null });

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789013"),
		);
		expect(cached.data()?.name).toBe("Hand Soap");
		expect(cached.data()?.source).toBe("openproductsfacts");
	});

	it("falls back to Open Products Facts when the Open Food Facts request fails outright", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0123456789014.json",
				() => HttpResponse.error(),
			),
			http.get(
				"https://world.openproductsfacts.org/api/v2/product/0123456789014.json",
				() => HttpResponse.json({ product: { product_name: "Toothpaste" } }),
			),
		);

		const result = await lookupBarcode(uid, "0123456789014", "medicines");
		expect(result).toEqual({ name: "Toothpaste", suggestedDuration: null });
	});

	it("returns null and writes nothing when both sources miss", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0000000000002.json",
				() => HttpResponse.json({ status: 0 }, { status: 404 }),
			),
			http.get(
				"https://world.openproductsfacts.org/api/v2/product/0000000000002.json",
				() => HttpResponse.json({ status: 0 }, { status: 404 }),
			),
		);

		const result = await lookupBarcode(uid, "0000000000002", "medicines");
		expect(result).toBeNull();

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0000000000002"),
		);
		expect(cached.exists()).toBe(false);
	});
});
