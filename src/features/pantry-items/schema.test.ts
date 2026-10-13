import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
	parseItemDoc,
	parseItemHistoryDoc,
	parseWasteEventDoc,
	safeParseItemDoc,
	safeParseItemHistoryDoc,
	safeParseWasteEventDoc,
	toItemDoc,
} from "./schema";

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

	it("parses a null expiring_date as an item with no expiration", () => {
		const result = parseItemDoc("item1", {
			name: "Trash Bags",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result.expiringDate).toBeNull();
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

describe("safeParseItemDoc", () => {
	it("returns the parsed item for a valid document", () => {
		const result = safeParseItemDoc("item1", {
			name: "Whole Milk",
			category: "foods",
			quantity: 2,
			expiring_date: Timestamp.fromDate(new Date("2026-09-01T23:59:59Z")),
			duration: 7,
			date_opened: null,
			opened: false,
			recurring: true,
		});
		expect(result).not.toBeNull();
		expect(result?.name).toBe("Whole Milk");
	});

	it("returns null instead of throwing for a malformed document", () => {
		const result = safeParseItemDoc("item1", {
			name: "Legacy Item",
			category: "foods",
			quantity: "2",
			expiring_date: "2026-09-01",
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result).toBeNull();
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

	it("writes a null expiring_date for an item with no expiration", () => {
		const doc = toItemDoc({
			name: "Trash Bags",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		expect(doc.expiring_date).toBeNull();
	});
});

describe("parseItemDoc class_key", () => {
	it("defaults classKey to null when the field is absent", () => {
		const result = parseItemDoc("item1", {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
		});
		expect(result.classKey).toBeNull();
	});

	it("round-trips a provided class_key", () => {
		const result = parseItemDoc("item1", {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			class_key: "soap-key",
		});
		expect(result.classKey).toBe("soap-key");
	});
});

describe("toItemDoc class_key", () => {
	it("writes class_key: null when classKey is omitted", () => {
		const result = toItemDoc({
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		expect(result.class_key).toBeNull();
	});

	it("writes the provided classKey", () => {
		const result = toItemDoc({
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiringDate: null,
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			classKey: "soap-key",
		});
		expect(result.class_key).toBe("soap-key");
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
			classKey: null,
		});
	});

	it("defaults classKey to null when class_key is absent", () => {
		const result = parseItemHistoryDoc({
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
		});
		expect(result.classKey).toBeNull();
	});

	it("round-trips a provided class_key as classKey, without leaking the snake_case field", () => {
		const result = parseItemHistoryDoc({
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
			class_key: "soap-key",
		});
		expect(result).toEqual({
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
			classKey: "soap-key",
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

describe("safeParseItemHistoryDoc", () => {
	it("returns classKey from class_key, defaulting to null", () => {
		expect(
			safeParseItemHistoryDoc({
				name: "Milk",
				category: "foods",
				duration: "",
				recurring: true,
			}),
		).toEqual({
			name: "Milk",
			category: "foods",
			duration: "",
			recurring: true,
			classKey: null,
		});
		expect(
			safeParseItemHistoryDoc({
				name: "Dove Soap",
				category: "cleaning",
				duration: "",
				recurring: true,
				class_key: "soap-key",
			}),
		).toEqual({
			name: "Dove Soap",
			category: "cleaning",
			duration: "",
			recurring: true,
			classKey: "soap-key",
		});
	});

	it("returns null for a malformed doc", () => {
		expect(safeParseItemHistoryDoc({ name: "X" })).toBeNull();
	});
});

describe("parseWasteEventDoc", () => {
	it("parses a valid waste_event document, converting the Timestamp to a Date", () => {
		const occurredAt = Timestamp.fromDate(new Date("2026-08-23T12:00:00Z"));
		const result = parseWasteEventDoc("event1", {
			category: "foods",
			was_opened: true,
			was_expired: false,
			consumed: 2,
			discarded: 0,
			occurred_at: occurredAt,
		});
		expect(result).toEqual({
			id: "event1",
			category: "foods",
			name: null,
			wasOpened: true,
			wasExpired: false,
			consumed: 2,
			discarded: 0,
			occurredAt: occurredAt.toDate(),
			openedAt: null,
		});
	});

	it("parses name and opened_at when present", () => {
		const occurredAt = Timestamp.fromDate(new Date("2026-08-23T12:00:00Z"));
		const openedAt = Timestamp.fromDate(new Date("2026-08-10T09:00:00Z"));
		const result = parseWasteEventDoc("event1", {
			category: "cleaning",
			name: "Detergent",
			was_opened: true,
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: occurredAt,
			opened_at: openedAt,
		});
		expect(result.name).toBe("Detergent");
		expect(result.openedAt).toEqual(openedAt.toDate());
	});
});

describe("safeParseWasteEventDoc", () => {
	it("returns the parsed event for a valid document", () => {
		const result = safeParseWasteEventDoc("event1", {
			category: "medicines",
			was_opened: false,
			was_expired: true,
			consumed: 0,
			discarded: 1,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});
		expect(result).not.toBeNull();
		expect(result?.category).toBe("medicines");
	});

	it("returns null instead of throwing for a malformed document", () => {
		const result = safeParseWasteEventDoc("event1", {
			category: "foods",
			was_opened: "yes",
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: "2026-08-23",
		});
		expect(result).toBeNull();
	});
});
