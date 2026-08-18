import { PlusOutlined } from "@ant-design/icons";
import { Empty, FloatButton, Listy } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";
import { EditItemModal } from "./EditItemModal";
import { ItemListItem } from "./ItemListItem";
import type { PantryItem } from "./schema";
import { sortItems } from "./sortItems";
import { useUiPreferencesStore } from "./store";
import { usePantryItems } from "./usePantryItems";

export function ItemList({
	uid,
	category,
}: {
	uid: string;
	category: Category;
}) {
	const { t } = useTranslation();
	const { items, loading } = usePantryItems(uid, category.key);
	const [addOpen, setAddOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<PantryItem | null>(null);

	const { getSortDirection, getFilter } = useUiPreferencesStore();
	const direction = getSortDirection(category.key);
	const filter = getFilter(category.key);

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
			{sorted.length === 0 ? (
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
			<FloatButton icon={<PlusOutlined />} onClick={() => setAddOpen(true)} />
			<AddItemModal
				uid={uid}
				category={category}
				open={addOpen}
				onClose={() => setAddOpen(false)}
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
