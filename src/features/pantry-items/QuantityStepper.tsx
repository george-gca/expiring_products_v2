import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, InputNumber, Space } from "antd";

// Antd InputNumber's default up/down stepper is too small to tap reliably on
// a phone screen — this swaps it for full-size +/- buttons to the input's
// right. Value/onChange match InputNumber's contract so Form.Item can drive
// it like any other form control.
export function QuantityStepper({
	value,
	onChange,
	min = 0,
	max,
}: {
	value?: number;
	onChange?: (value: number) => void;
	min?: number;
	max?: number;
}) {
	const current = value ?? min;

	const step = (delta: number) => {
		const next = current + delta;
		if (next < min || (max !== undefined && next > max)) return;
		onChange?.(next);
	};

	return (
		<Space.Compact style={{ width: "100%" }}>
			<InputNumber
				controls={false}
				value={value}
				onChange={(next) => onChange?.(next ?? min)}
				min={min}
				max={max}
				style={{ width: "100%" }}
			/>
			<Button
				icon={<MinusOutlined />}
				onClick={() => step(-1)}
				disabled={current <= min}
			/>
			<Button
				icon={<PlusOutlined />}
				onClick={() => step(1)}
				disabled={max !== undefined && current >= max}
			/>
		</Space.Compact>
	);
}
