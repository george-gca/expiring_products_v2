import { Tabs } from "antd";
import type { ReactNode } from "react";
import type { Category } from "./schema";

interface CategoryTabsProps {
	categories: Category[];
	renderPane: (category: Category) => ReactNode;
	settingsPane: ReactNode;
}

export function CategoryTabs({
	categories,
	renderPane,
	settingsPane,
}: CategoryTabsProps) {
	const items = [
		...categories.map((category) => ({
			key: category.key,
			label: `${category.emoji} ${category.name}`,
			children: renderPane(category),
		})),
		{ key: "settings", label: "⚙️", children: settingsPane },
	];
	return <Tabs items={items} />;
}
