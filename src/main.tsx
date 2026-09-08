import "barcode-detector/polyfill";
import "./lib/i18n";
import "./index.css";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";

// Antd's DatePicker needs this to parse typed text against a non-ISO
// `format` (e.g. "DD/MM/YYYY") — without it, typed input silently fails to
// parse into a real date. https://ant.design/docs/react/use-custom-date-library
dayjs.extend(customParseFormat);

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
