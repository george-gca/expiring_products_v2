// Antd's DatePicker parses/displays "YYYY-MM-DD" by default regardless of
// ConfigProvider's `locale` — that prop only covers calendar labels, not the
// typed-entry format — so the day/month order must be set explicitly here.
// Two-digit year (dayjs pivots YY 00-68 to 20xx, 69-99 to 19xx — irrelevant
// for pantry expiry dates) per user request, so typing "26" enters 2026.
const DATE_FORMATS: Record<string, string> = {
	"pt-BR": "DD/MM/YY",
	"en-US": "MM/DD/YY",
};

// A separator-free second format (e.g. "DDMMYY") accepted for typed parsing
// alongside the displayed one, so typing plain digits like "010226" works
// without the user having to type "/" themselves. (Antd's DatePicker also
// has a `format: { type: "mask" }` cell-based auto-slash input mode, but its
// focus/selection-driven internals proved unreliable to drive in practice —
// both in automated interaction and in manual testing — so this simpler
// free-typing approach was used instead.)
const RAW_DATE_FORMATS: Record<string, string> = {
	"pt-BR": "DDMMYY",
	"en-US": "MMDDYY",
};

export function datePickerFormats(language: string): [string, string] {
	return [
		DATE_FORMATS[language] ?? DATE_FORMATS["pt-BR"],
		RAW_DATE_FORMATS[language] ?? RAW_DATE_FORMATS["pt-BR"],
	];
}

// Antd's DatePicker has no `inputMode`/`pattern` prop — its underlying
// <input> isn't reachable through props at all (rc-picker's SingleSelector
// only forwards unknown props to the root wrapper div, not the input it
// renders internally) — so the only way to get the mobile numeric keypad on
// this field is to reach into the DOM via the picker's own ref. Digits-only
// (no "/") because the raw separator-free format above already lets typing
// plain digits parse correctly, so the numeric keypad never needs to offer
// "/".
export function applyNumericDateInputMode(
	picker: { nativeElement: HTMLElement } | null,
): void {
	const input = picker?.nativeElement.querySelector("input");
	if (input) {
		input.inputMode = "numeric";
		input.pattern = "[0-9]*";
	}
}
