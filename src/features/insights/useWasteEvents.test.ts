import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useWasteEvents } from "./useWasteEvents";

const uid = "test-user-waste-events-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useWasteEvents", () => {
	it("returns parsed waste_events docs", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "foods",
			was_opened: false,
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});

		const { result } = renderHook(() => useWasteEvents(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.events).toHaveLength(1);
		expect(result.current.events[0].category).toBe("foods");
		expect(result.current.events[0].consumed).toBe(1);
	});

	it("skips a malformed waste_events doc instead of wedging loading at true", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "foods",
			was_opened: "not-a-boolean",
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: Timestamp.now(),
		});

		const { result } = renderHook(() => useWasteEvents(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.events).toHaveLength(0);
	});
});
