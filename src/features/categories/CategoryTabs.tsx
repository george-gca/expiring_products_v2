import { Tabs } from "antd";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "./schema";

interface CategoryTabsProps {
	categories: Category[];
	renderPane: (category: Category) => ReactNode;
	insightsPane: ReactNode;
	settingsPane: ReactNode;
}

export function CategoryTabs({
	categories,
	renderPane,
	insightsPane,
	settingsPane,
}: CategoryTabsProps) {
	const { t } = useTranslation();
	const containerRef = useRef<HTMLDivElement>(null);

	// Selecting a tab toggles its label between icon-only and icon+name (see
	// the .category-tab-name CSS rule), but antd only remeasures ink-bar
	// geometry when the *set* of tab keys changes or the nav list's own box
	// resizes — neither of which fires here, since the nav list is pinned to
	// 100% width whenever the tabs fit without overflowing. Nudging its
	// min-width by 1px and back forces two real resize events, which makes
	// antd recompute every tab's actual current width.
	function remeasureInkBar() {
		const navList =
			containerRef.current?.querySelector<HTMLElement>(".ant-tabs-nav-list");
		if (!navList) return;
		navList.style.minWidth = "calc(100% + 1px)";
		// Two rAFs, not one: a single rAF callback runs in the same frame
		// update as this click, before that frame's layout/ResizeObserver
		// delivery step — reverting there erases the change before the
		// observer ever sees it fire. Waiting a full extra frame lets the
		// "expanded" state actually get observed first.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				navList.style.minWidth = "";
			});
		});
	}

	const items = [
		...categories.map((category) => ({
			key: category.key,
			label: (
				<>
					{category.emoji}{" "}
					<span className="category-tab-name">{category.name}</span>
				</>
			),
			children: renderPane(category),
		})),
		{
			key: "insights",
			label: (
				<>
					📊 <span className="category-tab-name">{t("insights.tabName")}</span>
				</>
			),
			children: insightsPane,
		},
		{
			key: "settings",
			label: (
				<>
					⚙️ <span className="category-tab-name">{t("settings.tabName")}</span>
				</>
			),
			children: settingsPane,
		},
	];
	return (
		<div ref={containerRef}>
			<Tabs
				className="category-tabs"
				items={items}
				onChange={remeasureInkBar}
			/>
		</div>
	);
}
