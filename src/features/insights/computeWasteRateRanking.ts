import type { Category } from "../categories/schema";
import type { CategoryWasteHistory } from "./aggregateWasteEvents";

export interface WasteRateRow {
	key: string;
	label: string;
	wasted: number;
	total: number;
	rate: number;
}

export function computeWasteRateRanking(
	historyByCategory: Record<string, CategoryWasteHistory>,
	categories: Category[],
): WasteRateRow[] {
	const rows: WasteRateRow[] = [];

	for (const category of categories) {
		const history = historyByCategory[category.key];
		if (!history) continue;

		const wasted =
			history.expiredUnopened +
			history.expiredOpened +
			history.discardedNotExpired +
			history.consumedAfterExpiry;
		const total = wasted + history.consumedInTime;
		if (total === 0) continue;

		rows.push({
			key: category.key,
			label: `${category.emoji} ${category.name}`,
			wasted,
			total,
			rate: wasted / total,
		});
	}

	return rows.sort((a, b) => b.rate - a.rate);
}
