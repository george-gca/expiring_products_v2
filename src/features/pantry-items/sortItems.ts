import dayjs from "dayjs";
import type { PantryItem } from "./schema";

// No expiration date sorts as if it were infinitely far away — always after
// every dated item, at the bottom of its category.
function expiringTime(item: PantryItem): number {
	return item.expiringDate === null
		? Number.POSITIVE_INFINITY
		: item.expiringDate.getTime();
}

export function sortItems(items: PantryItem[]): PantryItem[] {
	return [...items].sort((a, b) => {
		const dateDiff = expiringTime(a) - expiringTime(b);
		if (dateDiff !== 0) return dateDiff;
		if (a.opened !== b.opened) return a.opened ? -1 : 1;
		return b.quantity - a.quantity;
	});
}

const YELLOW_THRESHOLD_DAYS = 3;

export function getExpiryWarningColor(
	item: PantryItem,
	now: Date,
): "red" | "yellow" | "white" {
	if (item.expiringDate === null) return "white";
	const daysUntilExpiry =
		(item.expiringDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
	if (daysUntilExpiry < 0) return "red";
	if (daysUntilExpiry <= YELLOW_THRESHOLD_DAYS) return "yellow";
	return "white";
}

export function filterDistantItems(
	items: PantryItem[],
	thresholdMonths: number,
	now: Date,
): PantryItem[] {
	const cutoff = dayjs(now).add(thresholdMonths, "month").toDate();
	return items.filter(
		(item) =>
			item.expiringDate !== null &&
			item.expiringDate.getTime() <= cutoff.getTime(),
	);
}
