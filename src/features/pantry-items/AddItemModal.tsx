import { BarcodeOutlined } from "@ant-design/icons";
import {
	Button,
	DatePicker,
	Form,
	Input,
	InputNumber,
	Modal,
	message,
	Switch,
} from "antd";
import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarcodeScanner } from "../barcode/BarcodeScanner";
import { upsertBarcodeProduct } from "../barcode/firestoreWrites";
import { lookupBarcode } from "../barcode/lookupBarcode";
import type { Category } from "../categories/schema";
import { addItem } from "./firestoreWrites";

interface AddItemFormValues {
	name: string;
	barcode?: string;
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
	const [scannerOpen, setScannerOpen] = useState(false);

	// Re-derived during render (rather than in the useEffect below, which
	// would cause an extra commit) — the React-recommended "adjusting state
	// when a prop changes" pattern: https://react.dev/learn/you-might-not-need-an-effect
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (open) {
			setScannerOpen(false);
		}
	}

	// `form` is a single instance shared across the modal's open/close cycles
	// (declared in this component, not recreated by `destroyOnHidden`), so its
	// internal field store persists even though the <Form> element itself
	// unmounts. Ant Design's `initialValues` only seeds fields the store has
	// never held a value for, so stale `name`/`barcode`/`recurring` from an
	// earlier open survive remounts unless explicitly overwritten here. This
	// stays a useEffect (rather than joining the render-time resync above)
	// since `form.setFieldsValue` is an imperative call into an external
	// mutable object, not a React state setter.
	useEffect(() => {
		if (open) {
			form.setFieldsValue({
				name: initialName ?? "",
				barcode: "",
				recurring: initialRecurring,
			});
		}
	}, [open, initialName, initialRecurring, form]);

	const handleDetect = async (barcode: string) => {
		setScannerOpen(false);
		form.setFieldsValue({ barcode });
		const result = await lookupBarcode(uid, barcode, category.key);
		if (result) {
			form.setFieldsValue({
				name: result.name,
				...(result.suggestedDuration !== null
					? { duration: result.suggestedDuration }
					: {}),
			});
		}
	};

	const handleOk = async () => {
		const values = await form.validateFields();
		const barcode = values.barcode?.trim() || null;
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
				barcode,
				source: barcode ? "barcode" : "manual",
			});
			if (barcode) {
				// Associates this barcode with the item's name/category/duration
				// regardless of whether it came from a successful scan lookup or
				// was typed in by hand — the next scan (or manual entry) of the
				// same barcode finds it via lookupBarcode's cache check, building
				// up a household-specific barcode database over time.
				await upsertBarcodeProduct(uid, barcode, {
					name: values.name.trim(),
					category: category.key,
					suggestedDuration: values.duration ?? null,
					source: "manual",
				});
			}
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
			footer={scannerOpen ? null : undefined}
			destroyOnHidden
		>
			{scannerOpen ? (
				<>
					<BarcodeScanner onDetect={handleDetect} />
					<Button
						onClick={() => setScannerOpen(false)}
						style={{ marginTop: 8 }}
					>
						{t("items.cancelScan")}
					</Button>
				</>
			) : (
				<Form
					form={form}
					layout="vertical"
					initialValues={{
						name: initialName ?? "",
						barcode: "",
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
					<Form.Item name="barcode" label={t("items.barcode")}>
						<Input />
					</Form.Item>
					<Button
						icon={<BarcodeOutlined />}
						onClick={() => setScannerOpen(true)}
						style={{ marginBottom: 16 }}
					>
						{t("items.scanBarcode")}
					</Button>
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
			)}
		</Modal>
	);
}
