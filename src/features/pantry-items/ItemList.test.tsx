import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../categories/schema";
import { ItemList } from "./ItemList";
import type { PantryItem } from "./schema";
import { useUiPreferencesStore } from "./store";
import { usePantryItems } from "./usePantryItems";

vi.mock("./usePantryItems", () => ({ usePantryItems: vi.fn() }));
const mockedUsePantryItems = vi.mocked(usePantryItems);

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

function makeItem(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: overrides.name ?? "item",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("ItemList search", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		useUiPreferencesStore.setState({ searchByCategory: {} });
	});

	it("shows only items whose name matches the typed search text, case-insensitively", async () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Coffee" }), makeItem({ name: "Bananas" })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-search-1"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={12}
			/>,
		);

		expect(screen.getByText("Coffee")).toBeInTheDocument();
		expect(screen.getByText("Bananas")).toBeInTheDocument();

		await userEvent.type(
			screen.getByRole("searchbox", { name: /search/i }),
			"coff",
		);

		expect(screen.getByText("Coffee")).toBeInTheDocument();
		expect(screen.queryByText("Bananas")).not.toBeInTheDocument();
	});

	it("shows the empty state when no item matches the search text", async () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Coffee" })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-search-2"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={12}
			/>,
		);

		await userEvent.type(
			screen.getByRole("searchbox", { name: /search/i }),
			"zzz",
		);

		expect(screen.queryByText("Coffee")).not.toBeInTheDocument();
	});
});
