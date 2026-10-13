import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Flex, Input, Modal, Select, Typography, theme } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { useCategories } from "../categories/useCategories";
import { ClassFormModal } from "./ClassFormModal";
import { archiveClass } from "./firestoreWrites";
import type { ItemClass } from "./schema";
import { useClasses } from "./useClasses";

export function ClassSection({ uid }: { uid: string }) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { categories, loading: categoriesLoading } = useCategories(uid);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	// Falls back to the first available category whenever nothing has been
	// explicitly picked yet (including after the previously selected one
	// disappears, e.g. archived elsewhere) — Select then just shows the new
	// first category rather than a stale, unmatched value.
	const activeCategory = selectedCategory ?? categories[0]?.key ?? null;
	const { classes, loading: classesLoading } = useClasses(
		uid,
		activeCategory ?? "",
	);
	const [formOpen, setFormOpen] = useState(false);
	const [editingClass, setEditingClass] = useState<ItemClass | null>(null);
	const [classPendingDelete, setClassPendingDelete] =
		useState<ItemClass | null>(null);
	const [confirmText, setConfirmText] = useState("");

	if (categoriesLoading || activeCategory === null) return null;

	const handleDeleteConfirm = async () => {
		if (!classPendingDelete) return;
		try {
			await archiveClass(uid, classPendingDelete.id);
		} catch {
			message.error("Something went wrong, please try again");
		} finally {
			setClassPendingDelete(null);
			setConfirmText("");
		}
	};

	return (
		<>
			<Select
				value={activeCategory}
				onChange={setSelectedCategory}
				options={categories.map((category) => ({
					value: category.key,
					label: `${category.emoji} ${category.name}`,
				}))}
				style={{ width: 280, maxWidth: "100%", marginBottom: 12 }}
			/>
			{!classesLoading &&
				classes.map((cls) => (
					<Flex
						key={cls.id}
						justify="space-between"
						align="center"
						style={{
							padding: "12px 0",
							borderBottom: `1px solid ${token.colorSplit}`,
						}}
					>
						<Typography.Text strong>{cls.name}</Typography.Text>
						<Flex gap="small">
							<Button
								type="text"
								icon={<EditOutlined />}
								onClick={() => {
									setEditingClass(cls);
									setFormOpen(true);
								}}
								aria-label={t("settings.editClass")}
							/>
							<Button
								type="text"
								danger
								icon={<DeleteOutlined />}
								onClick={() => setClassPendingDelete(cls)}
								aria-label={t("settings.deleteClass")}
							/>
						</Flex>
					</Flex>
				))}
			<Button
				icon={<PlusOutlined />}
				onClick={() => {
					setEditingClass(null);
					setFormOpen(true);
				}}
				style={{ marginTop: 12 }}
			>
				{t("settings.addClass")}
			</Button>
			<ClassFormModal
				uid={uid}
				category={activeCategory}
				open={formOpen}
				onClose={() => {
					setFormOpen(false);
					setEditingClass(null);
				}}
				editingClass={editingClass}
			/>
			<Modal
				title={t("settings.deleteClassConfirmTitle")}
				open={classPendingDelete !== null}
				onOk={handleDeleteConfirm}
				onCancel={() => {
					setClassPendingDelete(null);
					setConfirmText("");
				}}
				okButtonProps={{
					disabled: classPendingDelete
						? confirmText.trim() !== classPendingDelete.name
						: true,
					danger: true,
				}}
			>
				<p>
					{t("settings.deleteClassConfirmBody", {
						className: classPendingDelete?.name ?? "",
					})}
				</p>
				<Input
					value={confirmText}
					onChange={(event) => setConfirmText(event.target.value)}
					aria-label={t("settings.deleteClassConfirmInputLabel")}
					placeholder={t("settings.deleteClassConfirmPlaceholder", {
						className: classPendingDelete?.name ?? "",
					})}
				/>
			</Modal>
		</>
	);
}
