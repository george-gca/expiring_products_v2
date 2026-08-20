import { Form, InputNumber, message, Select } from "antd";
import type { FocusEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../lib/i18n";
import { BackupSection } from "./BackupSection";
import {
	updateHideDistantThresholdMonths,
	updateLanguage,
	updateLowStockThreshold,
} from "./firestoreWrites";
import { NotificationSection } from "./NotificationSection";
import type { Settings } from "./schema";

const MIN_LOW_STOCK_THRESHOLD = 1;
const MIN_HIDE_DISTANT_THRESHOLD_MONTHS = 1;

export function SettingsPane({
	uid,
	settings,
}: {
	uid: string;
	settings: Settings;
}) {
	const { t } = useTranslation();
	const [value, setValue] = useState(settings.lowStockThreshold);

	// Keep the displayed value in sync with the settings prop: it's seeded
	// once via useState above, but settings.lowStockThreshold can also change
	// from another device's edit propagating through onSnapshot. Without this,
	// this device keeps showing its own stale value, and any blur here would
	// silently re-commit that stale number and revert the other device's edit.
	// Re-derived during render (rather than in a useEffect, which would cause
	// an extra commit) — the React-recommended "adjusting state when a prop
	// changes" pattern: https://react.dev/learn/you-might-not-need-an-effect
	const [prevThreshold, setPrevThreshold] = useState(
		settings.lowStockThreshold,
	);
	if (prevThreshold !== settings.lowStockThreshold) {
		setPrevThreshold(settings.lowStockThreshold);
		setValue(settings.lowStockThreshold);
	}

	const [hideDistantValue, setHideDistantValue] = useState(
		settings.hideDistantThresholdMonths,
	);
	const [prevHideDistantThresholdMonths, setPrevHideDistantThresholdMonths] =
		useState(settings.hideDistantThresholdMonths);
	if (prevHideDistantThresholdMonths !== settings.hideDistantThresholdMonths) {
		setPrevHideDistantThresholdMonths(settings.hideDistantThresholdMonths);
		setHideDistantValue(settings.hideDistantThresholdMonths);
	}

	const handleBlur = async (event: FocusEvent<HTMLInputElement>) => {
		// Read the raw DOM value rather than trusting the `value` state: while
		// the user is typing an out-of-range number (e.g. "0" when min is 1),
		// the underlying InputNumber skips calling onChange entirely, so
		// `value` can still hold a stale, previously-committed number. Our own
		// onBlur (attached directly to the native <input>) also fires before
		// the library's internal blur handler clamps the displayed value, so
		// we must compute the clamped value ourselves rather than rely on a
		// subsequent onChange to have already corrected `value`.
		const parsed = Number(event.target.value);
		// Round before clamping: `precision={0}` below stops most non-integer
		// entry, but the raw DOM value is read independently of that prop, so
		// round defensively too. settingsDocSchema requires an integer — a
		// value like 2.5 slipping through here would fail to parse on the next
		// read (see schema.ts's `.catch()` for the read-side defense in depth).
		const committed = Number.isNaN(parsed)
			? value
			: Math.max(MIN_LOW_STOCK_THRESHOLD, Math.round(parsed));
		setValue(committed);
		if (committed === settings.lowStockThreshold) return;
		try {
			await updateLowStockThreshold(uid, committed);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHideDistantBlur = async (event: FocusEvent<HTMLInputElement>) => {
		const parsed = Number(event.target.value);
		const committed = Number.isNaN(parsed)
			? hideDistantValue
			: Math.max(MIN_HIDE_DISTANT_THRESHOLD_MONTHS, Math.round(parsed));
		setHideDistantValue(committed);
		if (committed === settings.hideDistantThresholdMonths) return;
		try {
			await updateHideDistantThresholdMonths(uid, committed);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleLanguageChange = async (language: Settings["language"]) => {
		try {
			await updateLanguage(uid, language);
			i18n.changeLanguage(language);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Form layout="vertical">
			<Form.Item label={t("settings.language")}>
				<Select
					value={settings.language}
					onChange={handleLanguageChange}
					options={[
						{ value: "pt-br", label: t("settings.languagePtBr") },
						{ value: "en-us", label: t("settings.languageEnUs") },
					]}
					style={{ width: "100%" }}
				/>
			</Form.Item>
			<Form.Item label={t("settings.lowStockThreshold")}>
				<InputNumber
					min={MIN_LOW_STOCK_THRESHOLD}
					precision={0}
					value={value}
					onChange={(newValue) => setValue(newValue ?? 1)}
					onBlur={handleBlur}
					style={{ width: "100%" }}
				/>
			</Form.Item>
			<Form.Item label={t("settings.hideDistantThresholdMonths")}>
				<InputNumber
					min={MIN_HIDE_DISTANT_THRESHOLD_MONTHS}
					precision={0}
					value={hideDistantValue}
					onChange={(newValue) => setHideDistantValue(newValue ?? 1)}
					onBlur={handleHideDistantBlur}
					aria-label={t("settings.hideDistantThresholdMonths")}
					style={{ width: "100%" }}
				/>
			</Form.Item>
			<NotificationSection uid={uid} settings={settings} />
			<BackupSection uid={uid} />
		</Form>
	);
}
