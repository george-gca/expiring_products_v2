import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection, doc, getDoc, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { EditItemModal } from "./EditItemModal";
import type { PantryItem } from "./schema";

const uid = "test-user-5";

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

		render(<EditItemModal uid={uid} item={item} onClose={onClose} />);

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
});
