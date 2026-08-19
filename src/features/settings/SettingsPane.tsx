import { DownloadOutlined } from "@ant-design/icons";
import { Button, Form, InputNumber, message } from "antd";
import type { FocusEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildBackup } from "../backup/exportBackup";
import { updateLowStockThreshold } from "./firestoreWrites";
import type { Settings } from "./schema";

const MIN_LOW_STOCK_THRESHOLD = 1;

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

	const handleExport = async () => {
		try {
			const backup = await buildBackup(uid);
			const blob = new Blob([JSON.stringify(backup, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `expiring-products-backup-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Form layout="vertical">
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
			<Form.Item label={t("settings.backupTitle")}>
				<Button icon={<DownloadOutlined />} onClick={handleExport}>
					{t("settings.exportBackup")}
				</Button>
			</Form.Item>
		</Form>
	);
}
