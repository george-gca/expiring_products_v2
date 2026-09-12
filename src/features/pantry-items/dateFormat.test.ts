import { describe, expect, it } from "vitest";
import { applyNumericDateInputMode } from "./dateFormat";

describe("applyNumericDateInputMode", () => {
	it("sets inputmode and pattern on the picker's native input so mobile shows the numeric keypad", () => {
		const container = document.createElement("div");
		const input = document.createElement("input");
		container.appendChild(input);

		applyNumericDateInputMode({ nativeElement: container });

		expect(input.inputMode).toBe("numeric");
		expect(input.pattern).toBe("[0-9]*");
	});

	it("does nothing when the picker ref is not yet attached", () => {
		expect(() => applyNumericDateInputMode(null)).not.toThrow();
	});
});
