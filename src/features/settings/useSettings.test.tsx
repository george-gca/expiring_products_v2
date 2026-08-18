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
	it("bootstraps the default threshold when no settings doc exists", async () => {
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(3);
	});

	it("does not overwrite an existing settings doc", async () => {
		await setDoc(doc(db, "users", uid), { lowStockThreshold: 7 });
		const { result } = renderHook(() => useSettings(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.settings.lowStockThreshold).toBe(7);
	});
});
