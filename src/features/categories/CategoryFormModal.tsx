import { Button, Form, Input, Modal, message, Popover } from "antd";
import EmojiPicker, {
	type EmojiClickData,
	EmojiStyle,
} from "emoji-picker-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createCategory, renameCategory } from "./firestoreWrites";
import type { Category } from "./schema";

const DEFAULT_EMOJI = "🏷️";

interface CategoryFormValues {
	name: string;
}

export function CategoryFormModal({
	uid,
	open,
	onClose,
	editingCategory,
	nextOrder,
}: {
	uid: string;
	open: boolean;
	onClose: () => void;
	editingCategory: Category | null;
	nextOrder: number;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<CategoryFormValues>();
	const [emoji, setEmoji] = useState(editingCategory?.emoji ?? DEFAULT_EMOJI);
	const [pickerOpen, setPickerOpen] = useState(false);

	// Re-derived during render (rather than in the useEffect below, which
	// would cause an extra commit) — the React-recommended "adjusting state
	// when a prop changes" pattern, matching AddItemModal.tsx's identical use.
	// Keyed on `open` (not `editingCategory`'s identity) since this component
	// stays mounted across the modal's open/close cycles — `open` toggling
	// true is the actual "starting a fresh edit" signal.
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (open) {
			setEmoji(editingCategory?.emoji ?? DEFAULT_EMOJI);
		}
	}

	// form.setFieldsValue is an imperative call into an external mutable
	// object, not a React state setter — this stays a useEffect (matching
	// AddItemModal.tsx's identical rationale) rather than joining the
	// render-time resync above.
	useEffect(() => {
		if (open) {
			form.setFieldsValue({ name: editingCategory?.name ?? "" });
		}
	}, [open, editingCategory, form]);

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			if (editingCategory) {
				await renameCategory(
					uid,
					editingCategory.id,
					values.name.trim(),
					emoji,
				);
			} else {
				await createCategory(uid, values.name.trim(), emoji, nextOrder);
			}
			form.resetFields();
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={
				editingCategory ? t("settings.editCategory") : t("settings.addCategory")
			}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ name: editingCategory?.name ?? "" }}
			>
				<Form.Item label={t("settings.categoryIcon")}>
					<Popover
						trigger="click"
						open={pickerOpen}
						onOpenChange={setPickerOpen}
						content={
							<EmojiPicker
								emojiStyle={EmojiStyle.NATIVE}
								onEmojiClick={(emojiData: EmojiClickData) => {
									setEmoji(emojiData.emoji);
									setPickerOpen(false);
								}}
							/>
						}
					>
						<Button aria-label={t("settings.categoryIcon")}>{emoji}</Button>
					</Popover>
				</Form.Item>
				<Form.Item
					name="name"
					label={t("settings.categoryName")}
					rules={[{ required: true }]}
				>
					<Input />
				</Form.Item>
			</Form>
		</Modal>
	);
}
