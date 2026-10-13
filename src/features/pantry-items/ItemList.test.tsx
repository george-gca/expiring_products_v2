import "../../lib/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { Category } from "../categories/schema";
import { useClasses } from "../classes/useClasses";
import { ItemList } from "./ItemList";
import type { PantryItem } from "./schema";
import { useUiPreferencesStore } from "./store";
import { usePantryItems } from "./usePantryItems";

vi.mock("./usePantryItems", () => ({ usePantryItems: vi.fn() }));
const mockedUsePantryItems = vi.mocked(usePantryItems);

// Mocked the same way as usePantryItems above: the "group by class" describe
// below overrides this with the real implementation (it needs genuine
// emulator-backed Firestore data), while every other, pre-existing describe
// in this file renders synchronously and has no opinion on classes — so it
// gets a default empty/loaded value here rather than hitting the emulator.
vi.mock("../classes/useClasses", () => ({ useClasses: vi.fn() }));
const mockedUseClasses = vi.mocked(useClasses);
beforeEach(() => {
	mockedUseClasses.mockReturnValue({ classes: [], loading: false });
});

const category: Category = {
	id: "foods-id",
	key: "foods",
	name: "Foods",
	emoji: "🍎",
	order: 0,
	archived: false,
};

function makeItem(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: overrides.name ?? "item",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2027-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("ItemList search", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		useUiPreferencesStore.setState({ searchByCategory: {} });
	});

	it("shows only items whose name matches the typed search text, case-insensitively", async () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Coffee" }), makeItem({ name: "Bananas" })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-search-1"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={12}
				hideDistantEnabled
			/>,
		);

		expect(screen.getByText("Coffee")).toBeInTheDocument();
		expect(screen.getByText("Bananas")).toBeInTheDocument();

		await userEvent.type(
			screen.getByRole("searchbox", { name: /search/i }),
			"coff",
		);

		expect(screen.getByText("Coffee")).toBeInTheDocument();
		expect(screen.queryByText("Bananas")).not.toBeInTheDocument();
	});

	it("shows the empty state when no item matches the search text", async () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Coffee" })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-search-2"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={12}
				hideDistantEnabled
			/>,
		);

		await userEvent.type(
			screen.getByRole("searchbox", { name: /search/i }),
			"zzz",
		);

		expect(screen.queryByText("Coffee")).not.toBeInTheDocument();
	});
});

describe("ItemList hideDistantEnabled", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("hides a no-expiration item when hideDistantEnabled is true, regardless of the threshold", () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Trash Bags", expiringDate: null })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-hide-distant-1"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={999}
				hideDistantEnabled
			/>,
		);

		expect(screen.queryByText("Trash Bags")).not.toBeInTheDocument();
	});

	it("shows a no-expiration item when hideDistantEnabled is false", () => {
		mockedUsePantryItems.mockReturnValue({
			items: [makeItem({ name: "Trash Bags", expiringDate: null })],
			loading: false,
		});

		render(
			<ItemList
				uid="test-user-hide-distant-2"
				category={category}
				categories={[category]}
				lowStockThreshold={1}
				hideDistantThresholdMonths={3}
				hideDistantEnabled={false}
			/>,
		);

		expect(screen.getByText("Trash Bags")).toBeInTheDocument();
	});
});

describe("ItemList group by class", () => {
	const classUid = "test-user-item-list-class-1";

	afterEach(async () => {
		vi.restoreAllMocks();
		await clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID);
	});

	it("collapses classed items into a group row when the toggle is switched on", async () => {
		// This test exercises the real onSnapshot-backed hooks against the
		// emulator (unlike the other describes above, which stub them), so it
		// needs the actual implementations instead of the module-level mocks.
		const { usePantryItems: actualUsePantryItems } =
			await vi.importActual<typeof import("./usePantryItems")>(
				"./usePantryItems",
			);
		mockedUsePantryItems.mockImplementation(actualUsePantryItems);
		const { useClasses: actualUseClasses } = await vi.importActual<
			typeof import("../classes/useClasses")
		>("../classes/useClasses");
		mockedUseClasses.mockImplementation(actualUseClasses);

		await addDoc(collection(db, "users", classUid, "classes"), {
			key: "soap-key",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
		await addDoc(collection(db, "users", classUid, "items"), {
			name: "Dove Soap",
			category: "cleaning",
			quantity: 1,
			expiring_date: null,
			duration: null,
			date_opened: null,
			opened: false,
			recurring: false,
			barcode: null,
			source: "manual",
			class_key: "soap-key",
		});

		const cleaningCategory: Category = {
			id: "cleaning-id",
			key: "cleaning",
			name: "Cleaning",
			emoji: "🧼",
			order: 0,
			archived: false,
		};

		render(
			<ItemList
				uid={classUid}
				category={cleaningCategory}
				categories={[cleaningCategory]}
				lowStockThreshold={3}
				hideDistantThresholdMonths={6}
				hideDistantEnabled={false}
			/>,
		);

		await screen.findByText("Dove Soap");
		expect(screen.queryByText("Soap (1)")).not.toBeInTheDocument();

		await userEvent.click(
			screen.getByRole("switch", { name: /group by class/i }),
		);

		await screen.findByText("Soap (1)");
		expect(screen.queryByText("Dove Soap")).not.toBeInTheDocument();
	});
});
