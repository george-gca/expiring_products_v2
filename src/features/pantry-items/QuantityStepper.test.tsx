import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuantityStepper } from "./QuantityStepper";

describe("QuantityStepper", () => {
	it("sets a numeric inputmode so mobile shows the numeric keypad", () => {
		render(<QuantityStepper value={1} onChange={() => {}} />);

		const input = screen.getByRole("spinbutton");
		expect(input).toHaveAttribute("inputmode", "numeric");
		expect(input).toHaveAttribute("pattern", "[0-9]*");
	});
});
