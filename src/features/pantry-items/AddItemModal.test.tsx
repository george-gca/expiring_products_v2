import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as barcodeWritesModule from "../barcode/firestoreWrites";
import * as lookupBarcodeModule from "../barcode/lookupBarcode";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";
import * as itemWritesModule from "./firestoreWrites";

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
		expect(screen.getByRole("textbox", { name: /barcode/i })).toHaveValue(
			"0123456789012",
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

describe("AddItemModal manual barcode entry", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("saves a manually typed barcode with the item and caches it for future lookups", async () => {
		vi.spyOn(lookupBarcodeModule, "lookupBarcode").mockResolvedValue(null);
		const addItemSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const upsertSpy = vi
			.spyOn(barcodeWritesModule, "upsertBarcodeProduct")
			.mockResolvedValue(undefined);
		const onClose = vi.fn();

		render(
			<AddItemModal
				uid="test-user-manual-barcode-1"
				category={category}
				open
				onClose={onClose}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Home-made Jam");
		await userEvent.type(
			screen.getByRole("textbox", { name: /barcode/i }),
			"9998887776665",
		);
		await userEvent.type(screen.getByLabelText(/expiring date/i), "2027-01-01");
		await userEvent.keyboard("{Enter}");

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(addItemSpy).toHaveBeenCalled());
		expect(addItemSpy).toHaveBeenCalledWith(
			"test-user-manual-barcode-1",
			expect.objectContaining({
				name: "Home-made Jam",
				barcode: "9998887776665",
				source: "barcode",
			}),
		);
		expect(upsertSpy).toHaveBeenCalledWith(
			"test-user-manual-barcode-1",
			"9998887776665",
			{
				name: "Home-made Jam",
				category: "foods",
				suggestedDuration: null,
				source: "manual",
			},
		);
		expect(onClose).toHaveBeenCalled();
	});

	it("saves with no barcode and skips caching when the field is left blank", async () => {
		const lookupSpy = vi.spyOn(lookupBarcodeModule, "lookupBarcode");
		const addItemSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const upsertSpy = vi
			.spyOn(barcodeWritesModule, "upsertBarcodeProduct")
			.mockResolvedValue(undefined);

		render(
			<AddItemModal
				uid="test-user-manual-barcode-2"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Plain Item");
		await userEvent.type(screen.getByLabelText(/expiring date/i), "2027-01-01");
		await userEvent.keyboard("{Enter}");

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(addItemSpy).toHaveBeenCalled());
		expect(addItemSpy).toHaveBeenCalledWith(
			"test-user-manual-barcode-2",
			expect.objectContaining({ barcode: null, source: "manual" }),
		);
		expect(upsertSpy).not.toHaveBeenCalled();
		expect(lookupSpy).not.toHaveBeenCalled();
	});

	it("looks up and pre-fills the name when a manually typed barcode loses focus", async () => {
		vi.spyOn(lookupBarcodeModule, "lookupBarcode").mockResolvedValue({
			name: "Store-Brand Rice",
			suggestedDuration: 365,
		});

		render(
			<AddItemModal
				uid="test-user-manual-barcode-3"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.type(
			screen.getByRole("textbox", { name: /barcode/i }),
			"1112223334445",
		);
		await userEvent.tab();

		await waitFor(() =>
			expect(lookupBarcodeModule.lookupBarcode).toHaveBeenCalledWith(
				"test-user-manual-barcode-3",
				"1112223334445",
				"foods",
			),
		);
		await waitFor(() =>
			expect(screen.getByLabelText(/name/i)).toHaveValue("Store-Brand Rice"),
		);
		expect(screen.getByLabelText(/duration/i)).toHaveValue("365");
	});

	it("does not look up when the barcode field is blurred empty", async () => {
		const lookupSpy = vi.spyOn(lookupBarcodeModule, "lookupBarcode");

		render(
			<AddItemModal
				uid="test-user-manual-barcode-4"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(screen.getByRole("textbox", { name: /barcode/i }));
		await userEvent.tab();

		expect(lookupSpy).not.toHaveBeenCalled();
	});
});
