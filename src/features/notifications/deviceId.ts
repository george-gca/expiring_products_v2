const DEVICE_ID_STORAGE_KEY = "expiring-products-device-id";

export function getDeviceId(): string {
	const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
	if (existing) return existing;
	const deviceId = crypto.randomUUID();
	localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
	return deviceId;
}
