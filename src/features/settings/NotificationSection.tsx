import { Form, InputNumber, message, Switch } from "antd";
import type { FocusEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	registerForPush,
	requestNotificationPermission,
	unregisterFromPush,
} from "../notifications/messaging";
import {
	updateNotificationsEnabled,
	updateNotifyDaysBeforeExpiry,
	updateNotifyHourLocal,
} from "./firestoreWrites";
import type { Settings } from "./schema";

const MIN_NOTIFY_DAYS_BEFORE_EXPIRY = 1;
const MIN_NOTIFY_HOUR_LOCAL = 0;
const MAX_NOTIFY_HOUR_LOCAL = 23;

export function NotificationSection({
	uid,
	settings,
}: {
	uid: string;
	settings: Settings;
}) {
	const { t } = useTranslation();
	const [permissionError, setPermissionError] = useState(false);

	// Render-time resync pattern (see SettingsPane.tsx) — not a useEffect, to
	// avoid react-hooks/set-state-in-effect and an extra commit.
	const [daysValue, setDaysValue] = useState(settings.notifyDaysBeforeExpiry);
	const [prevDays, setPrevDays] = useState(settings.notifyDaysBeforeExpiry);
	if (prevDays !== settings.notifyDaysBeforeExpiry) {
		setPrevDays(settings.notifyDaysBeforeExpiry);
		setDaysValue(settings.notifyDaysBeforeExpiry);
	}

	const [hourValue, setHourValue] = useState(settings.notifyHourLocal);
	const [prevHour, setPrevHour] = useState(settings.notifyHourLocal);
	if (prevHour !== settings.notifyHourLocal) {
		setPrevHour(settings.notifyHourLocal);
		setHourValue(settings.notifyHourLocal);
	}

	const handleToggle = async (checked: boolean) => {
		setPermissionError(false);
		if (!checked) {
			try {
				await unregisterFromPush(uid);
				await updateNotificationsEnabled(uid, false);
			} catch {
				message.error("Something went wrong, please try again");
			}
			return;
		}

		const granted = await requestNotificationPermission();
		if (!granted) {
			setPermissionError(true);
			return;
		}
		try {
			await registerForPush(uid);
			await updateNotifyHourLocal(
				uid,
				settings.notifyHourLocal,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
			await updateNotificationsEnabled(uid, true);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleDaysBlur = async (event: FocusEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		const committed = Number.isNaN(parsed)
			? daysValue
			: Math.max(MIN_NOTIFY_DAYS_BEFORE_EXPIRY, Math.round(parsed));
		setDaysValue(committed);
		if (committed === settings.notifyDaysBeforeExpiry) return;
		try {
			await updateNotifyDaysBeforeExpiry(uid, committed);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHourBlur = async (event: FocusEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		const committed = Number.isNaN(parsed)
			? hourValue
			: Math.min(
					MAX_NOTIFY_HOUR_LOCAL,
					Math.max(MIN_NOTIFY_HOUR_LOCAL, Math.round(parsed)),
				);
		setHourValue(committed);
		if (committed === settings.notifyHourLocal) return;
		try {
			await updateNotifyHourLocal(
				uid,
				committed,
				Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<>
			<Form.Item label={t("settings.notificationsEnabled")}>
				<Switch
					checked={settings.notificationsEnabled}
					onChange={handleToggle}
					aria-label={t("settings.notificationsEnabled")}
				/>
				{permissionError && (
					<div>{t("settings.notificationsPermissionDenied")}</div>
				)}
			</Form.Item>
			<Form.Item label={t("settings.notifyDaysBeforeExpiry")}>
				<InputNumber
					min={MIN_NOTIFY_DAYS_BEFORE_EXPIRY}
					precision={0}
					value={daysValue}
					onChange={(newValue) =>
						setDaysValue(newValue ?? MIN_NOTIFY_DAYS_BEFORE_EXPIRY)
					}
					onBlur={handleDaysBlur}
					aria-label={t("settings.notifyDaysBeforeExpiry")}
					style={{ width: "100%" }}
				/>
			</Form.Item>
			<Form.Item label={t("settings.notifyHourLocal")}>
				<InputNumber
					min={MIN_NOTIFY_HOUR_LOCAL}
					max={MAX_NOTIFY_HOUR_LOCAL}
					precision={0}
					value={hourValue}
					onChange={(newValue) =>
						setHourValue(newValue ?? MIN_NOTIFY_HOUR_LOCAL)
					}
					onBlur={handleHourBlur}
					aria-label={t("settings.notifyHourLocal")}
					style={{ width: "100%" }}
				/>
			</Form.Item>
		</>
	);
}
