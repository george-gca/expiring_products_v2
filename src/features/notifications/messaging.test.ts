import * as messagingSdk from "firebase/messaging";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as deviceIdModule from "./deviceId";
import * as firestoreWritesModule from "./firestoreWrites";
import {
	onForegroundMessage,
	registerForPush,
	requestNotificationPermission,
	unregisterFromPush,
} from "./messaging";

vi.mock("firebase/messaging");

afterEach(() => {
	vi.restoreAllMocks();
});

describe("requestNotificationPermission", () => {
	it("returns true when supported and permission is granted", async () => {
		vi.mocked(messagingSdk.isSupported).mockResolvedValue(true);
		Object.defineProperty(globalThis, "Notification", {
			value: { requestPermission: vi.fn().mockResolvedValue("granted") },
			configurable: true,
		});

		await expect(requestNotificationPermission()).resolves.toBe(true);
	});

	it("returns false when messaging is not supported", async () => {
		vi.mocked(messagingSdk.isSupported).mockResolvedValue(false);

		await expect(requestNotificationPermission()).resolves.toBe(false);
	});
});

describe("registerForPush", () => {
	it("gets a token and upserts it for this device", async () => {
		vi.spyOn(deviceIdModule, "getDeviceId").mockReturnValue("device-1");
		const upsertSpy = vi
			.spyOn(firestoreWritesModule, "upsertFcmToken")
			.mockResolvedValue();
		vi.mocked(messagingSdk.getToken).mockResolvedValue("fake-token");
		Object.defineProperty(navigator, "serviceWorker", {
			value: { ready: Promise.resolve({}) },
			configurable: true,
		});

		await registerForPush("uid-1");

		expect(upsertSpy).toHaveBeenCalledWith("uid-1", "device-1", "fake-token");
	});
});

describe("unregisterFromPush", () => {
	it("deletes the FCM token and this device's Firestore doc", async () => {
		vi.spyOn(deviceIdModule, "getDeviceId").mockReturnValue("device-1");
		const deleteSpy = vi
			.spyOn(firestoreWritesModule, "deleteFcmToken")
			.mockResolvedValue();
		vi.mocked(messagingSdk.deleteToken).mockResolvedValue(true);

		await unregisterFromPush("uid-1");

		expect(deleteSpy).toHaveBeenCalledWith("uid-1", "device-1");
	});
});

describe("onForegroundMessage", () => {
	it("invokes the callback with the notification title and body", () => {
		let capturedHandler: ((payload: unknown) => void) | undefined;
		vi.mocked(messagingSdk.onMessage).mockImplementation(
			(_messaging, handler) => {
				capturedHandler = handler as (payload: unknown) => void;
				return () => {};
			},
		);

		const callback = vi.fn();
		onForegroundMessage(callback);
		capturedHandler?.({
			notification: { title: "Milk", body: "Expiring soon" },
		});

		expect(callback).toHaveBeenCalledWith("Milk", "Expiring soon");
	});
});
