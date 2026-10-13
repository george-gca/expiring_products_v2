import { Form, Input, Modal } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { createClass, renameClass } from "./firestoreWrites";
import type { ItemClass } from "./schema";

interface ClassFormValues {
	name: string;
}

export function ClassFormModal({
	uid,
	category,
	open,
	onClose,
	editingClass,
	onCreated,
}: {
	uid: string;
	category: string;
	open: boolean;
	onClose: () => void;
	editingClass: ItemClass | null;
	onCreated?: (classId: string) => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<ClassFormValues>();

	// form.setFieldsValue is an imperative call into an external mutable
	// object, not a React state setter, so it stays in a useEffect.
	useEffect(() => {
		if (open) {
			form.setFieldsValue({ name: editingClass?.name ?? "" });
		}
	}, [open, editingClass, form]);

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			if (editingClass) {
				await renameClass(uid, editingClass.id, values.name.trim());
			} else {
				const classId = await createClass(uid, category, values.name.trim());
				onCreated?.(classId);
			}
			form.resetFields();
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={editingClass ? t("settings.editClass") : t("settings.addClass")}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ name: editingClass?.name ?? "" }}
			>
				<Form.Item
					name="name"
					label={t("settings.className")}
					rules={[{ required: true }]}
				>
					<Input />
				</Form.Item>
			</Form>
		</Modal>
	);
}
