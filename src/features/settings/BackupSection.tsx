import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Input, Modal, message, Space } from "antd";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildBackup } from "../backup/exportBackup";
import { importBackup } from "../backup/importBackup";
import { type Backup, safeParseBackup } from "../backup/schema";

export function BackupSection({ uid }: { uid: string }) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
	const [confirmText, setConfirmText] = useState("");
	const [importModalOpen, setImportModalOpen] = useState(false);

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

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = ""; // allow re-selecting the same file later
		if (!file) return;

		let json: unknown;
		try {
			json = JSON.parse(await file.text());
		} catch {
			message.error(t("settings.invalidBackupFile"));
			return;
		}

		if (
			typeof json === "object" &&
			json !== null &&
			"version" in json &&
			(json as { version: unknown }).version !== 1
		) {
			message.error(t("settings.unsupportedBackupVersion"));
			return;
		}

		const parsed = safeParseBackup(json);
		if (!parsed) {
			message.error(t("settings.invalidBackupFile"));
			return;
		}

		setPendingBackup(parsed);
		setConfirmText("");
		setImportModalOpen(true);
	};

	const handleImportConfirm = async () => {
		if (!pendingBackup) return;
		try {
			await importBackup(uid, pendingBackup);
			message.success(t("settings.importSuccess"));
		} catch {
			message.error(t("settings.importPartialFailure"));
		} finally {
			setImportModalOpen(false);
			setPendingBackup(null);
			setConfirmText("");
		}
	};

	const handleImportCancel = () => {
		setImportModalOpen(false);
		setPendingBackup(null);
		setConfirmText("");
	};

	return (
		<>
			<Space>
				<Button icon={<DownloadOutlined />} onClick={handleExport}>
					{t("settings.exportBackup")}
				</Button>
				<Button
					icon={<UploadOutlined />}
					onClick={() => fileInputRef.current?.click()}
				>
					{t("settings.importBackup")}
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept=".json"
					aria-label={t("settings.importBackup")}
					style={{ display: "none" }}
					onChange={handleFileChange}
				/>
			</Space>
			<Modal
				title={t("settings.importConfirmTitle")}
				open={importModalOpen}
				onOk={handleImportConfirm}
				onCancel={handleImportCancel}
				okButtonProps={{
					disabled: confirmText.trim() !== t("settings.importConfirmWord"),
					danger: true,
				}}
			>
				<p>
					{t("settings.importConfirmBody", {
						itemCount: pendingBackup?.items.length ?? 0,
						categoryCount: pendingBackup?.categories.length ?? 0,
						confirmWord: t("settings.importConfirmWord"),
					})}
				</p>
				<Input
					value={confirmText}
					onChange={(event) => setConfirmText(event.target.value)}
					aria-label={t("settings.importConfirmInputLabel")}
					placeholder={t("settings.importConfirmPlaceholder", {
						confirmWord: t("settings.importConfirmWord"),
					})}
				/>
			</Modal>
		</>
	);
}
