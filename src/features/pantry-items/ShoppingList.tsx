import { EyeOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { Button, Empty, Flex, Listy, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import type { PantryItem } from "./schema";
import { useUiPreferencesStore } from "./store";
import { useShoppingList } from "./useShoppingList";

export function ShoppingList({
	uid,
	category,
	pantryItems,
	threshold,
	onAddItem,
}: {
	uid: string;
	category: Category;
	pantryItems: PantryItem[];
	threshold: number;
	onAddItem: (name: string) => void;
}) {
	const { t } = useTranslation();
	const { shoppingList } = useShoppingList(
		uid,
		category.key,
		pantryItems,
		threshold,
	);
	const { getSkippedNames, skipItem } = useUiPreferencesStore();
	const skippedNames = getSkippedNames(category.key);

	const sorted = shoppingList
		.filter((entry) => !skippedNames.has(entry.name))
		.sort((a, b) => a.name.localeCompare(b.name));

	if (sorted.length === 0) {
		return <Empty description={t("items.shoppingListEmpty")} />;
	}

	return (
		<Listy
			items={sorted}
			rowKey="name"
			styles={{
				item: { padding: "12px 0", borderBottom: "1px solid #f0f0f0" },
			}}
			itemRender={(entry) => (
				<Flex justify="space-between" align="center">
					<Typography.Text strong>{entry.name}</Typography.Text>
					<Flex gap="small">
						<Button
							type="text"
							icon={<ShoppingCartOutlined />}
							onClick={() => onAddItem(entry.name)}
						/>
						<Button
							type="text"
							icon={<EyeOutlined />}
							onClick={() => skipItem(category.key, entry.name)}
						/>
					</Flex>
				</Flex>
			)}
		/>
	);
}
