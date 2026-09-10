import { describe, expect, it } from "vitest";
import type { Category } from "../categories/schema";
import type { CategoryWasteHistory } from "./aggregateWasteEvents";
import { computeWasteRateRanking } from "./computeWasteRateRanking";

function category(overrides: Partial<Category>): Category {
	return {
		id: `${overrides.key}-id`,
		key: "foods",
		name: "Foods",
		emoji: "🍎",
		order: 0,
		archived: false,
		...overrides,
	};
}

function history(
	overrides: Partial<CategoryWasteHistory>,
): CategoryWasteHistory {
	return {
		consumedInTime: 0,
		expiredUnopened: 0,
		expiredOpened: 0,
		discardedNotExpired: 0,
		consumedAfterExpiry: 0,
		...overrides,
	};
}

describe("computeWasteRateRanking", () => {
	it("computes a category's waste rate as wasted over total outcomes", () => {
		const result = computeWasteRateRanking(
			{ foods: history({ consumedInTime: 3, discardedNotExpired: 1 }) },
			[category({ key: "foods" })],
		);
		expect(result).toEqual([
			{ key: "foods", label: "🍎 Foods", wasted: 1, total: 4, rate: 0.25 },
		]);
	});

	it("sums all four waste buckets into the wasted count", () => {
		const result = computeWasteRateRanking(
			{
				foods: history({
					expiredUnopened: 1,
					expiredOpened: 1,
					discardedNotExpired: 1,
					consumedAfterExpiry: 1,
				}),
			},
			[category({ key: "foods" })],
		);
		expect(result[0]).toMatchObject({ wasted: 4, total: 4, rate: 1 });
	});

	it("excludes a category with no history at all (0/0 isn't meaningful)", () => {
		const result = computeWasteRateRanking({}, [category({ key: "foods" })]);
		expect(result).toEqual([]);
	});

	it("sorts categories by waste rate, worst first", () => {
		const result = computeWasteRateRanking(
			{
				foods: history({ consumedInTime: 9, discardedNotExpired: 1 }), // 10%
				medicines: history({ consumedInTime: 1, discardedNotExpired: 1 }), // 50%
			},
			[
				category({ key: "foods", name: "Foods", emoji: "🍎" }),
				category({ key: "medicines", name: "Medicines", emoji: "💊" }),
			],
		);
		expect(result.map((r) => r.key)).toEqual(["medicines", "foods"]);
	});

	it("skips a category from `categories` that has no matching history entry", () => {
		const result = computeWasteRateRanking(
			{ foods: history({ consumedInTime: 1, discardedNotExpired: 1 }) },
			[
				category({ key: "foods", name: "Foods", emoji: "🍎" }),
				category({ key: "medicines", name: "Medicines", emoji: "💊" }),
			],
		);
		expect(result.map((r) => r.key)).toEqual(["foods"]);
	});
});
