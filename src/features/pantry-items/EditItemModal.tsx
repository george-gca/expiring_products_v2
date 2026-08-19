import { Form, InputNumber, Modal, message, Switch } from "antd";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { db } from "../../lib/firebase";
import { setItemRecurring, updateItemQuantities } from "./firestoreWrites";
import { type PantryItem, safeParseItemHistoryDoc } from "./schema";

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

	// item.recurring reflects this purchase instance's own recurring field,
	// which can disagree with item_history's authoritative per-item-type flag
	// (see firestoreWrites.ts's addItem doc comment for why the two can drift).
	// Seed the switch from item_history instead, falling back to the
	// initialValues default of item.recurring (left untouched below) if the
	// history doc doesn't exist or fails to parse. One-shot read on modal
	// open — this modal opens fresh each time, matching its existing
	// one-shot interaction model; no subscription needed.
	useEffect(() => {
		let cancelled = false;
		const historyId = encodeURIComponent(`${item.category}_${item.name}`);
		getDoc(doc(db, "users", uid, "item_history", historyId))
			.then((snapshot) => {
				if (cancelled || !snapshot.exists()) return;
				const parsed = safeParseItemHistoryDoc(snapshot.data());
				if (parsed) {
					form.setFieldsValue({ recurring: parsed.recurring });
				}
			})
			.catch(() => {
				// Best-effort seed only — item.recurring (already the initial
				// value) stands in on any read/parse failure.
			});
		return () => {
			cancelled = true;
		};
	}, [uid, item.category, item.name, form]);

	const handleOk = async () => {
		const values = await form.validateFields();
		// Each InputNumber is individually capped at item.quantity, but there's
		// no cross-field check, so opened+consumed+discarded can still exceed
		// it (e.g. 2+2 on a quantity-3 item). updateItemQuantities also rejects
		// this, but only after setItemRecurring has already committed its
		// writes — check here first so an invalid edit makes no writes at all.
		if (values.opened + values.consumed + values.discarded > item.quantity) {
			message.error(t("items.quantityExceedsStock"));
			return;
		}
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
