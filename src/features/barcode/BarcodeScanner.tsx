import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const BARCODE_FORMATS: BarcodeFormat[] = ["ean_13", "ean_8", "upc_a", "upc_e"];

export function BarcodeScanner({
	onDetect,
	onCancel,
}: {
	onDetect: (barcode: string) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [error, setError] = useState(false);

	// Latest callbacks are read via refs rather than listed as effect deps:
	// the camera-acquisition effect below must run exactly once per mount
	// (acquire the camera once, release it once) regardless of how many
	// times the parent re-renders with a new inline onDetect/onCancel
	// function identity. The refs are synced in their own effect (not
	// written during render) since eslint-plugin-react-hooks's `refs` rule
	// forbids writing ref.current outside an effect/event handler.
	const onDetectRef = useRef(onDetect);
	const onCancelRef = useRef(onCancel);
	useEffect(() => {
		onDetectRef.current = onDetect;
		onCancelRef.current = onCancel;
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
				setError(true);
				onCancelRef.current();
			});

		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
			if (stream) for (const track of stream.getTracks()) track.stop();
		};
	}, []);

	if (error) {
		return <div>{t("items.cameraUnavailable")}</div>;
	}

	return <video ref={videoRef} autoPlay muted style={{ width: "100%" }} />;
}
