import type { PantryItem } from "./schema";

export function sortItems(items: PantryItem[]): PantryItem[] {
	return [...items].sort((a, b) => {
		const dateDiff = a.expiringDate.getTime() - b.expiringDate.getTime();
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
	const daysUntilExpiry =
		(item.expiringDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
	if (daysUntilExpiry < 0) return "red";
	if (daysUntilExpiry <= YELLOW_THRESHOLD_DAYS) return "yellow";
	return "white";
}
