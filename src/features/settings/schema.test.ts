import { describe, expect, it } from "vitest";
import { parseSettingsDoc } from "./schema";

// parseSettingsDoc must never throw: Firestore's onSnapshot dispatches its
// success callback via a bare setTimeout with no try/catch, so a throw here
// (from a malformed document already in Firestore, or a future writer that
// skips validation) bypasses the error callback and wedges useSettings's
// `loading` state at `true` forever, which in turn makes AppRoute's
// `if (settingsLoading) return null` gate render nothing, permanently, for
// that user. Out-of-range/malformed input falls back to each field's
// default instead — see schema.ts's `.catch()` calls.
describe("parseSettingsDoc", () => {
	it("parses a fully valid settings document", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 7,
				language: "en-us",
				hideDistantThresholdMonths: 6,
				notificationsEnabled: true,
				notifyDaysBeforeExpiry: 5,
				notifyHourLocal: 20,
				notifyTimezone: "America/New_York",
			}),
		).toEqual({
			lowStockThreshold: 7,
			language: "en-us",
			hideDistantThresholdMonths: 6,
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 5,
			notifyHourLocal: 20,
			notifyTimezone: "America/New_York",
		});
	});

	it("falls back to all defaults on an empty document", () => {
		expect(parseSettingsDoc({})).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-positive lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 0,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-integer lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 2.5,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default threshold on a non-numeric lowStockThreshold", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: "not a number",
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to pt-br when language is missing or not a supported value", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, hideDistantThresholdMonths: 3 }),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});

		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "fr-fr",
				hideDistantThresholdMonths: 3,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to the default hideDistantThresholdMonths when missing or non-integer", () => {
		expect(
			parseSettingsDoc({ lowStockThreshold: 3, language: "en-us" }),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});

		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 2.5,
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});

	it("falls back to defaults when notification fields are missing or malformed", () => {
		expect(
			parseSettingsDoc({
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 3,
				notificationsEnabled: "yes",
				notifyDaysBeforeExpiry: -1,
				notifyHourLocal: 24,
				notifyTimezone: "",
			}),
		).toEqual({
			lowStockThreshold: 3,
			language: "en-us",
			hideDistantThresholdMonths: 3,
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
		});
	});
});
