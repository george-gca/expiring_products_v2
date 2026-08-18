import "./lib/i18n";
import "./index.css";
import { ConfigProvider } from "antd";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConfigProvider>
			<App />
		</ConfigProvider>
	</StrictMode>,
);
