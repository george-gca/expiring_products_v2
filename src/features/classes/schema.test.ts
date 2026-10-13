import { describe, expect, it } from "vitest";
import { parseClassDoc, toClassDoc } from "./schema";

describe("parseClassDoc", () => {
	it("parses a valid class document", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		expect(result).toEqual({
			id: "class1",
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});

	it("throws on a document missing required fields", () => {
		expect(() => parseClassDoc("class1", { key: "soap-key" })).toThrow();
	});

	it("defaults archived to false when the field is absent", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
		});
		expect(result.archived).toBe(false);
	});

	it("defaults archived to false when the field is present but invalid", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: "not-a-boolean",
		});
		expect(result.archived).toBe(false);
	});

	it("keeps archived true when the document has it set", () => {
		const result = parseClassDoc("class1", {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: true,
		});
		expect(result.archived).toBe(true);
	});
});

describe("toClassDoc", () => {
	it("returns a plain object with all four fields, dropping id", () => {
		const result = toClassDoc({
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		expect(result).toEqual({
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});
});
