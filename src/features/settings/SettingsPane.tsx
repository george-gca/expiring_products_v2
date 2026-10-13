import { Card, Checkbox, Col, Form, Row, Select, Space } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import i18n from "../../lib/i18n";
import { CategorySection } from "../categories/CategorySection";
import { ClassSection } from "../classes/ClassSection";
import { QuantityStepper } from "../pantry-items/QuantityStepper";
import { BackupSection } from "./BackupSection";
import {
	updateHideDistantEnabled,
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

	const [hideDistantEnabled, setHideDistantEnabled] = useState(
		settings.hideDistantEnabled,
	);
	const [prevHideDistantEnabled, setPrevHideDistantEnabled] = useState(
		settings.hideDistantEnabled,
	);
	if (prevHideDistantEnabled !== settings.hideDistantEnabled) {
		setPrevHideDistantEnabled(settings.hideDistantEnabled);
		setHideDistantEnabled(settings.hideDistantEnabled);
	}

	const handleLowStockChange = async (next: number) => {
		setValue(next);
		if (next === settings.lowStockThreshold) return;
		try {
			await updateLowStockThreshold(uid, next);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHideDistantThresholdChange = async (next: number) => {
		setHideDistantValue(next);
		if (next === settings.hideDistantThresholdMonths) return;
		try {
			await updateHideDistantThresholdMonths(uid, next);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleHideDistantEnabledChange = async (checked: boolean) => {
		setHideDistantEnabled(checked);
		try {
			await updateHideDistantEnabled(uid, checked);
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
		<Space orientation="vertical" size="large" style={{ width: "100%" }}>
			<Card title={t("settings.sectionPreferences")}>
				<Form layout="vertical">
					<Form.Item label={t("settings.language")}>
						<Select
							value={settings.language}
							onChange={handleLanguageChange}
							options={[
								{ value: "pt-br", label: t("settings.languagePtBr") },
								{ value: "en-us", label: t("settings.languageEnUs") },
							]}
							style={{ width: 280, maxWidth: "100%" }}
						/>
					</Form.Item>
					<Row gutter={16}>
						<Col xs={24} sm={12}>
							<Form.Item label={t("settings.lowStockThreshold")}>
								<QuantityStepper
									min={MIN_LOW_STOCK_THRESHOLD}
									value={value}
									onChange={handleLowStockChange}
									aria-label={t("settings.lowStockThreshold")}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={12}>
							<Form.Item>
								<Checkbox
									checked={hideDistantEnabled}
									onChange={(e) =>
										handleHideDistantEnabledChange(e.target.checked)
									}
								>
									{t("settings.hideDistantEnabled")}
								</Checkbox>
							</Form.Item>
							{hideDistantEnabled && (
								<Form.Item label={t("settings.hideDistantThresholdMonths")}>
									<QuantityStepper
										min={MIN_HIDE_DISTANT_THRESHOLD_MONTHS}
										value={hideDistantValue}
										onChange={handleHideDistantThresholdChange}
										aria-label={t("settings.hideDistantThresholdMonths")}
									/>
								</Form.Item>
							)}
						</Col>
					</Row>
				</Form>
			</Card>
			<Card title={t("settings.sectionNotifications")}>
				<Form layout="vertical">
					<NotificationSection uid={uid} settings={settings} />
				</Form>
			</Card>
			<Card title={t("settings.backupTitle")}>
				<BackupSection uid={uid} />
			</Card>
			<Card title={t("settings.sectionCategories")}>
				<CategorySection uid={uid} />
			</Card>
			<Card title={t("settings.sectionClasses")}>
				<ClassSection uid={uid} />
			</Card>
		</Space>
	);
}
