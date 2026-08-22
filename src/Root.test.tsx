import "./lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Root } from "./Root";

vi.mock("./App", () => ({ App: () => null }));

const { needRefresh, updateServiceWorker } = vi.hoisted(() => ({
	needRefresh: { current: false },
	updateServiceWorker: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
	useRegisterSW: () => ({
		needRefresh: [needRefresh.current, vi.fn()],
		offlineReady: [false, vi.fn()],
		updateServiceWorker,
	}),
}));

describe("Root update prompt", () => {
	it("shows nothing when no update is available", () => {
		needRefresh.current = false;
		render(<Root />);
		expect(
			screen.queryByText(/new version available/i),
		).not.toBeInTheDocument();
	});

	it("shows a refresh prompt and calls updateServiceWorker on click", async () => {
		needRefresh.current = true;
		render(<Root />);

		expect(
			await screen.findByText(/new version available/i),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

		expect(updateServiceWorker).toHaveBeenCalledWith(true);
	});
});
