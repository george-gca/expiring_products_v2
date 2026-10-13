import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassFormModal } from "./ClassFormModal";
import * as firestoreWritesModule from "./firestoreWrites";
import type { ItemClass } from "./schema";

afterEach(() => {
	vi.restoreAllMocks();
});

const editingClass: ItemClass = {
	id: "class1",
	key: "soap-key",
	category: "cleaning",
	name: "Soap",
	archived: false,
};

describe("ClassFormModal create mode", () => {
	it("calls createClass with the entered name and reports the new key via onCreated", async () => {
		const createSpy = vi
			.spyOn(firestoreWritesModule, "createClass")
			.mockResolvedValue("new-class-key");
		const onClose = vi.fn();
		const onCreated = vi.fn();

		render(
			<ClassFormModal
				uid="test-user-class-form-1"
				category="cleaning"
				open
				onClose={onClose}
				editingClass={null}
				onCreated={onCreated}
			/>,
		);

		await userEvent.type(screen.getByLabelText(/name/i), "Soap");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(createSpy).toHaveBeenCalledWith(
				"test-user-class-form-1",
				"cleaning",
				"Soap",
			),
		);
		expect(onCreated).toHaveBeenCalledWith("new-class-key");
		expect(onClose).toHaveBeenCalled();
	});
});

describe("ClassFormModal rename mode", () => {
	it("pre-fills the existing name and calls renameClass on submit", async () => {
		const renameSpy = vi
			.spyOn(firestoreWritesModule, "renameClass")
			.mockResolvedValue();
		const onClose = vi.fn();

		render(
			<ClassFormModal
				uid="test-user-class-form-2"
				category="cleaning"
				open
				onClose={onClose}
				editingClass={editingClass}
			/>,
		);

		const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
		expect(nameInput.value).toBe("Soap");

		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Bar Soap");
		await userEvent.click(screen.getByRole("button", { name: "OK" }));

		await waitFor(() =>
			expect(renameSpy).toHaveBeenCalledWith(
				"test-user-class-form-2",
				"class1",
				"Bar Soap",
			),
		);
		expect(onClose).toHaveBeenCalled();
	});
});
