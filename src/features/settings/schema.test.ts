import { describe, expect, it } from "vitest";
import { parseSettingsDoc } from "./schema";

// parseSettingsDoc must never throw: Firestore's onSnapshot dispatches its
// success callback via a bare setTimeout with no try/catch, so a throw here
// (from a malformed document already in Firestore, or a future writer that
// skips validation) bypasses the error callback and wedges useSettings's
// `loading` state at `true` forever, which in turn makes AppRoute's
// `if (settingsLoading) return null` gate render nothing, permanently, for
// that user. Out-of-range/malformed input falls back to the default
// threshold (3) instead — see schema.ts's `.catch()` on lowStockThreshold.
describe("parseSettingsDoc", () => {
	it("parses a valid settings document", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 3 })).toEqual({
			lowStockThreshold: 3,
		});
	});

	it("parses a valid non-default threshold", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 7 })).toEqual({
			lowStockThreshold: 7,
		});
	});

	it("falls back to the default threshold on a missing lowStockThreshold field", () => {
		expect(parseSettingsDoc({})).toEqual({ lowStockThreshold: 3 });
	});

	it("falls back to the default threshold on a non-positive lowStockThreshold", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 0 })).toEqual({
			lowStockThreshold: 3,
		});
	});

	it("falls back to the default threshold on a non-integer lowStockThreshold", () => {
		expect(parseSettingsDoc({ lowStockThreshold: 2.5 })).toEqual({
			lowStockThreshold: 3,
		});
	});

	it("falls back to the default threshold on a non-numeric lowStockThreshold", () => {
		expect(parseSettingsDoc({ lowStockThreshold: "not a number" })).toEqual({
			lowStockThreshold: 3,
		});
	});
});
