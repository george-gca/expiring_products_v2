import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseItemDoc, parseItemHistoryDoc, toItemDoc } from "./schema";

describe("parseItemDoc", () => {
	it("parses a valid item document, converting Timestamps to Dates", () => {
		const expiringDate = Timestamp.fromDate(new Date("2026-09-01T23:59:59Z"));
		const lastNotifiedAt = Timestamp.fromDate(new Date("2026-08-20T08:00:00Z"));
		const result = parseItemDoc("item1", {
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiring_date: expiringDate,
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
			last_notified_at: lastNotifiedAt,
		});
		expect(result.expiringDate).toEqual(expiringDate.toDate());
		expect(result.name).toBe("Whole Milk");
		expect(result.source).toBe("manual");
		expect(result.lastNotifiedAt).toEqual(lastNotifiedAt.toDate());
	});

	it("defaults source to manual and barcode/lastNotifiedAt to null when absent", () => {
		const result = parseItemDoc("item1", {
			name: "Aspirin",
			category: "medicines",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result.source).toBe("manual");
		expect(result.barcode).toBeNull();
		expect(result.lastNotifiedAt).toBeNull();
	});
});

describe("toItemDoc", () => {
	it("converts a domain item back to Firestore field shape", () => {
		const doc = toItemDoc({
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiringDate: new Date("2026-09-01T23:59:59Z"),
			duration: 7,
			dateOpened: null,
			opened: false,
			recurring: true,
			barcode: null,
			source: "manual",
		});
		expect(doc.expiring_date).toBeInstanceOf(Timestamp);
		expect(doc.name).toBe("Whole Milk");
		expect(doc.last_notified_at).toBeNull();
	});
});

describe("parseItemHistoryDoc", () => {
	it("parses a valid item_history document", () => {
		const result = parseItemHistoryDoc({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
		expect(result).toEqual({
			name: "Whole Milk",
			category: "foods",
			duration: "7",
			recurring: true,
		});
	});

	it("parses a document with an empty duration string", () => {
		const result = parseItemHistoryDoc({
			name: "Aspirin",
			category: "medicines",
			duration: "",
			recurring: false,
		});
		expect(result.duration).toBe("");
	});

	it("throws on a missing recurring field", () => {
		expect(() =>
			parseItemHistoryDoc({ name: "X", category: "foods", duration: "" }),
		).toThrow();
	});
});
