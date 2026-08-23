import type { WasteEvent } from "../pantry-items/schema";

export interface CategoryWasteHistory {
	consumedInTime: number;
	expiredUnopened: number;
	expiredOpened: number;
	discardedNotExpired: number;
	consumedAfterExpiry: number;
}

export function aggregateWasteEvents(
	events: WasteEvent[],
): Record<string, CategoryWasteHistory> {
	const result: Record<string, CategoryWasteHistory> = {};
	for (const event of events) {
		result[event.category] ??= {
			consumedInTime: 0,
			expiredUnopened: 0,
			expiredOpened: 0,
			discardedNotExpired: 0,
			consumedAfterExpiry: 0,
		};
		const bucket = result[event.category];
		if (event.consumed > 0) {
			if (event.wasExpired) {
				bucket.consumedAfterExpiry += event.consumed;
			} else {
				bucket.consumedInTime += event.consumed;
			}
		}
		if (event.discarded > 0) {
			if (event.wasExpired) {
				if (event.wasOpened) {
					bucket.expiredOpened += event.discarded;
				} else {
					bucket.expiredUnopened += event.discarded;
				}
			} else {
				bucket.discardedNotExpired += event.discarded;
			}
		}
	}
	return result;
}
