import { describe, expect, it } from "vitest";
import { parseCategoryDoc, toCategoryDoc } from "./schema";

describe("parseCategoryDoc", () => {
	it("parses a valid category document", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		expect(result).toEqual({
			id: "cat1",
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
	});

	it("throws on a document missing required fields", () => {
		expect(() => parseCategoryDoc("cat1", { key: "foods" })).toThrow();
	});

	it("defaults archived to false when the field is absent (pre-existing docs)", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
		expect(result.archived).toBe(false);
	});

	it("defaults archived to false when the field is present but invalid", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: "not-a-boolean",
		});
		expect(result.archived).toBe(false);
	});

	it("keeps archived true when the document has it set", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: true,
		});
		expect(result.archived).toBe(true);
	});
});

describe("toCategoryDoc", () => {
	it("returns a plain object with all five fields, dropping id", () => {
		const result = toCategoryDoc({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		expect(result).toEqual({
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
	});
});
