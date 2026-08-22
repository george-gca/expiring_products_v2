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
		render(<BarcodeScanner onDetect={onDetect} />);

		await waitFor(() => expect(onDetect).toHaveBeenCalledWith("0123456789012"));
		expect(getUserMedia).toHaveBeenCalledWith({
			video: { facingMode: "environment" },
		});
	});

	it("shows a loading indicator while the camera permission prompt is pending", async () => {
		const getUserMedia = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});

		const { container } = render(<BarcodeScanner onDetect={vi.fn()} />);

		await waitFor(() =>
			expect(container.querySelector(".ant-spin-spinning")).toBeTruthy(),
		);
	});

	it("shows an inline error, without bouncing back to the caller, when the camera is unavailable", async () => {
		const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});

		const onDetect = vi.fn();
		const { findByText } = render(<BarcodeScanner onDetect={onDetect} />);

		await findByText(/camera unavailable/i);
		expect(onDetect).not.toHaveBeenCalled();
	});
});
