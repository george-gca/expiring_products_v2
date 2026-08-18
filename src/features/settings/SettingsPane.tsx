import { Form, InputNumber, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateLowStockThreshold } from "./firestoreWrites";
import type { Settings } from "./schema";

export function SettingsPane({
	uid,
	settings,
}: {
	uid: string;
	settings: Settings;
}) {
	const { t } = useTranslation();
	const [value, setValue] = useState(settings.lowStockThreshold);

	const handleBlur = async () => {
		try {
			await updateLowStockThreshold(uid, value);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Form layout="vertical">
			<Form.Item label={t("settings.lowStockThreshold")}>
				<InputNumber
					min={1}
					value={value}
					onChange={(newValue) => setValue(newValue ?? 1)}
					onBlur={handleBlur}
					style={{ width: "100%" }}
				/>
			</Form.Item>
		</Form>
	);
}
