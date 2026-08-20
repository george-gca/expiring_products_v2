import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { Messaging } from "firebase-admin/messaging";
import { afterAll, describe, expect, it, vi } from "vitest";
import { runDailyNotifications } from "./run.js";

// A hardcoded, test-only project id — deliberately isolated from the
// client SDK's VITE_FIREBASE_PROJECT_ID and its clearFirestoreEmulator
// convention (see this plan's Global Constraints).
const app = initializeApp({ projectId: "notifications-script-test" });
const db = getFirestore(app);

afterAll(async () => {
	await deleteApp(app);
});

describe("runDailyNotifications", () => {
	it("sends a digest and stamps lastNotifiedAt only for due items", async () => {
		const uid = "household-1";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const now = new Date("2026-01-15T11:00:00Z"); // 08:00 America/Sao_Paulo

		const dueItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("due-item");
		await dueItemRef.set({
			name: "Leite",
			opened: false,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: null,
		});

		const recentItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("recent-item");
		await recentItemRef.set({
			name: "Ovos",
			opened: false,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: Timestamp.fromDate(new Date("2026-01-14T00:00:00Z")),
		});

		const openedItemRef = db
			.collection("users")
			.doc(uid)
			.collection("items")
			.doc("opened-item");
		await openedItemRef.set({
			name: "Queijo",
			opened: true,
			expiring_date: Timestamp.fromDate(new Date("2026-01-16T00:00:00Z")),
			last_notified_at: null,
		});

		await db
			.collection("users")
			.doc(uid)
			.collection("fcm_tokens")
			.doc("device-1")
			.set({ token: "fake-token-1" });

		const send = vi.fn().mockResolvedValue("message-id");
		const messaging = { send } as unknown as Messaging;

		await runDailyNotifications(db, messaging, now);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				token: "fake-token-1",
				notification: expect.objectContaining({
					body: expect.stringContaining("Leite"),
				}),
			}),
		);

		const updatedDueItem = await dueItemRef.get();
		expect(updatedDueItem.data()?.last_notified_at).toBeTruthy();

		const updatedRecentItem = await recentItemRef.get();
		const recentItemData = updatedRecentItem.data();
		if (!recentItemData) throw new Error("expected recent-item to exist");
		expect((recentItemData.last_notified_at as Timestamp).toDate()).toEqual(
			new Date("2026-01-14T00:00:00Z"),
		); // unchanged — still within dedup window
	});

	it("sends nothing when notificationsEnabled is false", async () => {
		const uid = "household-2";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: false,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const send = vi.fn().mockResolvedValue("message-id");
		await runDailyNotifications(
			db,
			{ send } as unknown as Messaging,
			new Date("2026-01-15T11:00:00Z"),
		);

		expect(send).not.toHaveBeenCalled();
	});

	it("sends nothing when the current hour doesn't match notifyHourLocal", async () => {
		const uid = "household-3";
		await db.collection("users").doc(uid).set({
			notificationsEnabled: true,
			notifyDaysBeforeExpiry: 3,
			notifyHourLocal: 8,
			notifyTimezone: "America/Sao_Paulo",
			language: "pt-br",
		});

		const send = vi.fn().mockResolvedValue("message-id");
		await runDailyNotifications(
			db,
			{ send } as unknown as Messaging,
			new Date("2026-01-15T12:00:00Z"), // 09:00 local, not 08:00
		);

		expect(send).not.toHaveBeenCalled();
	});
});
