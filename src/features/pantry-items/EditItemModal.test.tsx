import "../../lib/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	Timestamp,
} from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { Category } from "../categories/schema";
import { EditItemModal } from "./EditItemModal";
import type { PantryItem } from "./schema";

const uid = "test-user-5";

const categories: Category[] = [
	{
		id: "foods-id",
		key: "foods",
		name: "Foods",
		emoji: "🍎",
		order: 0,
		archived: false,
	},
	{
		id: "medicines-id",
		key: "medicines",
		name: "Medicines",
		emoji: "💊",
		order: 1,
		archived: false,
	},
];

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("EditItemModal", () => {
	it("rejects opened+consumed+discarded exceeding quantity without writing anything to Firestore", async () => {
		const user = userEvent.setup();
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Butter",
			category: "foods",
			quantity: 3,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		const item: PantryItem = {
			id: original.id,
			name: "Butter",
			category: "foods",
			quantity: 3,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};
		const onClose = vi.fn();

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={onClose}
			/>,
		);

		// Fields render in JSX order: opened, consumed, discarded. Each is
		// individually capped at item.quantity (3), but their sum is not
		// cross-validated client-side by antd, so 2 + 2 = 4 > 3 is reachable.
		const [openedInput, consumedInput] = screen.getAllByRole("spinbutton");
		await user.clear(openedInput);
		await user.type(openedInput, "2");
		await user.clear(consumedInput);
		await user.type(consumedInput, "2");

		// Also toggle recurring, mirroring the reported scenario: the write
		// this would trigger (setItemRecurring) must not fire either.
		await user.click(screen.getByRole("switch", { name: /recurring/i }));

		await user.click(screen.getByRole("button", { name: "OK" }));

		// The invalid-sum guard should short-circuit before either write
		// function runs, so the modal never calls onClose.
		await waitFor(() => expect(onClose).not.toHaveBeenCalled());

		const itemDoc = await getDoc(doc(db, "users", uid, "items", original.id));
		expect(itemDoc.exists()).toBe(true);
		expect(itemDoc.data()?.quantity).toBe(3);
		expect(itemDoc.data()?.recurring).toBe(false);

		const historyDoc = await getDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Butter")),
		);
		expect(historyDoc.exists()).toBe(false);
	});

	// Regression test for I1: item_history.recurring is the authoritative
	// per-item-type flag and can disagree with a given purchase instance's own
	// `recurring` field (e.g. an earlier non-recurring purchase of an item
	// type that was later marked recurring). The switch must seed from
	// item_history, not from item.recurring.
	it("seeds the recurring switch from item_history rather than the item's own recurring field", async () => {
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Yogurt",
			category: "foods",
			quantity: 2,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		await setDoc(
			doc(db, "users", uid, "item_history", encodeURIComponent("foods_Yogurt")),
			{ name: "Yogurt", category: "foods", duration: "", recurring: true },
		);
		const item: PantryItem = {
			id: original.id,
			name: "Yogurt",
			category: "foods",
			quantity: 2,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={vi.fn()}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByRole("switch", { name: /recurring/i })).toBeChecked(),
		);
	});
});

describe("EditItemModal details editing", () => {
	it("corrects the name and expiring date via a direct field edit, touching neither item_history nor waste_events", async () => {
		const user = userEvent.setup();
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Bananas",
			category: "foods",
			quantity: 2,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		const item: PantryItem = {
			id: original.id,
			name: "Bananas",
			category: "foods",
			quantity: 2,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};
		const onClose = vi.fn();

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={onClose}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /fix item details/i }));

		const nameInput = screen.getByLabelText(/^name$/i);
		await user.clear(nameInput);
		await user.type(nameInput, "Ripe Bananas");

		const dateInput = screen.getByLabelText(/expiring date/i);
		await user.clear(dateInput);
		// Locale resolves to en-US in this test environment (MM/DD/YY): raw
		// digits parse via the separator-free MMDDYY fallback format (see
		// dateFormat.ts) — "020127" is Feb 1, 2027.
		await user.type(dateInput, "020127");
		await user.keyboard("{Enter}");

		await user.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const itemDoc = await getDoc(doc(db, "users", uid, "items", original.id));
		expect(itemDoc.data()?.name).toBe("Ripe Bananas");
		expect(
			itemDoc.data()?.expiring_date.toDate().toISOString().slice(0, 10),
		).toBe("2027-02-01");

		const historyDoc = await getDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("foods_Bananas"),
			),
		);
		expect(historyDoc.exists()).toBe(false);

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(0);
	});
});

describe("EditItemModal delete", () => {
	it("deletes the item doc without writing a waste_events entry, so a mis-entered item is excluded from stats", async () => {
		const user = userEvent.setup();
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Added By Mistake",
			category: "foods",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2020-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		const item: PantryItem = {
			id: original.id,
			name: "Added By Mistake",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2020-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};
		const onClose = vi.fn();

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={onClose}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /delete/i }));
		const popup = await screen.findByRole("tooltip");
		await user.click(within(popup).getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const itemDoc = await getDoc(doc(db, "users", uid, "items", original.id));
		expect(itemDoc.exists()).toBe(false);

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(0);
	});
});

describe("EditItemModal date picker mobile behavior", () => {
	it("sets a numeric inputmode on the expiring date field so mobile shows the numeric keypad", async () => {
		const user = userEvent.setup();
		const item: PantryItem = {
			id: "item-1",
			name: "Butter",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /fix item details/i }));

		const dateInput = screen.getByLabelText(/expiring date/i);
		expect(dateInput).toHaveAttribute("inputmode", "numeric");
		expect(dateInput).toHaveAttribute("pattern", "[0-9]*");
	});

	it("does not open the calendar panel when the date field itself is clicked", async () => {
		const user = userEvent.setup();
		const item: PantryItem = {
			id: "item-2",
			name: "Butter",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /fix item details/i }));
		await user.click(screen.getByLabelText(/expiring date/i));

		expect(
			document.querySelector(".ant-picker-dropdown"),
		).not.toBeInTheDocument();
	});

	it("opens the calendar panel above the date field when the calendar icon is clicked", async () => {
		const user = userEvent.setup();
		const item: PantryItem = {
			id: "item-3",
			name: "Butter",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /fix item details/i }));

		// The calendar icon itself has `pointer-events: none` (antd renders it
		// purely decorative, `aria-hidden`), so a real tap on it actually lands
		// on the wrapper behind it — reproduce that by clicking the wrapper
		// rather than the icon span.
		const pickerInputWrapper = document.querySelector(".ant-picker-input");
		if (!pickerInputWrapper) throw new Error("date picker wrapper not found");
		await user.click(pickerInputWrapper);

		const dropdown = document.querySelector(".ant-picker-dropdown");
		expect(dropdown).toHaveClass("ant-picker-dropdown-placement-topLeft");
	});
});

describe("EditItemModal move to another category", () => {
	it("moves the item to a different category via the details form", async () => {
		const user = userEvent.setup();
		const itemsRef = collection(db, "users", uid, "items");
		const original = await addDoc(itemsRef, {
			name: "Aspirin",
			category: "foods",
			quantity: 1,
			expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		});
		const item: PantryItem = {
			id: original.id,
			name: "Aspirin",
			category: "foods",
			quantity: 1,
			expiringDate: new Date("2027-01-01"),
			duration: null,
			dateOpened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
		};
		const onClose = vi.fn();

		render(
			<EditItemModal
				uid={uid}
				item={item}
				categories={categories}
				onClose={onClose}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /fix item details/i }));
		await user.click(screen.getByLabelText(/^category$/i));
		await user.click(await screen.findByText("💊 Medicines"));

		await user.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const itemDoc = await getDoc(doc(db, "users", uid, "items", original.id));
		expect(itemDoc.data()?.category).toBe("medicines");
	});
});
