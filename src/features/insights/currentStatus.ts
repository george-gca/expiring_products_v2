import type { PantryItem } from "../pantry-items/schema";

export interface CategoryCurrentStatus {
	sealedGood: number;
	openedGood: number;
	overdueUnopened: number;
	overdueOpened: number;
}

export function computeCurrentStatus(
	items: PantryItem[],
	now: Date,
): Record<string, CategoryCurrentStatus> {
	const result: Record<string, CategoryCurrentStatus> = {};
	for (const item of items) {
		const bucket = (result[item.category] ??= {
			sealedGood: 0,
			openedGood: 0,
			overdueUnopened: 0,
			overdueOpened: 0,
		});
		const overdue = item.expiringDate.getTime() < now.getTime();
		if (overdue) {
			if (item.opened) {
				bucket.overdueOpened += item.quantity;
			} else {
				bucket.overdueUnopened += item.quantity;
			}
		} else {
			if (item.opened) {
				bucket.openedGood += item.quantity;
			} else {
				bucket.sealedGood += item.quantity;
			}
		}
	}
	return result;
}
