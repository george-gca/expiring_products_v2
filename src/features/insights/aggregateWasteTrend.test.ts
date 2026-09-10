import { describe, expect, it } from "vitest";
import type { WasteEvent } from "../pantry-items/schema";
import { aggregateWasteTrend } from "./aggregateWasteTrend";

// Local-time constructor (not a UTC ISO string): aggregateWasteTrend buckets
// by getFullYear()/getMonth(), which read local time — a UTC midnight
// timestamp would roll to the previous local day/month in negative-UTC-offset
// zones and make the monthKey assertions below flaky depending on the
// machine's timezone.
function event(overrides: Partial<WasteEvent>): WasteEvent {
	return {
		id: "event1",
		category: "foods",
		wasOpened: false,
		wasExpired: false,
		consumed: 0,
		discarded: 0,
		occurredAt: new Date(2026, 7, 23),
		...overrides,
	};
}

describe("aggregateWasteTrend", () => {
	it("buckets a non-expired consumed event as consumedInTime for its month", () => {
		const result = aggregateWasteTrend([
			event({ consumed: 3, wasExpired: false }),
		]);
		expect(result).toEqual([
			{
				monthKey: "2026-07",
				year: 2026,
				month: 7,
				consumedInTime: 3,
				wasted: 0,
			},
		]);
	});

	it("buckets an expired consumed event as wasted", () => {
		const result = aggregateWasteTrend([
			event({ consumed: 2, wasExpired: true }),
		]);
		expect(result[0]).toMatchObject({ consumedInTime: 0, wasted: 2 });
	});

	it("buckets any discarded amount as wasted regardless of wasExpired/wasOpened", () => {
		const result = aggregateWasteTrend([
			event({ discarded: 1, wasExpired: false, wasOpened: false }),
			event({ discarded: 1, wasExpired: true, wasOpened: true }),
		]);
		expect(result[0]).toMatchObject({ consumedInTime: 0, wasted: 2 });
	});

	it("sums consumed and discarded from the same event into their respective buckets", () => {
		const result = aggregateWasteTrend([
			event({ consumed: 1, discarded: 2, wasExpired: false }),
		]);
		expect(result[0]).toMatchObject({ consumedInTime: 1, wasted: 2 });
	});

	it("splits events across different months and sorts chronologically", () => {
		const result = aggregateWasteTrend([
			event({ consumed: 1, occurredAt: new Date(2026, 7, 1) }),
			event({ consumed: 1, occurredAt: new Date(2026, 5, 1) }),
		]);
		expect(result.map((r) => r.monthKey)).toEqual(["2026-05", "2026-07"]);
	});

	it("merges same-month events from different categories into one bucket", () => {
		const result = aggregateWasteTrend([
			event({ category: "foods", consumed: 1, wasExpired: false }),
			event({ category: "medicines", consumed: 2, wasExpired: false }),
		]);
		expect(result).toHaveLength(1);
		expect(result[0].consumedInTime).toBe(3);
	});

	it("returns an empty array for no events", () => {
		expect(aggregateWasteTrend([])).toEqual([]);
	});
});
