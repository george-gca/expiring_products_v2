import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ItemClass } from "../classes/schema";
import { ClassGroupedItemList } from "./ClassGroupedItemList";
import type { PantryItem } from "./schema";

function makeItem(
	id: string,
	name: string,
	quantity: number,
	classKey: string | null = null,
): PantryItem {
	return {
		id,
		name,
		category: "cleaning",
		quantity,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		classKey,
	};
}

const soapClass: ItemClass = {
	id: "class1",
	key: "soap-key",
	category: "cleaning",
	name: "Soap",
	archived: false,
};

describe("ClassGroupedItemList", () => {
	it("collapses classed items into one group row with member count and summed quantity", async () => {
		const items = [
			makeItem("dove", "Dove Soap", 2, "soap-key"),
			makeItem("lux", "Lux Soap", 1, "soap-key"),
		];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("Soap (2)")).toBeInTheDocument();
		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.queryByText("Dove Soap")).not.toBeInTheDocument();

		await userEvent.click(screen.getByText("Soap (2)"));
		expect(screen.getByText("Dove Soap")).toBeInTheDocument();
		expect(screen.getByText("Lux Soap")).toBeInTheDocument();
	});

	it("renders an unclassed item individually, not inside any group", () => {
		const items = [makeItem("bags", "Trash Bags", 1, null)];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("Trash Bags")).toBeInTheDocument();
		expect(screen.queryByText("Soap")).not.toBeInTheDocument();
	});

	// Review Focus: an item whose classKey refers to a class absent from the
	// live `classes` list (archived, deleted, or cross-category) must render
	// individually, not disappear or crash.
	it("renders an item individually when its classKey isn't in the live classes list", () => {
		const items = [makeItem("dove", "Dove Soap", 1, "stale-key")];

		render(
			<ClassGroupedItemList items={items} classes={[]} onItemClick={vi.fn()} />,
		);

		expect(screen.getByText("Dove Soap")).toBeInTheDocument();
	});

	it("calls onItemClick with the clicked item, inside and outside groups", async () => {
		const onItemClick = vi.fn();
		const items = [
			makeItem("dove", "Dove Soap", 1, "soap-key"),
			makeItem("bags", "Trash Bags", 1, null),
		];

		render(
			<ClassGroupedItemList
				items={items}
				classes={[soapClass]}
				onItemClick={onItemClick}
			/>,
		);

		await userEvent.click(screen.getByText("Trash Bags"));
		expect(onItemClick).toHaveBeenCalledWith(items[1]);

		await userEvent.click(screen.getByText("Soap (1)"));
		await userEvent.click(screen.getByText("Dove Soap"));
		expect(onItemClick).toHaveBeenCalledWith(items[0]);
	});
});
