import { Form, InputNumber, message } from "antd";
import type { FocusEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
		const committed = Number.isNaN(parsed)
			? value
			: Math.max(MIN_LOW_STOCK_THRESHOLD, parsed);
		setValue(committed);
		try {
			await updateLowStockThreshold(uid, committed);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Form layout="vertical">
			<Form.Item label={t("settings.lowStockThreshold")}>
				<InputNumber
					min={MIN_LOW_STOCK_THRESHOLD}
					value={value}
					onChange={(newValue) => setValue(newValue ?? 1)}
					onBlur={handleBlur}
					style={{ width: "100%" }}
				/>
			</Form.Item>
		</Form>
	);
}
