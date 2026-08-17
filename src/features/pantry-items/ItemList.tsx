import { PlusOutlined } from "@ant-design/icons";
import { Empty, FloatButton, List } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";
import { EditItemModal } from "./EditItemModal";
import { ItemListItem } from "./ItemListItem";
import type { PantryItem } from "./schema";
import { sortItems } from "./sortItems";
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

	if (loading) return null;

	const sorted = sortItems(items);

	return (
		<>
			{sorted.length === 0 ? (
				<Empty description={t("items.empty")} />
			) : (
				<List
					dataSource={sorted}
					renderItem={(item) => (
						<ItemListItem
							key={item.id}
							item={item}
							onClick={() => setEditingItem(item)}
						/>
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
