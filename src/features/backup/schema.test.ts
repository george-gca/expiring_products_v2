import { describe, expect, it } from "vitest";
import { parseBackup, safeParseBackup } from "./schema";

const validBackup = {
	version: 1,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 3,
		language: "pt-br" as const,
		hideDistantThresholdMonths: 3,
		notificationsEnabled: false,
		notifyDaysBeforeExpiry: 3,
		notifyHourLocal: 8,
		notifyTimezone: "America/Sao_Paulo",
	},
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [
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
	],
	itemHistory: [
		{ name: "Milk", category: "foods", duration: "7", recurring: true },
	],
};

describe("parseBackup", () => {
	it("parses a well-formed backup", () => {
		expect(parseBackup(validBackup)).toEqual(validBackup);
	});

	it("rejects an unsupported version", () => {
		expect(() => parseBackup({ ...validBackup, version: 2 })).toThrow();
	});

	it("rejects a malformed item entry", () => {
		expect(() =>
			parseBackup({
				...validBackup,
				items: [{ ...validBackup.items[0], quantity: -1 }],
			}),
		).toThrow();
	});

	it("rejects a non-integer settings threshold", () => {
		expect(() =>
			parseBackup({
				...validBackup,
				settings: { lowStockThreshold: 2.5 },
			}),
		).toThrow();
	});
});

describe("safeParseBackup", () => {
	it("returns null instead of throwing for invalid input", () => {
		expect(safeParseBackup({ not: "a backup" })).toBeNull();
	});

	it("returns the parsed backup for valid input", () => {
		expect(safeParseBackup(validBackup)).toEqual(validBackup);
	});
});
