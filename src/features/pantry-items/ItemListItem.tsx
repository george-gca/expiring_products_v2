import { Flex, Tag, Typography, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { PantryItem } from "./schema";
import { getExpiryWarningColor } from "./sortItems";

export function ItemListItem({
	item,
	onClick,
}: {
	item: PantryItem;
	onClick: () => void;
}) {
	const { t, i18n } = useTranslation();
	const { token } = theme.useToken();
	const color = getExpiryWarningColor(item, new Date());

	// Semantic tokens (not hardcoded hex) so the background stays readable
	// under both the light and dark ConfigProvider algorithms — see Root.tsx.
	const colorStyles: Record<
		"red" | "yellow" | "white",
		{ background: string }
	> = {
		red: { background: token.colorErrorBg },
		yellow: { background: token.colorWarningBg },
		white: { background: "transparent" },
	};

	return (
		<Flex
			justify="space-between"
			align="center"
			onClick={onClick}
			style={{ cursor: "pointer", ...colorStyles[color] }}
		>
			<Flex vertical>
				<Typography.Text strong>{item.name}</Typography.Text>
				<Typography.Text type="secondary">
					{t("items.expiresOn", {
						date: item.expiringDate.toLocaleDateString(i18n.language),
					})}
				</Typography.Text>
			</Flex>
			<Tag color="blue">{item.quantity}</Tag>
		</Flex>
	);
}
