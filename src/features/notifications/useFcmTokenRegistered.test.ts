import { renderHook, waitFor } from "@testing-library/react";
import { doc, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { getDeviceId } from "./deviceId";
import { useFcmTokenRegistered } from "./useFcmTokenRegistered";

const uid = "test-user-fcm-registered-1";

afterEach(async () => {
	localStorage.clear();
	await clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID);
});

describe("useFcmTokenRegistered", () => {
	it("reports not registered when this device has no fcm_tokens doc", async () => {
		const { result } = renderHook(() => useFcmTokenRegistered(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.registered).toBe(false);
	});

	it("reports registered once this device's fcm_tokens doc exists", async () => {
		const deviceId = getDeviceId();
		await setDoc(doc(db, "users", uid, "fcm_tokens", deviceId), {
			token: "token-abc",
			updatedAt: new Date(),
		});

		const { result } = renderHook(() => useFcmTokenRegistered(uid));
		await waitFor(() => expect(result.current.registered).toBe(true));
	});

	it("ignores another device's fcm_tokens doc", async () => {
		await setDoc(doc(db, "users", uid, "fcm_tokens", "some-other-device"), {
			token: "token-abc",
			updatedAt: new Date(),
		});

		const { result } = renderHook(() => useFcmTokenRegistered(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.registered).toBe(false);
	});
});
