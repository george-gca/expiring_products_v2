import "../../lib/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { getDeviceId } from "../notifications/deviceId";
import * as notificationsWritesModule from "../notifications/firestoreWrites";
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

afterEach(async () => {
	vi.restoreAllMocks();
	localStorage.clear();
	await clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID);
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
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: /notifica/i }),
			).not.toBeChecked(),
		);
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
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: /notifica/i }),
			).not.toBeChecked(),
		);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		expect(await screen.findByText(/permiss/i)).toBeInTheDocument();
		expect(registerSpy).not.toHaveBeenCalled();
	});

	it("unregisters this device and keeps the account enabled when another device is still registered", async () => {
		const uid = "test-user-notif-3";
		await setDoc(doc(db, "users", uid, "fcm_tokens", getDeviceId()), {
			token: "token-this-device",
			updatedAt: new Date(),
		});
		const unregisterSpy = vi
			.spyOn(messagingModule, "unregisterFromPush")
			.mockResolvedValue();
		vi.spyOn(notificationsWritesModule, "hasAnyFcmToken").mockResolvedValue(
			true,
		);
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(
			<NotificationSection
				uid={uid}
				settings={{ ...settings, notificationsEnabled: true }}
			/>,
		);
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: /notifica/i })).toBeChecked(),
		);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		await waitFor(() => expect(unregisterSpy).toHaveBeenCalledWith(uid));
		expect(updateSpy).toHaveBeenCalledWith(uid, true);
	});

	it("disables the account when unregistering this device leaves no devices registered", async () => {
		const uid = "test-user-notif-4";
		await setDoc(doc(db, "users", uid, "fcm_tokens", getDeviceId()), {
			token: "token-this-device",
			updatedAt: new Date(),
		});
		vi.spyOn(messagingModule, "unregisterFromPush").mockResolvedValue();
		vi.spyOn(notificationsWritesModule, "hasAnyFcmToken").mockResolvedValue(
			false,
		);
		const updateSpy = vi
			.spyOn(settingsWritesModule, "updateNotificationsEnabled")
			.mockResolvedValue();

		render(
			<NotificationSection
				uid={uid}
				settings={{ ...settings, notificationsEnabled: true }}
			/>,
		);
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: /notifica/i })).toBeChecked(),
		);
		await userEvent.click(screen.getByRole("switch", { name: /notifica/i }));

		await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(uid, false));
	});
});
