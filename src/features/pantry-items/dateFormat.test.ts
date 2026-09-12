import { describe, expect, it, vi } from "vitest";
import { configureDateInputForMobile } from "./dateFormat";

describe("configureDateInputForMobile", () => {
	it("sets inputmode and pattern on the picker's native input so mobile shows the numeric keypad", () => {
		const container = document.createElement("div");
		const input = document.createElement("input");
		container.appendChild(input);

		configureDateInputForMobile({ nativeElement: container });

		expect(input.inputMode).toBe("numeric");
		expect(input.pattern).toBe("[0-9]*");
	});

	it("does nothing when the picker ref is not yet attached", () => {
		expect(() => configureDateInputForMobile(null)).not.toThrow();
	});

	it("stops a click on the input from bubbling, so it can't trigger the picker's open-on-click behavior", () => {
		const container = document.createElement("div");
		const input = document.createElement("input");
		container.appendChild(input);
		const containerClickHandler = vi.fn();
		container.addEventListener("click", containerClickHandler);

		configureDateInputForMobile({ nativeElement: container });
		input.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(containerClickHandler).not.toHaveBeenCalled();
	});
});
