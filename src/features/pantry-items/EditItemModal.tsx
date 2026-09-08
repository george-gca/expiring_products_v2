import { DeleteOutlined, EditOutlined, UndoOutlined } from "@ant-design/icons";
import {
	Button,
	DatePicker,
	Flex,
	Form,
	Input,
	InputNumber,
	Modal,
	message,
	Popconfirm,
	Switch,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "../../lib/firebase";
import { datePickerFormats } from "./dateFormat";
import {
	deleteItem,
	setItemRecurring,
	updateItemDetails,
	updateItemQuantities,
} from "./firestoreWrites";
import { QuantityStepper } from "./QuantityStepper";
import { type PantryItem, safeParseItemHistoryDoc } from "./schema";

interface UsageFormValues {
	opened: number;
	consumed: number;
	discarded: number;
	recurring: boolean;
}

interface DetailsFormValues {
	name: string;
	quantity: number;
	expiringDate: Dayjs;
	duration?: number;
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
	const { t, i18n } = useTranslation();
	const [mode, setMode] = useState<"usage" | "details">("usage");
	const [usageForm] = Form.useForm<UsageFormValues>();
	const [detailsForm] = Form.useForm<DetailsFormValues>();

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
					usageForm.setFieldsValue({ recurring: parsed.recurring });
				}
			})
			.catch(() => {
				// Best-effort seed only — item.recurring (already the initial
				// value) stands in on any read/parse failure.
			});
		return () => {
			cancelled = true;
		};
	}, [uid, item.category, item.name, usageForm]);

	const handleUsageOk = async () => {
		const values = await usageForm.validateFields();
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

	const handleDetailsOk = async () => {
		const values = await detailsForm.validateFields();
		try {
			await updateItemDetails(uid, item.id, {
				name: values.name.trim(),
				quantity: values.quantity,
				expiringDate: values.expiringDate.toDate(),
				duration: values.duration ?? null,
			});
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	const handleDelete = async () => {
		try {
			await deleteItem(uid, item.id);
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={
				<Flex
					justify="space-between"
					align="center"
					style={{ paddingRight: 24 }}
				>
					{item.name}
					<Button
						type="text"
						size="small"
						icon={mode === "usage" ? <EditOutlined /> : <UndoOutlined />}
						aria-label={t(
							mode === "usage" ? "items.editDetails" : "items.recordUsage",
						)}
						onClick={() =>
							setMode((current) => (current === "usage" ? "details" : "usage"))
						}
					/>
				</Flex>
			}
			open
			onOk={mode === "usage" ? handleUsageOk : handleDetailsOk}
			onCancel={onClose}
			destroyOnHidden
			footer={(_, { OkBtn, CancelBtn }) => (
				<Flex justify="space-between" align="center">
					<Popconfirm
						title={t("items.deleteConfirmTitle")}
						onConfirm={handleDelete}
						okButtonProps={{ danger: true }}
					>
						<Button danger icon={<DeleteOutlined />}>
							{t("items.delete")}
						</Button>
					</Popconfirm>
					<Flex gap={8}>
						<CancelBtn />
						<OkBtn />
					</Flex>
				</Flex>
			)}
		>
			{mode === "usage" ? (
				<Form
					key="usage"
					form={usageForm}
					layout="vertical"
					initialValues={{
						opened: 0,
						consumed: 0,
						discarded: 0,
						recurring: item.recurring,
					}}
				>
					<Form.Item name="opened" label={t("items.openedItems")}>
						<QuantityStepper min={0} max={item.quantity} />
					</Form.Item>
					<Form.Item name="consumed" label={t("items.consumedItems")}>
						<QuantityStepper min={0} max={item.quantity} />
					</Form.Item>
					<Form.Item name="discarded" label={t("items.discardedItems")}>
						<QuantityStepper min={0} max={item.quantity} />
					</Form.Item>
					<Form.Item
						name="recurring"
						label={t("items.recurring")}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</Form>
			) : (
				<Form
					key="details"
					form={detailsForm}
					layout="vertical"
					initialValues={{
						name: item.name,
						quantity: item.quantity,
						expiringDate: dayjs(item.expiringDate),
						duration: item.duration ?? undefined,
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
						<QuantityStepper min={1} />
					</Form.Item>
					<Form.Item
						name="expiringDate"
						label={t("items.expiringDate")}
						rules={[{ required: true }]}
					>
						<DatePicker
							format={datePickerFormats(i18n.language)}
							style={{ width: "100%" }}
						/>
					</Form.Item>
					<Form.Item name="duration" label={t("items.duration")}>
						<InputNumber min={1} style={{ width: "100%" }} />
					</Form.Item>
				</Form>
			)}
		</Modal>
	);
}
