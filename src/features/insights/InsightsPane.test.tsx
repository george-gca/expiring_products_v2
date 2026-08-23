import "../../lib/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { Category } from "../categories/schema";
import { toItemDoc } from "../pantry-items/schema";
import { InsightsPane } from "./InsightsPane";

const uid = "test-user-insights-pane-1";

const categories: Category[] = [
	{
		id: "foods-id",
		key: "foods",
		name: "Foods",
		emoji: "🍎",
		order: 0,
		archived: false,
	},
	{
		id: "medicines-id",
		key: "medicines",
		name: "Medicines",
		emoji: "💊",
		order: 1,
		archived: false,
	},
];

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

// Category cells render as "<emoji> <name>" (e.g. "🍎 Foods") in one text
// node, and every numeric column also appears in the "All categories"
// total row — so assertions below match the combined label text and scope
// numeric lookups to one row via `within`, rather than a bare getByText
// that would either miss the combined string or hit more than one match.
describe("InsightsPane", () => {
	it("renders a row per category, plus an All categories row, all zero when there's no data", async () => {
		render(<InsightsPane uid={uid} categories={categories} />);

		await waitFor(() =>
			expect(screen.getByText("🍎 Foods")).toBeInTheDocument(),
		);
		expect(screen.getByText("💊 Medicines")).toBeInTheDocument();
		expect(screen.getByText("All categories")).toBeInTheDocument();
	});

	it("reflects a seeded sealed item in the Right now block", async () => {
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Milk",
				category: "foods",
				quantity: 4,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);

		render(<InsightsPane uid={uid} categories={categories} />);

		const foodsRow = await waitFor(() =>
			screen.getByText("🍎 Foods").closest("tr"),
		);
		expect(foodsRow).not.toBeNull();
		expect(within(foodsRow as HTMLElement).getByText("4")).toBeInTheDocument();
	});

	it("reflects a seeded waste_events doc in the All time block", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "medicines",
			was_opened: false,
			was_expired: true,
			consumed: 0,
			discarded: 2,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});

		render(<InsightsPane uid={uid} categories={categories} />);

		const medicinesRow = await waitFor(() =>
			screen.getByText("💊 Medicines").closest("tr"),
		);
		expect(medicinesRow).not.toBeNull();
		expect(
			within(medicinesRow as HTMLElement).getByText("2"),
		).toBeInTheDocument();
	});
});
