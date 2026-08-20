import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	webServer: {
		command: "npm run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		env: { VITE_USE_FIREBASE_EMULATORS: "true" },
	},
	use: {
		baseURL: "http://localhost:5173",
		locale: "pt-BR",
		// Real Chromium's HTMLVideoElement.srcObject setter throws unless the
		// assigned value is an actual MediaStream (unlike jsdom in unit tests,
		// which accepts anything) — so the barcode-scanning e2e case can't just
		// hand getUserMedia a plain mock object. These flags make Chromium's
		// real getUserMedia auto-grant and return a synthetic fake-camera
		// MediaStream instead, satisfying that type check. Only BarcodeDetector
		// still needs a JS-level mock (see the e2e test's addInitScript).
		permissions: ["camera"],
		launchOptions: {
			args: [
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
			],
		},
	},
});
