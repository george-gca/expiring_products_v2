import { describe, expect, it } from "vitest";
import i18n from "./i18n";

describe("i18n", () => {
	it("falls back to pt-br and resolves a known key", async () => {
		await i18n.changeLanguage("xx-not-a-real-locale");
		expect(i18n.t("items.empty")).toBe("Nenhum item aqui.");
	});

	it("resolves the same key in en-us when selected", async () => {
		await i18n.changeLanguage("en-us");
		expect(i18n.t("items.empty")).toBe("No items here.");
	});
});
