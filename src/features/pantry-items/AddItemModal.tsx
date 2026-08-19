import {
	DatePicker,
	Form,
	Input,
	InputNumber,
	Modal,
	message,
	Switch,
} from "antd";
import type { Dayjs } from "dayjs";
import { useEffect } from "react";
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
	initialName,
	initialRecurring = false,
}: {
	uid: string;
	category: Category;
	open: boolean;
	onClose: () => void;
	initialName?: string;
	// Whether the recurring switch should default on. ItemList passes `true`
	// when this modal is opened from the shopping list's cart-icon flow (an
	// entry only appears there because item_history already marked that item
	// type recurring) and `false` from the ordinary "+" button.
	initialRecurring?: boolean;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<AddItemFormValues>();

	// `form` is a single instance shared across the modal's open/close cycles
	// (declared in this component, not recreated by `destroyOnHidden`), so its
	// internal field store persists even though the <Form> element itself
	// unmounts. Ant Design's `initialValues` only seeds fields the store has
	// never held a value for, so stale `name`/`recurring` from an earlier open
	// survive remounts unless explicitly overwritten here.
	useEffect(() => {
		if (open) {
			form.setFieldsValue({
				name: initialName ?? "",
				recurring: initialRecurring,
			});
		}
	}, [open, initialName, initialRecurring, form]);

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
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
		} catch {
			message.error("Something went wrong, please try again");
		}
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
				initialValues={{
					name: initialName ?? "",
					quantity: 1,
					recurring: initialRecurring,
				}}
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
