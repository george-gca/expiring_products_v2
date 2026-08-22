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
		const { container } = render(<BarcodeScanner onDetect={onDetect} />);

		// jsdom's <video readyState> defaults to 0 (HAVE_NOTHING) and never
		// advances on its own — simulate the real browser signal that a frame
		// is ready to be scanned.
		const video = container.querySelector("video") as HTMLVideoElement;
		Object.defineProperty(video, "readyState", {
			value: video.HAVE_CURRENT_DATA,
			configurable: true,
		});
		video.dispatchEvent(new Event("loadeddata"));

		await waitFor(() => expect(onDetect).toHaveBeenCalledWith("0123456789012"));
		expect(getUserMedia).toHaveBeenCalledWith({
			video: { facingMode: "environment" },
		});
	});

	it("waits for the video to have a decoded frame before calling detect", async () => {
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		});
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		const detect = vi.fn().mockResolvedValue([{ rawValue: "0123456789012" }]);
		class FakeBarcodeDetector {
			detect(video: HTMLVideoElement) {
				return detect(video);
			}
		}
		vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

		const onDetect = vi.fn();
		const { container } = render(<BarcodeScanner onDetect={onDetect} />);

		const video = container.querySelector("video") as HTMLVideoElement;
		Object.defineProperty(video, "readyState", {
			value: 0,
			configurable: true,
		});

		// Give the effect a tick to reach (and await inside) the readiness
		// check — detect must not have been called while readyState is 0.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(detect).not.toHaveBeenCalled();

		Object.defineProperty(video, "readyState", {
			value: video.HAVE_CURRENT_DATA,
			configurable: true,
		});
		video.dispatchEvent(new Event("loadeddata"));

		await waitFor(() => expect(onDetect).toHaveBeenCalledWith("0123456789012"));
	});

	it("keeps scanning after detect() throws instead of stopping the loop", async () => {
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		});
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		let callCount = 0;
		class FakeBarcodeDetector {
			detect() {
				callCount += 1;
				if (callCount === 1) {
					return Promise.reject(
						new DOMException("Invalid element or state", "InvalidStateError"),
					);
				}
				return Promise.resolve([{ rawValue: "0123456789012" }]);
			}
		}
		vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

		const onDetect = vi.fn();
		const { container } = render(<BarcodeScanner onDetect={onDetect} />);

		const video = container.querySelector("video") as HTMLVideoElement;
		Object.defineProperty(video, "readyState", {
			value: video.HAVE_CURRENT_DATA,
			configurable: true,
		});
		video.dispatchEvent(new Event("loadeddata"));

		await waitFor(() => expect(onDetect).toHaveBeenCalledWith("0123456789012"));
		expect(callCount).toBeGreaterThanOrEqual(2);
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

	it("shows the scan-area guide once the camera is streaming", async () => {
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		});
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		class FakeBarcodeDetector {
			detect() {
				return Promise.resolve([]);
			}
		}
		vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

		const { container } = render(<BarcodeScanner onDetect={vi.fn()} />);

		await waitFor(() =>
			expect(
				container.querySelector('[data-testid="scan-guide"]'),
			).toBeTruthy(),
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
