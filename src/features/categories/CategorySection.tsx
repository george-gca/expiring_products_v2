import {
	DeleteOutlined,
	DownOutlined,
	EditOutlined,
	PlusOutlined,
	UpOutlined,
} from "@ant-design/icons";
import {
	Button,
	Flex,
	Input,
	Modal,
	message,
	Tooltip,
	Typography,
	theme,
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryFormModal } from "./CategoryFormModal";
import { archiveCategory, swapCategoryOrder } from "./firestoreWrites";
import type { Category } from "./schema";
import { useCategories } from "./useCategories";

export function CategorySection({ uid }: { uid: string }) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const { categories, loading } = useCategories(uid);
	const [formOpen, setFormOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState<Category | null>(null);
	const [categoryPendingDelete, setCategoryPendingDelete] =
		useState<Category | null>(null);
	const [confirmText, setConfirmText] = useState("");

	if (loading) return null;

	const sorted = [...categories].sort((a, b) => a.order - b.order);
	const nextOrder =
		sorted.length === 0 ? 0 : Math.max(...sorted.map((c) => c.order)) + 1;

	const handleMoveUp = async (index: number) => {
		if (index === 0) return;
		try {
			await swapCategoryOrder(uid, sorted[index], sorted[index - 1]);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleMoveDown = async (index: number) => {
		if (index === sorted.length - 1) return;
		try {
			await swapCategoryOrder(uid, sorted[index], sorted[index + 1]);
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleDeleteConfirm = async () => {
		if (!categoryPendingDelete) return;
		try {
			await archiveCategory(uid, categoryPendingDelete.id);
		} catch {
			message.error("Something went wrong, please try again");
		} finally {
			setCategoryPendingDelete(null);
			setConfirmText("");
		}
	};

	return (
		<>
			{sorted.map((category, index) => (
				<Flex
					key={category.id}
					justify="space-between"
					align="center"
					style={{
						padding: "12px 0",
						borderBottom: `1px solid ${token.colorSplit}`,
					}}
				>
					<Flex align="center" gap="small">
						<span>{category.emoji}</span>
						<Typography.Text strong>{category.name}</Typography.Text>
					</Flex>
					<Flex gap="small">
						<Button
							type="text"
							icon={<UpOutlined />}
							disabled={index === 0}
							onClick={() => handleMoveUp(index)}
							aria-label={t("settings.moveCategoryUp")}
						/>
						<Button
							type="text"
							icon={<DownOutlined />}
							disabled={index === sorted.length - 1}
							onClick={() => handleMoveDown(index)}
							aria-label={t("settings.moveCategoryDown")}
						/>
						<Button
							type="text"
							icon={<EditOutlined />}
							onClick={() => {
								setEditingCategory(category);
								setFormOpen(true);
							}}
							aria-label={t("settings.editCategory")}
						/>
						<Tooltip
							title={
								sorted.length <= 1
									? t("settings.cannotDeleteLastCategory")
									: undefined
							}
						>
							<Button
								type="text"
								danger
								icon={<DeleteOutlined />}
								disabled={sorted.length <= 1}
								onClick={() => setCategoryPendingDelete(category)}
								aria-label={t("settings.deleteCategory")}
							/>
						</Tooltip>
					</Flex>
				</Flex>
			))}
			<Button
				icon={<PlusOutlined />}
				onClick={() => {
					setEditingCategory(null);
					setFormOpen(true);
				}}
				style={{ marginTop: 12 }}
			>
				{t("settings.addCategory")}
			</Button>
			<CategoryFormModal
				uid={uid}
				open={formOpen}
				onClose={() => {
					setFormOpen(false);
					setEditingCategory(null);
				}}
				editingCategory={editingCategory}
				nextOrder={nextOrder}
			/>
			<Modal
				title={t("settings.deleteCategoryConfirmTitle")}
				open={categoryPendingDelete !== null}
				onOk={handleDeleteConfirm}
				onCancel={() => {
					setCategoryPendingDelete(null);
					setConfirmText("");
				}}
				okButtonProps={{
					disabled: categoryPendingDelete
						? confirmText.trim() !== categoryPendingDelete.name
						: true,
					danger: true,
				}}
			>
				<p>
					{t("settings.deleteCategoryConfirmBody", {
						categoryName: categoryPendingDelete?.name ?? "",
					})}
				</p>
				<Input
					value={confirmText}
					onChange={(event) => setConfirmText(event.target.value)}
					aria-label={t("settings.deleteCategoryConfirmInputLabel")}
					placeholder={t("settings.deleteCategoryConfirmPlaceholder", {
						categoryName: categoryPendingDelete?.name ?? "",
					})}
				/>
			</Modal>
		</>
	);
}
