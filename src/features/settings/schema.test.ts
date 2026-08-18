import { describe, expect, it } from "vitest";
import { parseSettingsDoc } from "./schema";

describe("parseSettingsDoc", () => {
	it("parses a valid settings document", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 3 })).toEqual({
			lowStockThreshold: 3,
		});
	});

	it("throws on a missing lowStockThreshold field", () => {
		expect(() => parseSettingsDoc({})).toThrow();
	});

	it("throws on a non-positive lowStockThreshold", () => {
		expect(() => parseSettingsDoc({ lowStockThreshold: 0 })).toThrow();
	});
});
