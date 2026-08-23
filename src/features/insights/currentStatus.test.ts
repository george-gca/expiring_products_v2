import { describe, expect, it } from "vitest";
import type { PantryItem } from "../pantry-items/schema";
import { computeCurrentStatus } from "./currentStatus";

const now = new Date("2026-08-23T00:00:00Z");

function item(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: "id1",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2099-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("computeCurrentStatus", () => {
	it("buckets a sealed, not-yet-expired item as sealedGood", () => {
		const result = computeCurrentStatus(
			[item({ category: "foods", quantity: 3, opened: false })],
			now,
		);
		expect(result.foods).toEqual({
			sealedGood: 3,
			openedGood: 0,
			overdueUnopened: 0,
			overdueOpened: 0,
		});
	});

	it("buckets an opened, not-yet-expired item as openedGood", () => {
		const result = computeCurrentStatus(
			[item({ category: "foods", quantity: 2, opened: true })],
			now,
		);
		expect(result.foods.openedGood).toBe(2);
	});

	it("buckets an overdue, unopened item as overdueUnopened", () => {
		const result = computeCurrentStatus(
			[
				item({
					category: "medicines",
					quantity: 1,
					opened: false,
					expiringDate: new Date("2020-01-01"),
				}),
			],
			now,
		);
		expect(result.medicines.overdueUnopened).toBe(1);
	});

	it("buckets an overdue, opened item as overdueOpened", () => {
		const result = computeCurrentStatus(
			[
				item({
					category: "medicines",
					quantity: 1,
					opened: true,
					expiringDate: new Date("2020-01-01"),
				}),
			],
			now,
		);
		expect(result.medicines.overdueOpened).toBe(1);
	});

	it("sums quantities across multiple items in the same category", () => {
		const result = computeCurrentStatus(
			[
				item({ category: "foods", quantity: 2, opened: false }),
				item({ category: "foods", quantity: 5, opened: false }),
			],
			now,
		);
		expect(result.foods.sealedGood).toBe(7);
	});
});
