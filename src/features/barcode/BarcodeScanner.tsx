import { Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const BARCODE_FORMATS: BarcodeFormat[] = ["ean_13", "ean_8", "upc_a", "upc_e"];

export function BarcodeScanner({
	onDetect,
}: {
	onDetect: (barcode: string) => void;
}) {
	const { t } = useTranslation();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [status, setStatus] = useState<"loading" | "streaming" | "error">(
		"loading",
	);

	// Latest callback is read via a ref rather than listed as an effect dep:
	// the camera-acquisition effect below must run exactly once per mount
	// (acquire the camera once, release it once) regardless of how many
	// times the parent re-renders with a new inline onDetect function
	// identity. The ref is synced in its own effect (not written during
	// render) since eslint-plugin-react-hooks's `refs` rule forbids writing
	// ref.current outside an effect/event handler.
	const onDetectRef = useRef(onDetect);
	useEffect(() => {
		onDetectRef.current = onDetect;
	});

	useEffect(() => {
		let stream: MediaStream | null = null;
		let rafId: number;
		let cancelled = false;

		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: "environment" } })
			.then(async (mediaStream) => {
				if (cancelled) {
					for (const track of mediaStream.getTracks()) track.stop();
					return;
				}
				stream = mediaStream;
				const video = videoRef.current;
				if (video) {
					video.srcObject = mediaStream;
				}
				setStatus("streaming");

				// BarcodeDetector.detect() throws InvalidStateError if the video
				// element has no decoded frame yet (readyState below
				// HAVE_CURRENT_DATA) — assigning srcObject doesn't guarantee one
				// is available synchronously, so detect() can't start yet.
				if (video && video.readyState < video.HAVE_CURRENT_DATA) {
					await new Promise<void>((resolve) => {
						video.addEventListener("loadeddata", () => resolve(), {
							once: true,
						});
					});
				}
				if (cancelled) return;

				const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
				const loop = async () => {
					if (cancelled || !videoRef.current) return;
					try {
						const results = await detector.detect(videoRef.current);
						if (results.length > 0) {
							onDetectRef.current(results[0].rawValue);
							return;
						}
					} catch {
						// A frame can transiently be in an invalid state (e.g. a
						// momentary decode hiccup) — skip it and keep scanning
						// rather than letting one bad frame stop detection for
						// the rest of the session.
					}
					rafId = requestAnimationFrame(loop);
				};
				loop();
			})
			.catch(() => {
				if (!cancelled) setStatus("error");
			});

		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
			if (stream) for (const track of stream.getTracks()) track.stop();
		};
	}, []);

	if (status === "error") {
		return <div>{t("items.cameraUnavailable")}</div>;
	}

	return (
		<>
			{status === "loading" && (
				<Spin style={{ display: "block", margin: "24px auto" }} />
			)}
			<video
				ref={videoRef}
				autoPlay
				muted
				style={{
					width: "100%",
					display: status === "streaming" ? "block" : "none",
				}}
			/>
		</>
	);
}
