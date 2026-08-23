import { describe, expect, it } from "vitest";
import type { WasteEvent } from "../pantry-items/schema";
import { aggregateWasteEvents } from "./aggregateWasteEvents";

function event(overrides: Partial<WasteEvent>): WasteEvent {
	return {
		id: "event1",
		category: "foods",
		wasOpened: false,
		wasExpired: false,
		consumed: 0,
		discarded: 0,
		occurredAt: new Date("2026-08-23T00:00:00Z"),
		...overrides,
	};
}

describe("aggregateWasteEvents", () => {
	it("buckets a non-expired consumed event as consumedInTime", () => {
		const result = aggregateWasteEvents([
			event({ category: "foods", consumed: 2, wasExpired: false }),
		]);
		expect(result.foods.consumedInTime).toBe(2);
	});

	it("buckets an expired, unopened discarded event as expiredUnopened", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				discarded: 1,
				wasExpired: true,
				wasOpened: false,
			}),
		]);
		expect(result.foods.expiredUnopened).toBe(1);
	});

	it("buckets an expired, opened discarded event as expiredOpened", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				discarded: 1,
				wasExpired: true,
				wasOpened: true,
			}),
		]);
		expect(result.foods.expiredOpened).toBe(1);
	});

	it("buckets a non-expired discarded event as discardedNotExpired", () => {
		const result = aggregateWasteEvents([
			event({ category: "foods", discarded: 3, wasExpired: false }),
		]);
		expect(result.foods.discardedNotExpired).toBe(3);
	});

	it("buckets an expired consumed event as consumedAfterExpiry", () => {
		const result = aggregateWasteEvents([
			event({ category: "medicines", consumed: 1, wasExpired: true }),
		]);
		expect(result.medicines.consumedAfterExpiry).toBe(1);
	});

	it("sums both consumed and discarded from the same event doc", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				consumed: 1,
				discarded: 2,
				wasExpired: false,
				wasOpened: false,
			}),
		]);
		expect(result.foods.consumedInTime).toBe(1);
		expect(result.foods.discardedNotExpired).toBe(2);
	});
});
