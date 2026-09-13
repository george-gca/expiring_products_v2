import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemListItem } from "./ItemListItem";
import type { PantryItem } from "./schema";

function makeItem(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: "1",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2099-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("ItemListItem", () => {
	it("shows a 'no expiration' label instead of a date for an item with none", () => {
		render(
			<ItemListItem
				item={makeItem({ expiringDate: null })}
				onClick={vi.fn()}
			/>,
		);
		expect(screen.getByText(/no expiration/i)).toBeInTheDocument();
	});
});
