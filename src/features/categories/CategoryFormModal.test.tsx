import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryFormModal } from "./CategoryFormModal";
import * as firestoreWritesModule from "./firestoreWrites";
import type { Category } from "./schema";

vi.mock("emoji-picker-react", () => ({
	default: ({
		onEmojiClick,
	}: {
		onEmojiClick: (data: { emoji: string }) => void;
	}) => (
		<button type="button" onClick={() => onEmojiClick({ emoji: "🧊" })}>
			pick-freezer-emoji
		</button>
	),
	EmojiStyle: { NATIVE: "native" },
}));

afterEach(() => {
	vi.restoreAllMocks();
});

const editingCategory: Category = {
	id: "cat1",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

describe("CategoryFormModal create mode", () => {
	it("calls createCategory with the entered name, default icon, and given order", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createCategory")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-1"
				open
				onClose={onClose}
				editingCategory={null}
				nextOrder={2}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-cat-form-1",
				"Freezer",
				"🏷️",
				2,
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});

describe("CategoryFormModal rename mode", () => {
	it("pre-fills the existing name and icon, and calls renameCategory on submit", async () => {
		const renameSpy = vi
			.spyOn(firestoreWritesModule, "renameCategory")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-2"
				open
				onClose={onClose}
				editingCategory={editingCategory}
				nextOrder={1}
			/>,
		);

		const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
		expect(nameInput.value).toBe("Foods");
		expect(screen.getByRole("button", { name: /icon/i })).toHaveTextContent(
			"🍎",
		);

		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Pantry");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(renameSpy).toHaveBeenCalledWith(
				"test-user-cat-form-2",
				"cat1",
				"Pantry",
				"🍎",
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});

describe("CategoryFormModal icon picker", () => {
	it("updates the icon button and submits the newly picked emoji", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createCategory")
			.mockResolvedValue();

		render(
			<CategoryFormModal
				uid="test-user-cat-form-3"
				open
				onClose={vi.fn()}
				editingCategory={null}
				nextOrder={0}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /icon/i }));
		await userEvent.click(
			await screen.findByRole("button", { name: "pick-freezer-emoji" }),
		);
		expect(screen.getByRole("button", { name: /icon/i })).toHaveTextContent(
			"🧊",
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Freezer");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-cat-form-3",
				"Freezer",
				"🧊",
				0,
			),
		);
	});
});
