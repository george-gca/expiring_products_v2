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

	const columns: TableColumnsType<InsightsRow> = [
		{ title: "", dataIndex: "categoryLabel", key: "categoryLabel" },
		{
			title: t("insights.sectionRightNow"),
			children: [
				{ title: t("insights.sealedGood"), dataIndex: "sealedGood", key: "sealedGood" },
				{ title: t("insights.openedGood"), dataIndex: "openedGood", key: "openedGood" },
				{ title: t("insights.overdueUnopened"), dataIndex: "overdueUnopened", key: "overdueUnopened" },
				{ title: t("insights.overdueOpened"), dataIndex: "overdueOpened", key: "overdueOpened" },
			],
		},
		{
			title: t("insights.sectionAllTime"),
			children: [
				{ title: t("insights.consumedInTime"), dataIndex: "consumedInTime", key: "consumedInTime" },
				{ title: t("insights.expiredUnopened"), dataIndex: "expiredUnopened", key: "expiredUnopened" },
				{ title: t("insights.expiredOpened"), dataIndex: "expiredOpened", key: "expiredOpened" },
				{ title: t("insights.discardedNotExpired"), dataIndex: "discardedNotExpired", key: "discardedNotExpired" },
				{ title: t("insights.consumedAfterExpiry"), dataIndex: "consumedAfterExpiry", key: "consumedAfterExpiry" },
			],
		},
	];

	return (
		<Table
			columns={columns}
			dataSource={[...rows, totalRow]}
			pagination={false}
			rowKey="key"
			scroll={{ x: true }}
		/>
	);
}
