import type { WasteEvent } from "../pantry-items/schema";

export interface MonthlyWasteTrend {
	monthKey: string;
	year: number;
	month: number;
	consumedInTime: number;
	wasted: number;
}

export function aggregateWasteTrend(events: WasteEvent[]): MonthlyWasteTrend[] {
	const buckets = new Map<string, MonthlyWasteTrend>();

	for (const event of events) {
		const year = event.occurredAt.getFullYear();
		const month = event.occurredAt.getMonth();
		const monthKey = `${year}-${String(month).padStart(2, "0")}`;
		const bucket = buckets.get(monthKey) ?? {
			monthKey,
			year,
			month,
			consumedInTime: 0,
			wasted: 0,
		};

		if (event.wasExpired) {
			bucket.wasted += event.consumed;
		} else {
			bucket.consumedInTime += event.consumed;
		}
		bucket.wasted += event.discarded;

		buckets.set(monthKey, bucket);
	}

	return [...buckets.values()].sort((a, b) =>
		a.monthKey.localeCompare(b.monthKey),
	);
}
