import { Table, type TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { useAllPantryItems } from "../pantry-items/useAllPantryItems";
import { aggregateWasteEvents } from "./aggregateWasteEvents";
import { computeCurrentStatus } from "./currentStatus";
import { useWasteEvents } from "./useWasteEvents";

interface InsightsRow {
	key: string;
	categoryLabel: string;
	sealedGood: number;
	openedGood: number;
	overdueUnopened: number;
	overdueOpened: number;
	consumedInTime: number;
	expiredUnopened: number;
	expiredOpened: number;
	discardedNotExpired: number;
	consumedAfterExpiry: number;
}

interface MetricRow {
	key: string;
	label: string;
	[categoryKey: string]: string | number;
}

const EMPTY_CURRENT = {
	sealedGood: 0,
	openedGood: 0,
	overdueUnopened: 0,
	overdueOpened: 0,
};

const EMPTY_HISTORY = {
	consumedInTime: 0,
	expiredUnopened: 0,
	expiredOpened: 0,
	discardedNotExpired: 0,
	consumedAfterExpiry: 0,
};

export function InsightsPane({
	uid,
	categories,
}: {
	uid: string;
	categories: Category[];
}) {
	const { t } = useTranslation();
	const { items, loading: itemsLoading } = useAllPantryItems(uid);
	const { events, loading: eventsLoading } = useWasteEvents(uid);

	if (itemsLoading || eventsLoading) return null;

	const currentByCategory = computeCurrentStatus(items, new Date());
	const historyByCategory = aggregateWasteEvents(events);

	const rows: InsightsRow[] = categories.map((category) => ({
		key: category.key,
		categoryLabel: `${category.emoji} ${category.name}`,
		...(currentByCategory[category.key] ?? EMPTY_CURRENT),
		...(historyByCategory[category.key] ?? EMPTY_HISTORY),
	}));

	const totalRow: InsightsRow = rows.reduce(
		(acc, row) => ({
			key: "all",
			categoryLabel: t("insights.allCategories"),
			sealedGood: acc.sealedGood + row.sealedGood,
			openedGood: acc.openedGood + row.openedGood,
			overdueUnopened: acc.overdueUnopened + row.overdueUnopened,
			overdueOpened: acc.overdueOpened + row.overdueOpened,
			consumedInTime: acc.consumedInTime + row.consumedInTime,
			expiredUnopened: acc.expiredUnopened + row.expiredUnopened,
			expiredOpened: acc.expiredOpened + row.expiredOpened,
			discardedNotExpired: acc.discardedNotExpired + row.discardedNotExpired,
			consumedAfterExpiry: acc.consumedAfterExpiry + row.consumedAfterExpiry,
		}),
		{
			key: "all",
			categoryLabel: t("insights.allCategories"),
			...EMPTY_CURRENT,
			...EMPTY_HISTORY,
		},
	);

	const columnRows = [...rows, totalRow];
	const columns: TableColumnsType<MetricRow> = [
		{ title: "", dataIndex: "label", key: "label" },
		...columnRows.map((row) => ({
			title: row.categoryLabel,
			dataIndex: row.key,
			key: row.key,
		})),
	];

	const toMetricRows = (
		metrics: { key: keyof InsightsRow; label: string }[],
	): MetricRow[] =>
		metrics.map(({ key, label }) => {
			const metricRow: MetricRow = { key, label };
			for (const row of columnRows) {
				metricRow[row.key] = row[key] as number;
			}
			return metricRow;
		});

	const rightNowRows = toMetricRows([
		{ key: "sealedGood", label: t("insights.sealedGood") },
		{ key: "openedGood", label: t("insights.openedGood") },
		{ key: "overdueUnopened", label: t("insights.overdueUnopened") },
		{ key: "overdueOpened", label: t("insights.overdueOpened") },
	]);

	const allTimeRows = toMetricRows([
		{ key: "consumedInTime", label: t("insights.consumedInTime") },
		{ key: "expiredUnopened", label: t("insights.expiredUnopened") },
		{ key: "expiredOpened", label: t("insights.expiredOpened") },
		{ key: "discardedNotExpired", label: t("insights.discardedNotExpired") },
		{
			key: "consumedAfterExpiry",
			label: t("insights.consumedAfterExpiry"),
		},
	]);

	return (
		<>
			<Table
				title={() => t("insights.sectionRightNow")}
				columns={columns}
				dataSource={rightNowRows}
				pagination={false}
				rowKey="key"
				scroll={{ x: true }}
			/>
			<Table
				title={() => t("insights.sectionAllTime")}
				columns={columns}
				dataSource={allTimeRows}
				pagination={false}
				rowKey="key"
				scroll={{ x: true }}
			/>
		</>
	);
}
