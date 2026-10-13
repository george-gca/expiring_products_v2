import { Collapse, Listy, Tag, theme } from "antd";
import type { ItemClass } from "../classes/schema";
import { ItemListItem } from "./ItemListItem";
import type { PantryItem } from "./schema";

export function ClassGroupedItemList({
	items,
	classes,
	onItemClick,
}: {
	items: PantryItem[];
	classes: ItemClass[];
	onItemClick: (item: PantryItem) => void;
}) {
	const { token } = theme.useToken();
	const liveClassKeys = new Set(classes.map((cls) => cls.key));

	const grouped = new Map<string, PantryItem[]>();
	const ungrouped: PantryItem[] = [];
	for (const item of items) {
		if (item.classKey && liveClassKeys.has(item.classKey)) {
			const group = grouped.get(item.classKey) ?? [];
			group.push(item);
			grouped.set(item.classKey, group);
		} else {
			ungrouped.push(item);
		}
	}

	const rowStyles = {
		item: {
			padding: "12px 0",
			borderBottom: `1px solid ${token.colorSplit}`,
		},
	};

	const groupItems = classes
		.filter((cls) => grouped.has(cls.key))
		.map((cls) => {
			const members = grouped.get(cls.key) ?? [];
			const totalQuantity = members.reduce(
				(sum, item) => sum + item.quantity,
				0,
			);
			return {
				key: cls.key,
				label: `${cls.name} (${members.length})`,
				extra: <Tag color="blue">{totalQuantity}</Tag>,
				children: (
					<Listy
						items={members}
						rowKey="id"
						styles={rowStyles}
						itemRender={(item) => (
							<ItemListItem item={item} onClick={() => onItemClick(item)} />
						)}
					/>
				),
			};
		});

	return (
		<>
			{groupItems.length > 0 && <Collapse items={groupItems} />}
			{ungrouped.length > 0 && (
				<Listy
					items={ungrouped}
					rowKey="id"
					styles={rowStyles}
					itemRender={(item) => (
						<ItemListItem item={item} onClick={() => onItemClick(item)} />
					)}
				/>
			)}
		</>
	);
}
