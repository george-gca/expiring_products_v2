import { Col, Form, Row, Switch } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { hasAnyFcmToken } from "../notifications/firestoreWrites";
import {
	registerForPush,
	requestNotificationPermission,
	unregisterFromPush,
} from "../notifications/messaging";
import { useFcmTokenRegistered } from "../notifications/useFcmTokenRegistered";
import { QuantityStepper } from "../pantry-items/QuantityStepper";
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
	const { registered } = useFcmTokenRegistered(uid);

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
				await updateNotificationsEnabled(uid, await hasAnyFcmToken(uid));
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

	const handleDaysChange = async (next: number) => {
		setDaysValue(next);
		if (next === settings.notifyDaysBeforeExpiry) return;
		try {
			await updateNotifyDaysBeforeExpiry(uid, next);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHourChange = async (next: number) => {
		setHourValue(next);
		if (next === settings.notifyHourLocal) return;
		try {
			await updateNotifyHourLocal(
				uid,
				next,
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
					checked={registered}
					onChange={handleToggle}
					aria-label={t("settings.notificationsEnabled")}
				/>
				{permissionError && (
					<div>{t("settings.notificationsPermissionDenied")}</div>
				)}
			</Form.Item>
			<Row gutter={16}>
				<Col xs={24} sm={12}>
					<Form.Item label={t("settings.notifyDaysBeforeExpiry")}>
						<QuantityStepper
							min={MIN_NOTIFY_DAYS_BEFORE_EXPIRY}
							value={daysValue}
							onChange={handleDaysChange}
							aria-label={t("settings.notifyDaysBeforeExpiry")}
						/>
					</Form.Item>
				</Col>
				<Col xs={24} sm={12}>
					<Form.Item label={t("settings.notifyHourLocal")}>
						<QuantityStepper
							min={MIN_NOTIFY_HOUR_LOCAL}
							max={MAX_NOTIFY_HOUR_LOCAL}
							value={hourValue}
							onChange={handleHourChange}
							aria-label={t("settings.notifyHourLocal")}
						/>
					</Form.Item>
				</Col>
			</Row>
		</>
	);
}
