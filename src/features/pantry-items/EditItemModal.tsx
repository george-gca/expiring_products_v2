import { Form, InputNumber, Modal, message, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { setItemRecurring, updateItemQuantities } from "./firestoreWrites";
import type { PantryItem } from "./schema";

interface EditFormValues {
	opened: number;
	consumed: number;
	discarded: number;
	recurring: boolean;
}

export function EditItemModal({
	uid,
	item,
	onClose,
}: {
	uid: string;
	item: PantryItem;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<EditFormValues>();

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			// setItemRecurring must run first: updateItemQuantities can delete the
			// item doc (full consumption/discard), and setItemRecurring's updateDoc
			// against that doc would then throw "document not found".
			await setItemRecurring(uid, item, values.recurring);
			await updateItemQuantities(uid, item.id, values);
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={item.name}
			open
			onOk={handleOk}
			onCancel={onClose}
			destroyOnHidden
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{
					opened: 0,
					consumed: 0,
					discarded: 0,
					recurring: item.recurring,
				}}
			>
				<Form.Item name="opened" label={t("items.openedItems")}>
					<InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
				</Form.Item>
				<Form.Item name="consumed" label={t("items.consumedItems")}>
					<InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
				</Form.Item>
				<Form.Item name="discarded" label={t("items.discardedItems")}>
					<InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
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
