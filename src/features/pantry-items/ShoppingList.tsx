import { EyeOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { Button, Empty, Flex, Listy, Typography, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { useClasses } from "../classes/useClasses";
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
	onAddItem: (entry: { name?: string; classKey?: string }) => void;
}) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { classes, loading: classesLoading } = useClasses(uid, category.key);
	const { shoppingList, loading } = useShoppingList(
		uid,
		category.key,
		pantryItems,
		threshold,
		classes,
	);
	const { getSkippedNames, skipItem } = useUiPreferencesStore();
	const skippedNames = getSkippedNames(category.key);

	if (loading || classesLoading) return null;

	const sorted = shoppingList
		.filter((entry) => !skippedNames.has(entry.key))
		.sort((a, b) => a.label.localeCompare(b.label));

	if (sorted.length === 0) {
		return <Empty description={t("items.shoppingListEmpty")} />;
	}

	return (
		<Listy
			items={sorted}
			rowKey="key"
			styles={{
				item: {
					padding: "12px 0",
					borderBottom: `1px solid ${token.colorSplit}`,
				},
			}}
			itemRender={(entry) => (
				<Flex justify="space-between" align="center">
					<Typography.Text strong>{entry.label}</Typography.Text>
					<Flex gap="small">
						<Button
							type="text"
							icon={<ShoppingCartOutlined />}
							onClick={() =>
								onAddItem({
									name: entry.name ?? undefined,
									classKey: entry.classKey ?? undefined,
								})
							}
						/>
						<Button
							type="text"
							icon={<EyeOutlined />}
							onClick={() => skipItem(category.key, entry.key)}
						/>
					</Flex>
				</Flex>
			)}
		/>
	);
}
