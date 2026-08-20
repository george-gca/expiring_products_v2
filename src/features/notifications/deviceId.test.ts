import { afterEach, describe, expect, it } from "vitest";
import { getDeviceId } from "./deviceId";

afterEach(() => {
	localStorage.clear();
});

describe("getDeviceId", () => {
	it("generates and persists a device id on first call", () => {
		const id = getDeviceId();
		expect(id).toBeTruthy();
		expect(localStorage.getItem("expiring-products-device-id")).toBe(id);
	});

	it("returns the same id on subsequent calls", () => {
		const first = getDeviceId();
		const second = getDeviceId();
		expect(second).toBe(first);
	});
});
