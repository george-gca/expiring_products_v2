import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
};

// Regression test for I1: opening Add Item from the shopping list's
// cart-icon flow (initialRecurring=true) must default the recurring switch
// on, not always false — otherwise submitting it re-triggers C1's clobber
// even after that fix, because the form itself would report recurring:false.
describe("AddItemModal", () => {
	it("defaults the recurring switch on when opened with initialRecurring", () => {
		render(
			<AddItemModal
				uid="test-user-add-modal-1"
				category={category}
				open
				onClose={vi.fn()}
				initialName="Oat Milk"
				initialRecurring
			/>,
		);

		expect(screen.getByRole("switch", { name: /recurring/i })).toBeChecked();
	});

	it("defaults the recurring switch off when opened without initialRecurring", () => {
		render(
			<AddItemModal
				uid="test-user-add-modal-2"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("switch", { name: /recurring/i }),
		).not.toBeChecked();
	});
});
