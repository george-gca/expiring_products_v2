import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
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
	it("commits the new threshold on blur", async () => {
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateHideDistantThresholdMonths")
			.mockResolvedValue(undefined);

		render(<SettingsPane uid="test-user-settings-ui-2" settings={settings} />);
		const input = screen.getByLabelText(/hide items expiring/i);
		// Not userEvent.clear() + type(): clearing this controlled InputNumber
		// fires onChange(null), which this component (matching the existing
		// low-stock-threshold field's established pattern) immediately falls
		// back to displaying "1" for — so a plain clear+type would produce
		// "16", not "6". Select the existing text and replace it instead.
		await userEvent.tripleClick(input);
		await userEvent.keyboard("6");
		await userEvent.tab(); // blur

		expect(updateSpy).toHaveBeenCalledWith("test-user-settings-ui-2", 6);
	});
});

describe("SettingsPane categories", () => {
	it("renders the Categories section with the default categories", async () => {
		render(<SettingsPane uid="test-user-settings-ui-3" settings={settings} />);

		await screen.findByText("Foods");
		await screen.findByText("Medicines");
	});
});
