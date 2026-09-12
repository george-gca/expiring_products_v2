import { useRegisterSW } from "virtual:pwa-register/react";
import { Button, ConfigProvider, message, notification, theme } from "antd";
import enUS from "antd/locale/en_US";
import ptBR from "antd/locale/pt_BR";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { App } from "./App";
import { setFeedbackApis } from "./lib/feedback";
import { useColorScheme } from "./lib/useColorScheme";

// i18next canonicalizes to BCP-47 casing ("pt-BR"/"en-US") — see src/lib/i18n.ts.
const ANTD_LOCALES: Record<string, typeof ptBR> = {
	"pt-BR": ptBR,
	"en-US": enUS,
};

export function Root() {
	const isDark = useColorScheme();
	const { t, i18n } = useTranslation();

	// antd's static `message`/`notification` methods render outside
	// <ConfigProvider>'s tree, so they never pick up its dark/light
	// theme.algorithm — the hook-based instances here do, since their
	// contextHolder is mounted inside ConfigProvider below. Every other file
	// reaches these through lib/feedback's proxy rather than importing antd's
	// static API directly, so every toast in the app follows the theme too.
	const [messageApi, messageContextHolder] = message.useMessage();
	const [notificationApi, notificationContextHolder] =
		notification.useNotification();
	useEffect(() => {
		setFeedbackApis({ message: messageApi, notification: notificationApi });
	}, [messageApi, notificationApi]);

	const {
		needRefresh: [needRefresh],
		updateServiceWorker,
	} = useRegisterSW({
		// The browser's own SW update check only runs on a real top-level
		// navigation and is throttled to ~once/24h — a PWA that stays open or
		// gets resumed by the OS (rather than freshly relaunched) can go
		// indefinitely without ever re-checking. No polling interval: this
		// checks only at the moment someone actually returns to the app,
		// which is also the only moment they could see the prompt anyway.
		onRegisteredSW(_url, registration) {
			if (!registration) return;
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") registration.update();
			});
		},
	});

	// A new service worker only reaches the "waiting" state a client can see
	// once it's actually installed — sw.ts holds it there (no unconditional
	// self.skipWaiting()) specifically so this prompt has something to show
	// before the update takes over an already-open tab.
	useEffect(() => {
		if (!needRefresh) return;
		notificationApi.info({
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
	}, [needRefresh, t, updateServiceWorker, notificationApi]);

	return (
		<ConfigProvider
			locale={ANTD_LOCALES[i18n.language] ?? ptBR}
			theme={{
				algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
			}}
		>
			{messageContextHolder}
			{notificationContextHolder}
			<App />
		</ConfigProvider>
	);
}
