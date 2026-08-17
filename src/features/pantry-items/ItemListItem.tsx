import { List, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PantryItem } from "./schema";
import { getExpiryWarningColor } from "./sortItems";

const COLOR_STYLES: Record<"red" | "yellow" | "white", { background: string }> =
	{
		red: { background: "#fff1f0" },
		yellow: { background: "#fffbe6" },
		white: { background: "transparent" },
	};

export function ItemListItem({
	item,
	onClick,
}: {
	item: PantryItem;
	onClick: () => void;
}) {
	const { t } = useTranslation();
	const color = getExpiryWarningColor(item, new Date());

	return (
		<List.Item
			onClick={onClick}
			style={{ cursor: "pointer", ...COLOR_STYLES[color] }}
		>
			<List.Item.Meta
				title={<Typography.Text strong>{item.name}</Typography.Text>}
				description={t("items.expiresOn", {
					date: item.expiringDate.toLocaleDateString(),
				})}
			/>
			<Tag color="blue">{item.quantity}</Tag>
		</List.Item>
	);
}
