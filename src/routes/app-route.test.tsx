import "../lib/i18n";
import { render } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as useCategoriesModule from "../features/categories/useCategories";
import * as useSettingsModule from "../features/settings/useSettings";
import i18n from "../lib/i18n";
import { AppRoute } from "./app-route";

const user = { uid: "test-user-app-route-1" } as User;

// vi.spyOn on the same i18n singleton across multiple `it()` blocks
// accumulates call history unless explicitly cleared between tests.
afterEach(() => {
	vi.restoreAllMocks();
});

describe("AppRoute language propagation", () => {
	it("calls i18n.changeLanguage when settings.language is available", () => {
		vi.spyOn(useCategoriesModule, "useCategories").mockReturnValue({
			categories: [],
			loading: false,
		});
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "en-us",
				hideDistantThresholdMonths: 3,
			},
			loading: false,
		});
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<AppRoute user={user} />);

		expect(changeLanguageSpy).toHaveBeenCalledWith("en-us");
	});

	it("does not call i18n.changeLanguage while settings are still loading", () => {
		vi.spyOn(useCategoriesModule, "useCategories").mockReturnValue({
			categories: [],
			loading: false,
		});
		vi.spyOn(useSettingsModule, "useSettings").mockReturnValue({
			settings: {
				lowStockThreshold: 3,
				language: "pt-br",
				hideDistantThresholdMonths: 3,
			},
			loading: true,
		});
		const changeLanguageSpy = vi
			.spyOn(i18n, "changeLanguage")
			.mockImplementation(() => Promise.resolve(i18n.t));

		render(<AppRoute user={user} />);

		expect(changeLanguageSpy).not.toHaveBeenCalled();
	});
});
