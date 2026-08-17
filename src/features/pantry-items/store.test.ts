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
