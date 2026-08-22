import { useRegisterSW } from "virtual:pwa-register/react";
import { Button, ConfigProvider, notification, theme } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { App } from "./App";
import { useColorScheme } from "./lib/useColorScheme";

export function Root() {
	const isDark = useColorScheme();
	const { t } = useTranslation();
	const {
		needRefresh: [needRefresh],
		updateServiceWorker,
	} = useRegisterSW();

	// A new service worker only reaches the "waiting" state a client can see
	// once it's actually installed — sw.ts holds it there (no unconditional
	// self.skipWaiting()) specifically so this prompt has something to show
	// before the update takes over an already-open tab.
	useEffect(() => {
		if (!needRefresh) return;
		notification.info({
			key: "pwa-update-available",
			message: t("app.updateAvailable"),
			description: t("app.updateAvailableDescription"),
			duration: 0,
			btn: (
				<Button
					type="primary"
					size="small"
					onClick={() => updateServiceWorker(true)}
				>
					{t("app.refresh")}
				</Button>
			),
		});
	}, [needRefresh, t, updateServiceWorker]);

	return (
		<ConfigProvider
			theme={{
				algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
			}}
		>
			<App />
		</ConfigProvider>
	);
}
