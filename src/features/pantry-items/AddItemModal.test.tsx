import "../../lib/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as barcodeWritesModule from "../barcode/firestoreWrites";
import * as lookupBarcodeModule from "../barcode/lookupBarcode";
import type { Category } from "../categories/schema";
import * as classWritesModule from "../classes/firestoreWrites";
import type { ItemClass } from "../classes/schema";
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
				classes={[]}
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
				classes={[]}
			/>,
		);

		expect(
			screen.getByRole("switch", { name: /recurring/i }),
		).not.toBeChecked();
	});
});

describe("AddItemModal no expiration date", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("hides the expiring date and duration fields when 'no expiration' is checked, and submits with both null", async () => {
		const addItemSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);

		render(
			<AddItemModal
				uid="test-user-no-expiration-1"
				category={category}
				open
				onClose={vi.fn()}
				classes={[]}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Trash Bags");
		await userEvent.click(
			screen.getByRole("checkbox", { name: /no expiration/i }),
		);

		expect(screen.queryByLabelText(/expiring date/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/duration/i)).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(addItemSpy).toHaveBeenCalled());
		expect(addItemSpy).toHaveBeenCalledWith(
			"test-user-no-expiration-1",
			expect.objectContaining({ expiringDate: null, duration: null }),
		);
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
				classes={[]}
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
				classes={[]}
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
				classes={[]}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Home-made Jam");
		await userEvent.type(
			screen.getByRole("textbox", { name: /barcode/i }),
			"9998887776665",
		);
		// The DatePicker uses a digit-only cell mask (DD/MM/YY for pt-BR, the
		// test's default locale) — no "/" typed, matching the new input-mask
		// behavior. "010127" fills as 01/01/27.
		await userEvent.type(screen.getByLabelText(/expiring date/i), "010127");
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
				classes={[]}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Plain Item");
		await userEvent.type(screen.getByLabelText(/expiring date/i), "010127");
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
				classes={[]}
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
				classes={[]}
			/>,
		);

		await userEvent.click(screen.getByRole("textbox", { name: /barcode/i }));
		await userEvent.tab();

		expect(lookupSpy).not.toHaveBeenCalled();
	});
});

describe("AddItemModal class field", () => {
	const soapClass: ItemClass = {
		id: "class1",
		key: "soap-key",
		category: "foods",
		name: "Soap",
		archived: false,
	};

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("pre-selects the class passed via initialClassKey", () => {
		render(
			<AddItemModal
				uid="test-user-add-modal-class-1"
				category={category}
				open
				onClose={vi.fn()}
				classes={[soapClass]}
				initialClassKey="soap-key"
			/>,
		);

		expect(screen.getByText("Soap")).toBeInTheDocument();
	});

	// Review Focus: a class entry's cart icon pre-fills classKey but leaves
	// name blank — the required-name validation must still block submission.
	it("blocks submission when only the class is pre-filled and no name is typed", async () => {
		const addSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const onClose = vi.fn();

		render(
			<AddItemModal
				uid="test-user-add-modal-class-2"
				category={category}
				open
				onClose={onClose}
				classes={[soapClass]}
				initialClassKey="soap-key"
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).not.toHaveBeenCalled());
		expect(addSpy).not.toHaveBeenCalled();
	});

	it("creates a new class inline and submits the item with its key", async () => {
		const createSpy = vi
			.spyOn(classWritesModule, "createClass")
			.mockResolvedValue("new-class-key");
		const addSpy = vi
			.spyOn(itemWritesModule, "addItem")
			.mockResolvedValue(undefined);
		const onClose = vi.fn();

		render(
			<AddItemModal
				uid="test-user-add-modal-class-3"
				category={category}
				open
				onClose={onClose}
				classes={[]}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/^name$/i), "Lux Soap");
		await userEvent.click(screen.getByLabelText(/class/i));
		await userEvent.click(await screen.findByText(/create.*class/i));

		// Disambiguate from the item's own "Name" field, which is still on
		// screen behind the nested ClassFormModal. Two things the brief's
		// literal selector didn't anticipate:
		// 1. `within(getByRole("dialog", { name: /add class/i }))` doesn't
		//    work: antd's bundled `@rc-component/util` useId hook hardcodes
		//    every generated id to the literal "test-id" whenever
		//    `NODE_ENV === "test"` (confirmed in its sourcemap), so both this
		//    modal and the parent's share `aria-labelledby="test-id"` — the
		//    accessible-name lookup always resolves to whichever modal is
		//    first in the DOM, regardless of the name regex. Locating by the
		//    title's literal text content and walking up to its dialog
		//    container sidesteps that collision.
		// 2. Even once scoped to the right dialog, `within(dialog).getByLabelText`
		//    still fails: both forms use `Form.Item name="name"`, which antd
		//    renders as a literal `id="name"` in both — a real duplicate id.
		//    `within()` only scopes the *label* search; resolving the label's
		//    associated control still walks the whole document for a node
		//    matching that id and can return the wrong input. Querying by
		//    role instead (exactly one textbox inside this dialog) avoids id
		//    resolution altogether.
		const classTitle = await screen.findByText("Add class", {
			selector: ".ant-modal-title",
		});
		const classDialog = classTitle.closest('[role="dialog"]');
		if (!classDialog) throw new Error("Add class dialog not found");
		const classNameInput = within(classDialog as HTMLElement).getByRole(
			"textbox",
		);
		await userEvent.type(classNameInput, "Soap");
		await userEvent.click(
			within(classDialog).getByRole("button", { name: "OK" }),
		);

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-add-modal-class-3",
				"foods",
				"Soap",
			),
		);

		// The brief's literal test never fills the expiring date, but that
		// field is required (same `rules={[{ required: true }]}` the
		// "no expiration" and manual-barcode tests above also have to
		// satisfy) — without it, `form.validateFields()` in `handleOk`
		// rejects and `addItem` is never called, so this submission would
		// otherwise hang until the test times out.
		await userEvent.type(screen.getByLabelText(/expiring date/i), "010127");
		await userEvent.keyboard("{Enter}");

		// Scope this click to the "Add Item" dialog specifically rather than a
		// bare `getByRole("button", { name: "OK" })`: a close-animation delay
		// (rc-motion's exit transition doesn't resolve synchronously under
		// jsdom) can leave the now-closing ClassFormModal's own "OK" button
		// in the DOM a little longer, which would otherwise make that query
		// ambiguous.
		const addItemTitle = screen.getByText("Add Item", {
			selector: ".ant-modal-title",
		});
		const addItemDialog = addItemTitle.closest('[role="dialog"]');
		if (!addItemDialog) throw new Error("Add Item dialog not found");
		await userEvent.click(
			within(addItemDialog as HTMLElement).getByRole("button", { name: "OK" }),
		);

		await waitFor(() =>
			expect(addSpy).toHaveBeenCalledWith(
				"test-user-add-modal-class-3",
				expect.objectContaining({ classKey: "new-class-key" }),
			),
		);
	});
});

describe("AddItemModal date picker mobile behavior", () => {
	it("sets a numeric inputmode on the expiring date field so mobile shows the numeric keypad", () => {
		render(
			<AddItemModal
				uid="test-user-date-mobile-1"
				category={category}
				open
				onClose={vi.fn()}
				classes={[]}
			/>,
		);

		const dateInput = screen.getByLabelText(/expiring date/i);
		expect(dateInput).toHaveAttribute("inputmode", "numeric");
		expect(dateInput).toHaveAttribute("pattern", "[0-9]*");
	});

	it("does not open the calendar panel when the date field itself is clicked", async () => {
		render(
			<AddItemModal
				uid="test-user-date-mobile-2"
				category={category}
				open
				onClose={vi.fn()}
				classes={[]}
			/>,
		);

		await userEvent.click(screen.getByLabelText(/expiring date/i));

		expect(
			document.querySelector(".ant-picker-dropdown"),
		).not.toBeInTheDocument();
	});

	it("opens the calendar panel above the date field when the calendar icon is clicked", async () => {
		render(
			<AddItemModal
				uid="test-user-date-mobile-3"
				category={category}
				open
				onClose={vi.fn()}
				classes={[]}
			/>,
		);

		// The calendar icon itself has `pointer-events: none` (antd renders it
		// purely decorative, `aria-hidden`), so a real tap on it actually lands
		// on the wrapper behind it — reproduce that by clicking the wrapper
		// rather than the icon span.
		const pickerInputWrapper = document.querySelector(".ant-picker-input");
		if (!pickerInputWrapper) throw new Error("date picker wrapper not found");
		await userEvent.click(pickerInputWrapper);

		const dropdown = document.querySelector(".ant-picker-dropdown");
		expect(dropdown).toHaveClass("ant-picker-dropdown-placement-topLeft");
	});
});
