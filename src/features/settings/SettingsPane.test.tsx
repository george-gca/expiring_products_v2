import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as exportBackupModule from "../backup/exportBackup";
import { SettingsPane } from "./SettingsPane";
import type { Settings } from "./schema";

const settings: Settings = { lowStockThreshold: 3 };

const fixtureBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings,
	categories: [],
	items: [],
	itemHistory: [],
};

describe("SettingsPane export", () => {
	beforeEach(() => {
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn(() => "blob:mock-url"),
			revokeObjectURL: vi.fn(),
		});
	});

	it("builds and downloads a backup file when Export is clicked", async () => {
		const buildBackupSpy = vi
			.spyOn(exportBackupModule, "buildBackup")
			.mockResolvedValue(fixtureBackup);
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		render(<SettingsPane uid="test-user-export-ui" settings={settings} />);
		await userEvent.click(
			screen.getByRole("button", { name: /export backup/i }),
		);

		expect(buildBackupSpy).toHaveBeenCalledWith("test-user-export-ui");
		await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
		expect(URL.createObjectURL).toHaveBeenCalled();
	});
});
