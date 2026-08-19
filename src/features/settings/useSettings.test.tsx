import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useSettings } from "./useSettings";

const uid = "test-user-settings-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useSettings", () => {
	it("bootstraps default settings when no settings doc exists", async () => {
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings).toEqual({
			lowStockThreshold: 3,
			language: "pt-br",
			hideDistantThresholdMonths: 3,
		});
	});

	it("does not overwrite an existing settings doc", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 7 });
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(7);
	});

	// Regression test for C2: a non-integer (or otherwise malformed)
	// lowStockThreshold already sitting in Firestore — written here directly
	// via the emulator's setDoc, bypassing the app's own (now-validated)
	// write path, to simulate bad data that predates this fix or a future
	// writer that skips validation — must not leave `loading` stuck at `true`
	// forever. Before the schema.ts `.catch()` fix, parseSettingsDoc would
	// throw inside the onSnapshot success callback (dispatched via a bare
	// setTimeout with no try/catch), which never reaches the error callback,
	// so `loading` would never flip to `false`.
	it("does not get stuck loading when the settings doc has a non-integer threshold", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 2.5 });
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(3);
	});
});
