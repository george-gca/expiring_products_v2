import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as messagingModule from "../notifications/messaging";
import * as settingsWritesModule from "./firestoreWrites";
import { NotificationSection } from "./NotificationSection";
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("NotificationSection", () => {
	it("registers for push and enables notifications when permission is granted", async () => {
		vi.spyOn(
			messagingModule,
			"requestNotificationPermission",
		).mockResolvedValue(true);
		const registerSpy = vi
			.spyOn(messagingModule, "registerForPush")
			.mockResolvedValue();
		vi.spyOn(settingsWritesModule, "updateNotifyHourLocal").mockResolvedValue();
		const enableSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(<NotificationSection uid="test-user-notif-1" settings={settings} />);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		await waitFor(() =>
			expect(registerSpy).toHaveBeenCalledWith("test-user-notif-1"),
		);
		expect(enableSpy).toHaveBeenCalledWith("test-user-notif-1", true);
	});

	it("shows an inline message and does not register when permission is denied", async () => {
		vi.spyOn(
			messagingModule,
			"requestNotificationPermission",
		).mockResolvedValue(false);
		const registerSpy = vi
			.spyOn(messagingModule, "registerForPush")
			.mockResolvedValue();

		render(<NotificationSection uid="test-user-notif-2" settings={settings} />);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		expect(await screen.findByText(/permiss/i)).toBeInTheDocument();
		expect(registerSpy).not.toHaveBeenCalled();
	});

	it("unregisters and disables notifications when toggled off", async () => {
		const unregisterSpy = vi
			.spyOn(messagingModule, "unregisterFromPush")
			.mockResolvedValue();
		const disableSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(
			<NotificationSection
				uid="test-user-notif-3"
				settings={{ ...settings, notificationsEnabled: true }}
			/>,
		);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		await waitFor(() =>
			expect(unregisterSpy).toHaveBeenCalledWith("test-user-notif-3"),
		);
		expect(disableSpy).toHaveBeenCalledWith("test-user-notif-3", false);
	});
});
