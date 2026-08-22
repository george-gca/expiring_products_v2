import "barcode-detector/polyfill";
import "./lib/i18n";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
