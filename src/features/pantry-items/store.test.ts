import { describe, expect, it } from "vitest";
import { useUiPreferencesStore } from "./store";

describe("useUiPreferencesStore", () => {
	it("defaults to ascending sort and all filter for an unseen category", () => {
		const state = useUiPreferencesStore.getState();
		expect(state.getSortDirection("foods")).toBe("asc");
		expect(state.getFilter("foods")).toBe("all");
	});

	it("stores sort direction and filter per category independently", () => {
		const { setSortDirection, setFilter, getSortDirection, getFilter } =
			useUiPreferencesStore.getState();
		setSortDirection("foods", "desc");
		setFilter("medicines", "opened");
		expect(getSortDirection("foods")).toBe("desc");
		expect(getSortDirection("medicines")).toBe("asc");
		expect(getFilter("medicines")).toBe("opened");
	});
});

describe("shopping mode state", () => {
	it("defaults to off with no skipped names for an unseen category", () => {
		const state = useUiPreferencesStore.getState();
		expect(state.isShoppingModeOn("foods")).toBe(false);
		expect(state.getSkippedNames("foods")).toEqual(new Set());
	});

	it("tracks shopping mode and skipped names per category independently", () => {
		const { setShoppingModeOn, skipItem, isShoppingModeOn, getSkippedNames } =
			useUiPreferencesStore.getState();
		setShoppingModeOn("foods", true);
		skipItem("foods", "Coffee");
		expect(isShoppingModeOn("foods")).toBe(true);
		expect(getSkippedNames("foods")).toEqual(new Set(["Coffee"]));
		expect(isShoppingModeOn("medicines")).toBe(false);
		expect(getSkippedNames("medicines")).toEqual(new Set());
	});

	it("clears skipped names for a category when shopping mode turns off", () => {
		const { setShoppingModeOn, skipItem, getSkippedNames } =
			useUiPreferencesStore.getState();
		setShoppingModeOn("foods", true);
		skipItem("foods", "Coffee");
		setShoppingModeOn("foods", false);
		expect(getSkippedNames("foods")).toEqual(new Set());
	});
});
