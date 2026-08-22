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
			.then((mediaStream) => {
				if (cancelled) {
					for (const track of mediaStream.getTracks()) track.stop();
					return;
				}
				stream = mediaStream;
				if (videoRef.current) {
					videoRef.current.srcObject = mediaStream;
				}
				setStatus("streaming");
				const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
				const loop = async () => {
					if (cancelled || !videoRef.current) return;
					const results = await detector.detect(videoRef.current);
					if (results.length > 0) {
						onDetectRef.current(results[0].rawValue);
						return;
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
