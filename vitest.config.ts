import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

// vite-plugin-pwa itself isn't loaded for tests (its build-time SW/manifest
// generation has no place in a test run) — this stub only exists so Vite's
// import-analysis can resolve the `virtual:pwa-register/react` specifier in
// src/Root.tsx; vi.mock() in Root.test.tsx replaces its actual content.
const stubPwaRegisterVirtualModule: Plugin = {
  name: "stub-virtual-pwa-register",
  resolveId(id) {
    if (id === "virtual:pwa-register/react") return id;
  },
  load(id) {
    if (id === "virtual:pwa-register/react") return "export const useRegisterSW = () => ({});";
  },
};

export default defineConfig({
  plugins: [react(), stubPwaRegisterVirtualModule],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
    fileParallelism: false,
  },
});
