import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as lookupBarcodeModule from "../barcode/lookupBarcode";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";

vi.mock("../barcode/BarcodeScanner", () => ({
	BarcodeScanner: ({ onDetect }: { onDetect: (barcode: string) => void }) => (
		<button type="button" onClick={() => onDetect("0123456789012")}>
			fake-detect
		</button>
	),
}));

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
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

describe("AddItemModal barcode scanning", () => {
	// Without this, vi.spyOn's call history on the shared lookupBarcode module
	// export leaks across tests in this file (same pattern as Phase 4's
	// SettingsPane i18n flake) — the second test's "not called" assertion
	// would otherwise see the first test's leftover call.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("opens the scanner and pre-fills the name after a successful detect", async () => {
		vi.spyOn(lookupBarcodeModule, "lookupBarcode").mockResolvedValue({
			name: "Whole Milk",
			suggestedDuration: 7,
		});

		render(
			<AddItemModal
				uid="test-user-barcode-modal-1"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(
			screen.getByRole("button", { name: /scan barcode/i }),
		);
		expect(screen.getByText("fake-detect")).toBeInTheDocument();

		await userEvent.click(screen.getByText("fake-detect"));

		await waitFor(() =>
			expect(lookupBarcodeModule.lookupBarcode).toHaveBeenCalledWith(
				"test-user-barcode-modal-1",
				"0123456789012",
				"foods",
			),
		);
		await waitFor(() =>
			expect(screen.getByLabelText(/name/i)).toHaveValue("Whole Milk"),
		);
	});

	it("returns to the form view without looking anything up when scanning is cancelled", async () => {
		const lookupSpy = vi.spyOn(lookupBarcodeModule, "lookupBarcode");

		render(
			<AddItemModal
				uid="test-user-barcode-modal-2"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(
			screen.getByRole("button", { name: /scan barcode/i }),
		);
		await userEvent.click(screen.getByRole("button", { name: /cancel scan/i }));

		expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		expect(lookupSpy).not.toHaveBeenCalled();
	});
});
