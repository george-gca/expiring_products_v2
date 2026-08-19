import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as exportBackupModule from "../backup/exportBackup";
import * as importBackupModule from "../backup/importBackup";
import { BackupSection } from "./BackupSection";

const fixtureBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 3,
		language: "pt-br" as const,
		hideDistantThresholdMonths: 3,
	},
	categories: [],
	items: [],
	itemHistory: [],
};

describe("BackupSection export", () => {
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

		render(<BackupSection uid="test-user-export-ui" />);
		await userEvent.click(
			screen.getByRole("button", { name: /export backup/i }),
		);

		expect(buildBackupSpy).toHaveBeenCalledWith("test-user-export-ui");
		await vi.waitFor(() => expect(clickSpy).toHaveBeenCalled());
		expect(URL.createObjectURL).toHaveBeenCalled();
	});
});

const fixtureImportBackup = {
	version: 1 as const,
	exportedAt: "2026-08-19T00:00:00.000Z",
	settings: {
		lowStockThreshold: 5,
		language: "en-us" as const,
		hideDistantThresholdMonths: 3,
	},
	categories: [{ key: "foods", name: "Foods", emoji: "🍎", order: 0 }],
	items: [],
	itemHistory: [],
};

describe("BackupSection import", () => {
	it("shows an error for a non-JSON file and does not open the confirm modal", async () => {
		render(<BackupSection uid="test-user-import-ui-1" />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File(["not json"], "backup.json", { type: "application/json" }),
		);

		expect(
			await screen.findByText(/doesn't look like a valid backup file/i),
		).toBeInTheDocument();
		expect(screen.queryByText(/replace all data/i)).not.toBeInTheDocument();
	});

	it("rejects an unsupported backup version without opening the confirm modal", async () => {
		render(<BackupSection uid="test-user-import-ui-2" />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File(
				[JSON.stringify({ ...fixtureImportBackup, version: 2 })],
				"backup.json",
				{ type: "application/json" },
			),
		);

		expect(
			await screen.findByText(/newer version of the app/i),
		).toBeInTheDocument();
		expect(screen.queryByText(/replace all data/i)).not.toBeInTheDocument();
	});

	it("requires typing the confirm word before Import is enabled, then calls importBackup", async () => {
		const importBackupSpy = vi
			.spyOn(importBackupModule, "importBackup")
			.mockResolvedValue(undefined);

		render(<BackupSection uid="test-user-import-ui-3" />);
		const input = screen.getByLabelText(/import backup/i);
		await userEvent.upload(
			input,
			new File([JSON.stringify(fixtureImportBackup)], "backup.json", {
				type: "application/json",
			}),
		);

		expect(await screen.findByText(/replace all data/i)).toBeInTheDocument();
		const okButton = screen.getByRole("button", { name: "OK" });
		expect(okButton).toBeDisabled();

		await userEvent.type(screen.getByLabelText(/confirmation/i), "replace");
		expect(okButton).toBeEnabled();

		await userEvent.click(okButton);
		expect(importBackupSpy).toHaveBeenCalledWith(
			"test-user-import-ui-3",
			fixtureImportBackup,
		);
	});
});
