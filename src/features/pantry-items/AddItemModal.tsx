import { BarcodeOutlined } from "@ant-design/icons";
import {
	Button,
	Checkbox,
	DatePicker,
	Form,
	Input,
	InputNumber,
	Modal,
	Select,
	Switch,
} from "antd";
import type { Dayjs } from "dayjs";
import type { FocusEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { message } from "../../lib/feedback";
import { BarcodeScanner } from "../barcode/BarcodeScanner";
import { upsertBarcodeProduct } from "../barcode/firestoreWrites";
import { lookupBarcode } from "../barcode/lookupBarcode";
import type { Category } from "../categories/schema";
import { ClassFormModal } from "../classes/ClassFormModal";
import type { ItemClass } from "../classes/schema";
import { configureDateInputForMobile, datePickerFormats } from "./dateFormat";
import { addItem } from "./firestoreWrites";
import { QuantityStepper } from "./QuantityStepper";

const CREATE_CLASS_VALUE = "__create__";

interface AddItemFormValues {
	name: string;
	barcode?: string;
	quantity: number;
	noExpiration: boolean;
	expiringDate?: Dayjs;
	duration?: number;
	recurring: boolean;
	classKey?: string;
}

export function AddItemModal({
	uid,
	category,
	open,
	onClose,
	initialName,
	initialRecurring = false,
	classes,
	initialClassKey,
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
	classes: ItemClass[];
	// Set when opened from the Shopping Mode cart-icon flow on a classed
	// entry, so the new item defaults into the same class as the shopping
	// list entry it came from.
	initialClassKey?: string;
}) {
	const { t, i18n } = useTranslation();
	const [form] = Form.useForm<AddItemFormValues>();
	const [scannerOpen, setScannerOpen] = useState(false);
	// Local state (not Form.useWatch) so the expiring-date/duration fields'
	// visibility is correct on the very first render — Form.useWatch only
	// picks up initialValues one render later, which briefly shows the wrong
	// fields.
	const [noExpiration, setNoExpiration] = useState(false);
	const [classFormOpen, setClassFormOpen] = useState(false);

	// Re-derived during render (rather than in the useEffect below, which
	// would cause an extra commit) — the React-recommended "adjusting state
	// when a prop changes" pattern: https://react.dev/learn/you-might-not-need-an-effect
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (open) {
			setScannerOpen(false);
			setNoExpiration(false);
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
				noExpiration: false,
				classKey: initialClassKey,
			});
		}
	}, [open, initialName, initialRecurring, initialClassKey, form]);

	const applyBarcodeLookup = async (barcode: string) => {
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

	const handleDetect = async (barcode: string) => {
		setScannerOpen(false);
		// A scan always starts a fresh count, regardless of whatever quantity
		// was left over in the form store from a prior cancelled add.
		form.setFieldsValue({ barcode, quantity: 1 });
		await applyBarcodeLookup(barcode);
	};

	const handleBarcodeBlur = (e: FocusEvent<HTMLInputElement>) => {
		const barcode = e.target.value.trim();
		if (barcode) {
			applyBarcodeLookup(barcode);
		}
	};

	const handleOk = async () => {
		let values: AddItemFormValues;
		try {
			values = await form.validateFields();
		} catch {
			// antd already highlights the invalid fields; no toast needed.
			return;
		}
		const barcode = values.barcode?.trim() || null;
		try {
			await addItem(uid, {
				name: values.name.trim(),
				category: category.key,
				quantity: values.quantity,
				expiringDate: values.noExpiration
					? null
					: (values.expiringDate?.toDate() ?? null),
				duration: values.noExpiration ? null : (values.duration ?? null),
				dateOpened: null,
				opened: false,
				recurring: values.recurring,
				barcode,
				source: barcode ? "barcode" : "manual",
				classKey: values.classKey ?? null,
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
						noExpiration: false,
						recurring: initialRecurring,
						classKey: initialClassKey,
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
						<Input onBlur={handleBarcodeBlur} />
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
						<QuantityStepper min={1} />
					</Form.Item>
					<Form.Item name="noExpiration" valuePropName="checked">
						<Checkbox onChange={(e) => setNoExpiration(e.target.checked)}>
							{t("items.noExpiration")}
						</Checkbox>
					</Form.Item>
					{!noExpiration && (
						<>
							<Form.Item
								name="expiringDate"
								label={t("items.expiringDate")}
								rules={[{ required: true }]}
							>
								<DatePicker
									ref={configureDateInputForMobile}
									format={datePickerFormats(i18n.language)}
									placement="topLeft"
									style={{ width: "100%" }}
								/>
							</Form.Item>
							<Form.Item name="duration" label={t("items.duration")}>
								<InputNumber min={1} style={{ width: "100%" }} />
							</Form.Item>
						</>
					)}
					<Form.Item
						name="recurring"
						label={t("items.recurring")}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item name="classKey" label={t("items.itemClassLabel")}>
						<Select
							allowClear
							options={[
								...classes.map((cls) => ({ value: cls.key, label: cls.name })),
								{
									value: CREATE_CLASS_VALUE,
									label: t("items.itemClassCreateOption"),
								},
							]}
							onChange={(value) => {
								if (value === CREATE_CLASS_VALUE) {
									form.setFieldsValue({ classKey: undefined });
									setClassFormOpen(true);
								}
							}}
						/>
					</Form.Item>
				</Form>
			)}
			<ClassFormModal
				uid={uid}
				category={category.key}
				open={classFormOpen}
				onClose={() => setClassFormOpen(false)}
				editingClass={null}
				onCreated={(classId) => form.setFieldsValue({ classKey: classId })}
			/>
		</Modal>
	);
}
