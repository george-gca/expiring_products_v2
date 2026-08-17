import { describe, expect, it } from "vitest";
import { parseCategoryDoc } from "./schema";

describe("parseCategoryDoc", () => {
	it("parses a valid category document", () => {
		const result = parseCategoryDoc("cat1", {
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
		expect(result).toEqual({
			id: "cat1",
			key: "foods",
			name: "Foods",
			emoji: "🍎",
			order: 0,
		});
	});

	it("throws on a document missing required fields", () => {
		expect(() => parseCategoryDoc("cat1", { key: "foods" })).toThrow();
	});
});
