// src/features/pantry-items/ShoppingList.test.tsx
import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection, doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { Category } from "../categories/schema";
import { ShoppingList } from "./ShoppingList";
import type { PantryItem } from "./schema";

const uid = "test-user-shopping-list-1";

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

function makeItem(
	name: string,
	quantity: number,
	classKey: string | null = null,
): PantryItem {
	return {
		id: name,
		name,
		category: "foods",
		quantity,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: true,
		barcode: null,
		source: "manual",
		classKey,
	};
}

describe("ShoppingList class entries", () => {
	it("passes classKey (not name) to onAddItem for a classed entry's cart icon", async () => {
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "foods",
			name: "Soap",
			archived: false,
		});
		await setDoc(
			doc(
				db,
				"users",
				uid,
				"item_history",
				encodeURIComponent("foods_Dove Soap"),
			),
			{ name: "Dove Soap", category: "foods", duration: "", recurring: true },
		);
		const onAddItem = vi.fn();

		render(
			<ShoppingList
				uid={uid}
				category={category}
				pantryItems={[makeItem("Dove Soap", 1, "soap-key")]}
				threshold={3}
				onAddItem={onAddItem}
			/>,
		);

		await screen.findByText("Soap");
		await userEvent.click(
			screen.getByRole("button", { name: "shopping-cart" }),
		);

		expect(onAddItem).toHaveBeenCalledWith({
			name: undefined,
			classKey: "soap-key",
		});
	});
});
