import "../../lib/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../lib/i18n";
import { clearFirestoreEmulator } from "../../test/emulator";
import * as settingsWritesModule from "./firestoreWrites";
import { SettingsPane } from "./SettingsPane";
import type { Settings } from "./schema";

const settings: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
	hideDistantEnabled: true,
	notificationsEnabled: false,
	notifyDaysBeforeExpiry: 3,
	notifyHourLocal: 8,
	notifyTimezone: "America/Sao_Paulo",
};

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("SettingsPane language", () => {
	it("writes the new language and calls i18n.changeLanguage when changed", async () => {
		const updateLanguageSpy = vi
			.spyOn(settingsWritesModule, "updateLanguage")
			.mockResolvedValue(undefined);
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<SettingsPane uid="test-user-settings-ui-1" settings={settings} />);
		await userEvent.click(screen.getByRole("combobox"));
		await userEvent.click(await screen.findByText("English"));

		expect(updateLanguageSpy).toHaveBeenCalledWith(
			"test-user-settings-ui-1",
			"en-us",
		);
		expect(changeLanguageSpy).toHaveBeenCalledWith("en-us");
	});
});

describe("SettingsPane hide-distant threshold", () => {
	it("commits the new threshold immediately when typed, no blur needed", async () => {
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateHideDistantThresholdMonths")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-settings-ui-2" settings={settings} />);
		const input = screen.getByLabelText(/hide items expiring/i);
		// Select the existing text and replace it, rather than clear() + type():
		// clearing this controlled input fires onChange(null), which falls back
		// to displaying the min value, so a plain clear+type would produce "16"
		// instead of "6".
		await userEvent.tripleClick(input);
		await userEvent.keyboard("6");

		expect(updateSpy).toHaveBeenCalledWith("test-user-settings-ui-2", 6);
	});

	it("commits immediately via the stepper's plus button", async () => {
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateHideDistantThresholdMonths")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-settings-ui-2b" settings={settings} />);
		const input = screen.getByLabelText(/hide items expiring/i);
		const stepper = input.closest<HTMLElement>(".ant-space-compact");
		if (!stepper) throw new Error("stepper container not found");
		await userEvent.click(
			within(stepper).getByRole("button", { name: "plus" }),
		);

		expect(updateSpy).toHaveBeenCalledWith("test-user-settings-ui-2b", 4);
	});
});

describe("SettingsPane hide-distant enabled checkbox", () => {
	it("defaults checked when settings.hideDistantEnabled is true, and shows the threshold field", () => {
		render(<SettingsPane uid="test-user-settings-ui-4" settings={settings} />);

		expect(
			screen.getByRole("checkbox", {
				name: /hide items that will take longer/i,
			}),
		).toBeChecked();
		expect(screen.getByLabelText(/hide items expiring/i)).toBeInTheDocument();
	});

	it("unchecking hides the threshold field and persists hideDistantEnabled: false", async () => {
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateHideDistantEnabled")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-settings-ui-5" settings={settings} />);
		await userEvent.click(
			screen.getByRole("checkbox", {
				name: /hide items that will take longer/i,
			}),
		);

		expect(updateSpy).toHaveBeenCalledWith("test-user-settings-ui-5", false);
		expect(
			screen.queryByLabelText(/hide items expiring/i),
		).not.toBeInTheDocument();
	});

	it("renders unchecked and hides the threshold field when settings.hideDistantEnabled is false", () => {
		render(
			<SettingsPane
				uid="test-user-settings-ui-6"
				settings={{ ...settings, hideDistantEnabled: false }}
			/>,
		);

		expect(
			screen.getByRole("checkbox", {
				name: /hide items that will take longer/i,
			}),
		).not.toBeChecked();
		expect(
			screen.queryByLabelText(/hide items expiring/i),
		).not.toBeInTheDocument();
	});
});

describe("SettingsPane categories", () => {
	it("renders the Categories section with the default categories", async () => {
		render(<SettingsPane uid="test-user-settings-ui-3" settings={settings} />);

		await screen.findByText("Foods");
		await screen.findByText("Medicines");
	});
});

describe("SettingsPane classes", () => {
	it("renders the Classes section for the default category", async () => {
		render(<SettingsPane uid="test-user-settings-ui-7" settings={settings} />);

		await screen.findByText("Foods");
		await screen.findByRole("button", { name: /add class/i });
	});
});
