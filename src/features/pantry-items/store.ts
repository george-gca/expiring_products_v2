import { create } from "zustand";

type SortDirection = "asc" | "desc";
type Filter = "all" | "opened" | "unopened";

interface UiPreferencesState {
	sortDirectionByCategory: Record<string, SortDirection>;
	filterByCategory: Record<string, Filter>;
	getSortDirection: (categoryKey: string) => SortDirection;
	getFilter: (categoryKey: string) => Filter;
	setSortDirection: (categoryKey: string, direction: SortDirection) => void;
	setFilter: (categoryKey: string, filter: Filter) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
	sortDirectionByCategory: {},
	filterByCategory: {},
	getSortDirection: (categoryKey) =>
		get().sortDirectionByCategory[categoryKey] ?? "asc",
	getFilter: (categoryKey) => get().filterByCategory[categoryKey] ?? "all",
	setSortDirection: (categoryKey, direction) =>
		set((state) => ({
			sortDirectionByCategory: {
				...state.sortDirectionByCategory,
				[categoryKey]: direction,
			},
		})),
	setFilter: (categoryKey, filter) =>
		set((state) => ({
			filterByCategory: { ...state.filterByCategory, [categoryKey]: filter },
		})),
}));
