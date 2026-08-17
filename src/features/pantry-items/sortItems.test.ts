import { describe, expect, it } from "vitest";
import type { PantryItem } from "./schema";
import { getExpiryWarningColor, sortItems } from "./sortItems";

function makeItem(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: "1",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2026-12-31"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("sortItems", () => {
	it("sorts by expiring date ascending, then opened-first, then quantity descending", () => {
		const soonUnopened = makeItem({
			id: "a",
			expiringDate: new Date("2026-09-01"),
			quantity: 1,
		});
		const soonOpened = makeItem({
			id: "b",
			expiringDate: new Date("2026-09-01"),
			opened: true,
			quantity: 1,
		});
		const later = makeItem({
			id: "c",
			expiringDate: new Date("2026-10-01"),
			quantity: 5,
		});
		const result = sortItems([later, soonUnopened, soonOpened]);
		expect(result.map((i) => i.id)).toEqual(["b", "a", "c"]);
	});
});

describe("getExpiryWarningColor", () => {
	const now = new Date("2026-08-17T12:00:00Z");

	it("returns red for already-expired items", () => {
		const item = makeItem({ expiringDate: new Date("2026-08-01") });
		expect(getExpiryWarningColor(item, now)).toBe("red");
	});

	it("returns yellow for items expiring within 3 days", () => {
		const item = makeItem({ expiringDate: new Date("2026-08-19") });
		expect(getExpiryWarningColor(item, now)).toBe("yellow");
	});

	it("returns white for items expiring beyond 3 days", () => {
		const item = makeItem({ expiringDate: new Date("2026-09-01") });
		expect(getExpiryWarningColor(item, now)).toBe("white");
	});
});
