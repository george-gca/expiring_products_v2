import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { ClassSection } from "./ClassSection";

const uid = "test-user-class-section-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

async function seedCategory(key: string, name: string, emoji: string) {
	await setDoc(doc(db, "users", uid, "categories", key), {
		key,
		name,
		emoji,
		order: key === "foods" ? 0 : 1,
		archived: false,
	});
}

describe("ClassSection", () => {
	it("defaults to the first category and lists its classes", async () => {
		await seedCategory("foods", "Foods", "🍎");
		await seedCategory("cleaning", "Cleaning", "🧼");
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		render(<ClassSection uid={uid} />);

		await screen.findByText("Cheese");
	});

	it("switches the listed classes when a different category is selected", async () => {
		await seedCategory("foods", "Foods", "🍎");
		await seedCategory("cleaning", "Cleaning", "🧼");
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});
		await addDoc(collection(db, "users", uid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		render(<ClassSection uid={uid} />);
		await screen.findByText("Cheese");

		await userEvent.click(screen.getByRole("combobox"));
		await userEvent.click(await screen.findByText("🧼 Cleaning"));

		await screen.findByText("Soap");
		expect(screen.queryByText("Cheese")).not.toBeInTheDocument();
	});

	it("creates a new class under the selected category", async () => {
		await seedCategory("foods", "Foods", "🍎");

		render(<ClassSection uid={uid} />);
		await screen.findByRole("button", { name: /add class/i });

		await userEvent.click(screen.getByRole("button", { name: /add class/i }));
		await userEvent.type(await screen.findByLabelText(/name/i), "Cheese");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await screen.findByText("Cheese");
	});

	it("requires typing the exact class name before archiving it", async () => {
		await seedCategory("foods", "Foods", "🍎");
		const classRef = await addDoc(collection(db, "users", uid, "classes"), {
			key: "cheese-key",
			category: "foods",
			name: "Cheese",
			archived: false,
		});

		render(<ClassSection uid={uid} />);
		await screen.findByText("Cheese");

		await userEvent.click(
			screen.getByRole("button", { name: /delete class/i }),
		);

		const okButton = await screen.findByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "Wrong Name");
		expect(okButton).toBeDisabled();

		await userEvent.clear(screen.getByLabelText(/confirmation/i));
		await userEvent.type(screen.getByLabelText(/confirmation/i), "Cheese");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);

		await waitFor(async () => {
			const classDoc = await getDoc(
				doc(db, "users", uid, "classes", classRef.id),
			);
			expect(classDoc.data()?.archived).toBe(true);
		});
		expect(screen.queryByText("Cheese")).not.toBeInTheDocument();
	});
});
