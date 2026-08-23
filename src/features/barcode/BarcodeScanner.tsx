import { SwapOutlined } from "@ant-design/icons";
import { Button, Spin } from "antd";
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
	const [mirrored, setMirrored] = useState(false);

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
			<div
				style={{
					position: "relative",
					display: status === "streaming" ? "block" : "none",
				}}
			>
				<video
					ref={videoRef}
					autoPlay
					muted
					style={{
						width: "100%",
						display: "block",
						transform: mirrored ? "scaleX(-1)" : undefined,
					}}
				/>
				<Button
					shape="circle"
					icon={<SwapOutlined />}
					aria-label={t("items.mirrorCamera")}
					onClick={() => setMirrored((m) => !m)}
					style={{ position: "absolute", top: 8, right: 8 }}
				/>
				{/* Purely a visual aim guide — detection still scans the full
				    frame regardless of where the barcode sits relative to it. */}
				<div
					data-testid="scan-guide"
					aria-hidden="true"
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						pointerEvents: "none",
					}}
				>
					<div
						style={{
							position: "relative",
							width: "80%",
							height: "30%",
							border: "2px solid rgba(255, 255, 255, 0.8)",
							borderRadius: 4,
							boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.25)",
						}}
					>
						<div
							style={{
								position: "absolute",
								left: 0,
								right: 0,
								top: "50%",
								height: 2,
								background: "red",
								transform: "translateY(-50%)",
							}}
						/>
					</div>
				</div>
			</div>
		</>
	);
}
