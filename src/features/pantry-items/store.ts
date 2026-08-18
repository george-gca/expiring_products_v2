import { create } from "zustand";

type SortDirection = "asc" | "desc";
type Filter = "all" | "opened" | "unopened";

interface UiPreferencesState {
	sortDirectionByCategory: Record<string, SortDirection>;
	filterByCategory: Record<string, Filter>;
	shoppingModeOnByCategory: Record<string, boolean>;
	skippedNamesByCategory: Record<string, Set<string>>;
	getSortDirection: (categoryKey: string) => SortDirection;
	getFilter: (categoryKey: string) => Filter;
	isShoppingModeOn: (categoryKey: string) => boolean;
	getSkippedNames: (categoryKey: string) => Set<string>;
	setSortDirection: (categoryKey: string, direction: SortDirection) => void;
	setFilter: (categoryKey: string, filter: Filter) => void;
	setShoppingModeOn: (categoryKey: string, on: boolean) => void;
	skipItem: (categoryKey: string, name: string) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
	sortDirectionByCategory: {},
	filterByCategory: {},
	shoppingModeOnByCategory: {},
	skippedNamesByCategory: {},
	getSortDirection: (categoryKey) =>
		get().sortDirectionByCategory[categoryKey] ?? "asc",
	getFilter: (categoryKey) => get().filterByCategory[categoryKey] ?? "all",
	isShoppingModeOn: (categoryKey) =>
		get().shoppingModeOnByCategory[categoryKey] ?? false,
	getSkippedNames: (categoryKey) =>
		get().skippedNamesByCategory[categoryKey] ?? new Set(),
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
	setShoppingModeOn: (categoryKey, on) =>
		set((state) => ({
			shoppingModeOnByCategory: {
				...state.shoppingModeOnByCategory,
				[categoryKey]: on,
			},
			...(on === false && {
				skippedNamesByCategory: {
					...state.skippedNamesByCategory,
					[categoryKey]: new Set(),
				},
			}),
		})),
	skipItem: (categoryKey, name) =>
		set((state) => ({
			skippedNamesByCategory: {
				...state.skippedNamesByCategory,
				[categoryKey]: new Set([
					...(state.skippedNamesByCategory[categoryKey] ?? new Set()),
					name,
				]),
			},
		})),
}));
