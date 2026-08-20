import { describe, expect, it } from "vitest";
import {
	buildDigestBody,
	matchesLocalHour,
	needsNotification,
} from "./logic.js";

describe("matchesLocalHour", () => {
	it("returns true when the current UTC time is the target local hour", () => {
		// 2026-01-15T11:00:00Z is 08:00 in America/Sao_Paulo (fixed UTC-3, no DST).
		const now = new Date("2026-01-15T11:00:00Z");
		expect(matchesLocalHour(now, "America/Sao_Paulo", 8)).toBe(true);
	});

	it("returns false outside the target local hour", () => {
		const now = new Date("2026-01-15T12:00:00Z");
		expect(matchesLocalHour(now, "America/Sao_Paulo", 8)).toBe(false);
	});
});

describe("needsNotification", () => {
	it("returns true when never notified", () => {
		expect(needsNotification(null, new Date("2026-01-15T00:00:00Z"), 7)).toBe(
			true,
		);
	});

	it("returns false within the dedup window", () => {
		const lastNotifiedAt = new Date("2026-01-14T00:00:00Z");
		const now = new Date("2026-01-15T00:00:00Z");
		expect(needsNotification(lastNotifiedAt, now, 7)).toBe(false);
	});

	it("returns true once the dedup window has elapsed", () => {
		const lastNotifiedAt = new Date("2026-01-01T00:00:00Z");
		const now = new Date("2026-01-15T00:00:00Z");
		expect(needsNotification(lastNotifiedAt, now, 7)).toBe(true);
	});
});

describe("buildDigestBody", () => {
	it("builds pt-br wording", () => {
		const { title, body } = buildDigestBody(["Leite", "Ovos"], "pt-br");
		expect(title).toContain("2");
		expect(body).toBe("Leite, Ovos");
	});

	it("builds en-us wording", () => {
		const { title, body } = buildDigestBody(["Milk"], "en-us");
		expect(title).toContain("1");
		expect(body).toBe("Milk");
	});
});
