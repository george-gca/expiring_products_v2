import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	webServer: {
		command: "npm run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		env: { VITE_USE_FIREBASE_EMULATORS: "true" },
	},
	use: { baseURL: "http://localhost:5173", locale: "pt-BR" },
});
