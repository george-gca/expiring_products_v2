import { PlusOutlined } from "@ant-design/icons";
import { Empty, FloatButton, Listy, Switch } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";
import { EditItemModal } from "./EditItemModal";
import { ItemListItem } from "./ItemListItem";
import { ShoppingList } from "./ShoppingList";
import type { PantryItem } from "./schema";
import { sortItems } from "./sortItems";
import { useUiPreferencesStore } from "./store";
import { usePantryItems } from "./usePantryItems";

export function ItemList({
	uid,
	category,
	lowStockThreshold,
}: {
	uid: string;
	category: Category;
	lowStockThreshold: number;
}) {
	const { t } = useTranslation();
	const { items, loading } = usePantryItems(uid, category.key);
	const [addOpen, setAddOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
	const [addInitialName, setAddInitialName] = useState<string | undefined>(
		undefined,
	);
	// Whether the Add Item modal's recurring switch should default on. Only
	// ShoppingList's cart-icon flow sets this true — an entry only appears on
	// the shopping list because item_history already marked that item type
	// recurring, so we don't need ShoppingList to explicitly pass a boolean
	// through its onAddItem callback; which callback fired already tells us.
	const [addInitialRecurring, setAddInitialRecurring] = useState(false);

	const { getSortDirection, getFilter, isShoppingModeOn, setShoppingModeOn } =
		useUiPreferencesStore();
	const direction = getSortDirection(category.key);
	const filter = getFilter(category.key);
	const shoppingModeOn = isShoppingModeOn(category.key);

	const filtered = items.filter((item) => {
		if (filter === "opened") return item.opened;
		if (filter === "unopened") return !item.opened;
		return true;
	});
	const sorted = sortItems(filtered);
	if (direction === "desc") sorted.reverse();

	if (loading) return null;

	return (
		<>
			<Switch
				checked={shoppingModeOn}
				onChange={(checked) => setShoppingModeOn(category.key, checked)}
				checkedChildren={t("items.shoppingMode")}
				unCheckedChildren={t("items.shoppingMode")}
				style={{ marginBottom: 12 }}
			/>
			{shoppingModeOn ? (
				<ShoppingList
					uid={uid}
					category={category}
					pantryItems={items}
					threshold={lowStockThreshold}
					onAddItem={(name) => {
						setAddInitialName(name);
						setAddInitialRecurring(true);
						setAddOpen(true);
					}}
				/>
			) : sorted.length === 0 ? (
				<Empty description={t("items.empty")} />
			) : (
				<Listy
					items={sorted}
					rowKey="id"
					styles={{
						item: { padding: "12px 0", borderBottom: "1px solid #f0f0f0" },
					}}
					itemRender={(item) => (
						<ItemListItem item={item} onClick={() => setEditingItem(item)} />
					)}
				/>
			)}
			<FloatButton
				icon={<PlusOutlined />}
				onClick={() => {
					setAddInitialRecurring(false);
					setAddOpen(true);
				}}
			/>
			<AddItemModal
				uid={uid}
				category={category}
				open={addOpen}
				onClose={() => {
					setAddOpen(false);
					setAddInitialName(undefined);
					setAddInitialRecurring(false);
				}}
				initialName={addInitialName}
				initialRecurring={addInitialRecurring}
			/>
			{editingItem && (
				<EditItemModal
					uid={uid}
					item={editingItem}
					onClose={() => setEditingItem(null)}
				/>
			)}
		</>
	);
}
