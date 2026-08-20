import {
	deleteToken,
	getMessaging,
	getToken,
	isSupported,
	onMessage,
} from "firebase/messaging";
import { app } from "../../lib/firebase";
import { getDeviceId } from "./deviceId";
import { deleteFcmToken, upsertFcmToken } from "./firestoreWrites";

export async function requestNotificationPermission(): Promise<boolean> {
	if (!(await isSupported())) return false;
	const permission = await Notification.requestPermission();
	return permission === "granted";
}

export async function registerForPush(uid: string): Promise<void> {
	const registration = await navigator.serviceWorker.ready;
	const messaging = getMessaging(app);
	const token = await getToken(messaging, {
		vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	await upsertFcmToken(uid, getDeviceId(), token);
}

export async function unregisterFromPush(uid: string): Promise<void> {
	const messaging = getMessaging(app);
	await deleteToken(messaging);
	await deleteFcmToken(uid, getDeviceId());
}

export function onForegroundMessage(
	callback: (title: string, body: string) => void,
): () => void {
	// getMessaging()/onMessage() don't throw synchronously for an unsupported
	// browser — the failure only surfaces once Messaging's internal async
	// support check rejects, as an unhandled rejection a caller's try/catch
	// around this function's own (synchronous) call can never catch. Gating
	// on isSupported() first — same as requestNotificationPermission — avoids
	// that entirely.
	let unsubscribe: (() => void) | undefined;
	let cancelled = false;

	isSupported()
		.then((supported) => {
			if (!supported || cancelled) return;
			const messaging = getMessaging(app);
			unsubscribe = onMessage(messaging, (payload) => {
				callback(
					payload.notification?.title ?? "",
					payload.notification?.body ?? "",
				);
			});
		})
		.catch(() => {
			// Messaging unsupported or failed to initialize — no foreground
			// notifications this session, nothing else to do.
		});

	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}
