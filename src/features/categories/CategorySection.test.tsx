import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { CategorySection } from "./CategorySection";

const uid = "test-user-cat-section-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

async function seedCategory(
	key: string,
	name: string,
	emoji: string,
	order: number,
) {
	await setDoc(doc(db, "users", uid, "categories", key), {
		key,
		name,
		emoji,
		order,
		archived: false,
	});
}

describe("CategorySection reorder", () => {
	it("swaps order when moving a category down", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);
		await seedCategory("medicines", "Medicines", "💊", 1);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		const moveDownButtons = screen.getAllByRole("button", {
			name: /move down/i,
		});
		await userEvent.click(moveDownButtons[0]);

		await waitFor(async () => {
			const foodsDoc = await getDoc(
				doc(db, "users", uid, "categories", "foods"),
			);
			expect(foodsDoc.data()?.order).toBe(1);
		});
		const medicinesDoc = await getDoc(
			doc(db, "users", uid, "categories", "medicines"),
		);
		expect(medicinesDoc.data()?.order).toBe(0);
	});
});

describe("CategorySection delete", () => {
	it("disables delete when only one category remains", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		expect(
			screen.getByRole("button", { name: /delete category/i }),
		).toBeDisabled();
	});

	it("requires typing the exact category name before archiving it", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);
		await seedCategory("medicines", "Medicines", "💊", 1);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		const deleteButtons = screen.getAllByRole("button", {
			name: /delete category/i,
		});
		await userEvent.click(deleteButtons[0]);

		const okButton = await screen.findByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "Wrong Name");
		expect(okButton).toBeDisabled();

		await userEvent.clear(screen.getByLabelText(/confirmation/i));
		await userEvent.type(screen.getByLabelText(/confirmation/i), "Foods");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);

		await waitFor(async () => {
			const foodsDoc = await getDoc(
				doc(db, "users", uid, "categories", "foods"),
			);
			expect(foodsDoc.data()?.archived).toBe(true);
		});
		expect(screen.queryByText("Foods")).not.toBeInTheDocument();
	});
});

describe("CategorySection add", () => {
	it("creates a new category appended after the current highest order", async () => {
		await seedCategory("foods", "Foods", "🍎", 0);

		render(<CategorySection uid={uid} />);
		await screen.findByText("Foods");

		await userEvent.click(
			screen.getByRole("button", { name: /add category/i }),
		);
		await userEvent.type(await screen.findByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await screen.findByText("Freezer");
		const snapshot = await getDocs(collection(db, "users", uid, "categories"));
		const freezer = snapshot.docs.find((d) => d.data().name === "Freezer");
		expect(freezer?.data().order).toBe(1);
	});
});
