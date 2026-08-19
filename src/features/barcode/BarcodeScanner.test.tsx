import "../../lib/i18n";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanner } from "./BarcodeScanner";

afterEach(() => {
	vi.unstubAllGlobals();
	// jsdom doesn't define navigator.mediaDevices at all by default — each
	// test defines it fresh via Object.defineProperty; this removes it so
	// the next test starts from the same undefined baseline.
	delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe("BarcodeScanner", () => {
	it("calls onDetect with the scanned value, requesting the rear camera", async () => {
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		});
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		class FakeBarcodeDetector {
			detect() {
				return Promise.resolve([{ rawValue: "0123456789012" }]);
			}
		}
		vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

		const onDetect = vi.fn();
		const onCancel = vi.fn();
		render(<BarcodeScanner onDetect={onDetect} onCancel={onCancel} />);

		await waitFor(() => expect(onDetect).toHaveBeenCalledWith("0123456789012"));
		expect(getUserMedia).toHaveBeenCalledWith({
			video: { facingMode: "environment" },
		});
	});

	it("shows an inline error and calls onCancel when the camera is unavailable", async () => {
		const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});

		const onDetect = vi.fn();
		const onCancel = vi.fn();
		const { findByText } = render(
			<BarcodeScanner onDetect={onDetect} onCancel={onCancel} />,
		);

		await findByText(/camera unavailable/i);
		expect(onCancel).toHaveBeenCalled();
		expect(onDetect).not.toHaveBeenCalled();
	});
});
