import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
	parseItemDoc,
	parseItemHistoryDoc,
	parseWasteEventDoc,
	safeParseItemDoc,
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
			wasOpened: true,
			wasExpired: false,
			consumed: 2,
			discarded: 0,
			occurredAt: occurredAt.toDate(),
		});
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
