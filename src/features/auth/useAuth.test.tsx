import { act, renderHook, waitFor } from "@testing-library/react";
import { signOut as firebaseSignOut } from "firebase/auth";
import { afterEach, describe, expect, it } from "vitest";
import { auth } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useAuth } from "./useAuth";

afterEach(async () => {
	await firebaseSignOut(auth);
	await clearFirestoreEmulator("demo-expiring-products");
});

describe("useAuth", () => {
	it("starts with no user and loading true, then loading false once resolved", async () => {
		const { result } = renderHook(() => useAuth());
		expect(result.current.loading).toBe(true);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.user).toBeNull();
	});

	it("signUp then signIn resolves to a non-null user", async () => {
		const { result } = renderHook(() => useAuth());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			await result.current.signUp(
				"household@example.com",
				"correct-horse-battery",
			);
		});
		expect(result.current.user?.email).toBe("household@example.com");

		await act(async () => {
			await result.current.signOut();
		});
		expect(result.current.user).toBeNull();

		await act(async () => {
			await result.current.signIn(
				"household@example.com",
				"correct-horse-battery",
			);
		});
		expect(result.current.user?.email).toBe("household@example.com");
	});
});
