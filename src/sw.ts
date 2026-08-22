/// <reference lib="webworker" />

// vite-plugin-pwa's injectManifest strategy injects the precache list into
// self.__WB_MANIFEST at build time; no ambient type declares this global, so
// it's declared here directly (a standard pattern for this plugin).
declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

// A new service worker installs and waits rather than activating
// immediately — the client (src/Root.tsx's useRegisterSW) only sends this
// message once the user clicks "refresh" on the update prompt, so an
// already-open tab is never swapped out from under it silently.
self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
	const title = payload.notification?.title ?? "Produtos a vencer";
	const body = payload.notification?.body;
	self.registration.showNotification(title, { body });
});
