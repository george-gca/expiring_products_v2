import { afterEach, describe, expect, it, vi } from "vitest";
import { message, notification, setFeedbackApis } from "./feedback";

describe("feedback", () => {
	afterEach(() => {
		// Reset the module-level apis so other tests don't see a stale mock
		// from a previous test's setFeedbackApis call.
		setFeedbackApis({
			message: { error: vi.fn(), success: vi.fn() },
			notification: { info: vi.fn() },
		});
	});

	// Must run before any other test in this file calls setFeedbackApis —
	// it's the only point at which the module's api state is still whatever
	// it starts as before Root ever mounts (e.g. a component rendered in
	// isolation in a test, with no <Root> in the tree to wire things up).
	it("no-ops instead of throwing when called before Root has wired up the real apis", () => {
		expect(() => message.error("Something went wrong")).not.toThrow();
		expect(() => message.success("Saved")).not.toThrow();
		expect(() => notification.info({ message: "Title" })).not.toThrow();
	});

	it("delegates message.error to the wired-up api", () => {
		const error = vi.fn();
		setFeedbackApis({
			message: { error, success: vi.fn() },
			notification: { info: vi.fn() },
		});

		message.error("Something went wrong");

		expect(error).toHaveBeenCalledWith("Something went wrong");
	});

	it("delegates message.success to the wired-up api", () => {
		const success = vi.fn();
		setFeedbackApis({
			message: { error: vi.fn(), success },
			notification: { info: vi.fn() },
		});

		message.success("Saved");

		expect(success).toHaveBeenCalledWith("Saved");
	});

	it("delegates notification.info to the wired-up api", () => {
		const info = vi.fn();
		setFeedbackApis({
			message: { error: vi.fn(), success: vi.fn() },
			notification: { info },
		});

		notification.info({ message: "Title", description: "Body" });

		expect(info).toHaveBeenCalledWith({
			message: "Title",
			description: "Body",
		});
	});
});
