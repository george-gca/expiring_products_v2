import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseBarcodeProductDoc, toBarcodeProductDoc } from "./schema";

describe("parseBarcodeProductDoc", () => {
	it("parses a valid barcode_products document", () => {
		const now = Timestamp.now();
		const result = parseBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
			updatedAt: now,
		});
		expect(result).toEqual({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
			updatedAt: now.toDate(),
		});
	});

	it("parses a document with a null suggestedDuration", () => {
		const now = Timestamp.now();
		const result = parseBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "manual",
			updatedAt: now,
		});
		expect(result.suggestedDuration).toBeNull();
	});

	it("rejects a document missing required fields", () => {
		expect(() => parseBarcodeProductDoc({ name: "Milk" })).toThrow();
	});
});

describe("toBarcodeProductDoc", () => {
	it("produces a Firestore-shaped payload with a fresh updatedAt Timestamp", () => {
		const result = toBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "manual",
		});
		expect(result.name).toBe("Whole Milk");
		expect(result.category).toBe("foods");
		expect(result.suggestedDuration).toBeNull();
		expect(result.source).toBe("manual");
		expect(result.updatedAt).toBeInstanceOf(Timestamp);
	});
});
