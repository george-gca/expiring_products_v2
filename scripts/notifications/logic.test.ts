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
	const now = new Date("2026-01-15T00:00:00Z");

	it("groups an item expiring today into the today bucket (pt-br)", () => {
		const { body } = buildDigestBody(
			[{ name: "Leite", expiringDate: new Date("2026-01-15T00:00:00Z") }],
			now,
			"pt-br",
		);
		expect(body).toBe("Hoje: Leite");
	});

	it("groups an item expiring today into the today bucket (en-us)", () => {
		const { body } = buildDigestBody(
			[{ name: "Milk", expiringDate: new Date("2026-01-15T00:00:00Z") }],
			now,
			"en-us",
		);
		expect(body).toBe("Today: Milk");
	});

	it("groups items 1-2 days out separately from today", () => {
		const { body } = buildDigestBody(
			[
				{ name: "Leite", expiringDate: new Date("2026-01-15T00:00:00Z") },
				{ name: "Ovos", expiringDate: new Date("2026-01-16T00:00:00Z") },
				{ name: "Iogurte", expiringDate: new Date("2026-01-17T00:00:00Z") },
			],
			now,
			"pt-br",
		);
		expect(body).toBe("Hoje: Leite\n1-2 dias: Ovos, Iogurte");
	});

	it("puts an item 3+ days out in the this-week bucket", () => {
		const { body } = buildDigestBody(
			[{ name: "Queijo", expiringDate: new Date("2026-01-18T00:00:00Z") }],
			now,
			"pt-br",
		);
		expect(body).toBe("Esta semana: Queijo");
	});

	it("omits empty buckets", () => {
		const { body } = buildDigestBody(
			[{ name: "Queijo", expiringDate: new Date("2026-01-18T00:00:00Z") }],
			now,
			"en-us",
		);
		expect(body).toBe("This week: Queijo");
	});

	it("flags the title when any item is due today", () => {
		const { title } = buildDigestBody(
			[
				{ name: "Leite", expiringDate: new Date("2026-01-15T00:00:00Z") },
				{ name: "Queijo", expiringDate: new Date("2026-01-18T00:00:00Z") },
			],
			now,
			"en-us",
		);
		expect(title).toBe("2 item(s) expiring soon — 1 today!");
	});

	it("leaves the title unflagged when nothing is due today", () => {
		const { title } = buildDigestBody(
			[{ name: "Queijo", expiringDate: new Date("2026-01-18T00:00:00Z") }],
			now,
			"pt-br",
		);
		expect(title).toBe("1 item(ns) vencendo em breve");
	});

	it("treats an already-overdue item as due today", () => {
		const { body } = buildDigestBody(
			[{ name: "Leite", expiringDate: new Date("2026-01-10T00:00:00Z") }],
			now,
			"pt-br",
		);
		expect(body).toBe("Hoje: Leite");
	});
});
