import { DatePicker, Form, Input, InputNumber, Modal, Switch } from "antd";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { addItem } from "./firestoreWrites";

interface AddItemFormValues {
	name: string;
	quantity: number;
	expiringDate: Dayjs;
	duration?: number;
	recurring: boolean;
}

export function AddItemModal({
	uid,
	category,
	open,
	onClose,
}: {
	uid: string;
	category: Category;
	open: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<AddItemFormValues>();

	const handleOk = async () => {
		const values = await form.validateFields();
		await addItem(uid, {
			name: values.name.trim(),
			category: category.key,
			quantity: values.quantity,
			expiringDate: values.expiringDate.toDate(),
			duration: values.duration ?? null,
			dateOpened: null,
			opened: false,
			recurring: values.recurring,
			barcode: null,
			source: "manual",
		});
		form.resetFields();
		onClose();
	};

	return (
		<Modal
			title={t("items.addTitle")}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ quantity: 1, recurring: false }}
			>
				<Form.Item
					name="name"
					label={t("items.name")}
					rules={[{ required: true }]}
				>
					<Input />
				</Form.Item>
				<Form.Item
					name="quantity"
					label={t("items.quantity")}
					rules={[{ required: true }]}
				>
					<InputNumber min={1} style={{ width: "100%" }} />
				</Form.Item>
				<Form.Item
					name="expiringDate"
					label={t("items.expiringDate")}
					rules={[{ required: true }]}
				>
					<DatePicker style={{ width: "100%" }} />
				</Form.Item>
				<Form.Item name="duration" label={t("items.duration")}>
					<InputNumber min={1} style={{ width: "100%" }} />
				</Form.Item>
				<Form.Item
					name="recurring"
					label={t("items.recurring")}
					valuePropName="checked"
				>
					<Switch />
				</Form.Item>
			</Form>
		</Modal>
	);
}
