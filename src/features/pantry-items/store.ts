import { create } from "zustand";

type SortDirection = "asc" | "desc";
type Filter = "all" | "opened" | "unopened";

interface UiPreferencesState {
	sortDirectionByCategory: Record<string, SortDirection>;
	filterByCategory: Record<string, Filter>;
	searchByCategory: Record<string, string>;
	shoppingModeOnByCategory: Record<string, boolean>;
	skippedNamesByCategory: Record<string, Set<string>>;
	groupByClassByCategory: Record<string, boolean>;
	getSortDirection: (categoryKey: string) => SortDirection;
	getFilter: (categoryKey: string) => Filter;
	getSearch: (categoryKey: string) => string;
	isShoppingModeOn: (categoryKey: string) => boolean;
	getSkippedNames: (categoryKey: string) => Set<string>;
	isGroupByClassOn: (categoryKey: string) => boolean;
	setSortDirection: (categoryKey: string, direction: SortDirection) => void;
	setFilter: (categoryKey: string, filter: Filter) => void;
	setSearch: (categoryKey: string, search: string) => void;
	setShoppingModeOn: (categoryKey: string, on: boolean) => void;
	skipItem: (categoryKey: string, name: string) => void;
	setGroupByClassOn: (categoryKey: string, on: boolean) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
	sortDirectionByCategory: {},
	filterByCategory: {},
	searchByCategory: {},
	shoppingModeOnByCategory: {},
	skippedNamesByCategory: {},
	groupByClassByCategory: {},
	getSortDirection: (categoryKey) =>
		get().sortDirectionByCategory[categoryKey] ?? "asc",
	getFilter: (categoryKey) => get().filterByCategory[categoryKey] ?? "all",
	getSearch: (categoryKey) => get().searchByCategory[categoryKey] ?? "",
	isShoppingModeOn: (categoryKey) =>
		get().shoppingModeOnByCategory[categoryKey] ?? false,
	getSkippedNames: (categoryKey) =>
		get().skippedNamesByCategory[categoryKey] ?? new Set(),
	isGroupByClassOn: (categoryKey) =>
		get().groupByClassByCategory[categoryKey] ?? false,
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
	setSearch: (categoryKey, search) =>
		set((state) => ({
			searchByCategory: { ...state.searchByCategory, [categoryKey]: search },
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
	setGroupByClassOn: (categoryKey, on) =>
		set((state) => ({
			groupByClassByCategory: {
				...state.groupByClassByCategory,
				[categoryKey]: on,
			},
		})),
}));
