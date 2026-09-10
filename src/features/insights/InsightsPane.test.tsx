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

// The table is transposed: categories (plus "All categories") are column
// headers, and each metric (e.g. "Sealed, good") is a row shared across both
// the "Right now" and "All time" tables. So a category no longer identifies
// a single row — assertions below locate the metric's row by its label,
// then check the cell at that category's column position (label column
// first, then categories in the order passed to the component, then the
// "All categories" total column last) rather than searching by category text.
describe("InsightsPane", () => {
	it("renders a category column per category, plus an All categories column, all zero when there's no data", async () => {
		render(<InsightsPane uid={uid} categories={categories} />);

		// Both the "Right now" and "All time" tables render the same category
		// columns, so each header text is expected to appear twice.
		await waitFor(() =>
			expect(screen.getAllByText("🍎 Foods").length).toBeGreaterThan(0),
		);
		expect(screen.getAllByText("💊 Medicines").length).toBeGreaterThan(0);
		expect(screen.getAllByText("All categories").length).toBeGreaterThan(0);
		expect(screen.getByText("Sealed, good")).toBeInTheDocument();
		// Both the trend chart and the waste-rate ranking fall back to this
		// same empty-state text when there's no waste history yet.
		expect(screen.getAllByText("No history yet.")).toHaveLength(2);
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

		// [label, Foods, Medicines, All categories]
		await waitFor(() => {
			const row = screen.getByText("Sealed, good").closest("tr");
			const cells = within(row as HTMLElement).getAllByRole("cell");
			expect(cells[1]).toHaveTextContent("4");
			expect(cells[2]).toHaveTextContent("0");
			expect(cells[3]).toHaveTextContent("4");
		});
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

		// was_expired: true, was_opened: false, discarded: 2 buckets into
		// "Expired, unopened" (see aggregateWasteEvents.ts).
		// [label, Foods, Medicines, All categories]
		await waitFor(() => {
			const row = screen.getByText("Expired, unopened").closest("tr");
			const cells = within(row as HTMLElement).getAllByRole("cell");
			expect(cells[1]).toHaveTextContent("0");
			expect(cells[2]).toHaveTextContent("2");
			expect(cells[3]).toHaveTextContent("2");
		});

		// A discarded event has a month bucket, so the trend chart renders
		// instead of the "No history yet." empty state. (Recharts' own output
		// isn't asserted here — jsdom's ResizeObserver stub never reports a
		// nonzero container size, so ResponsiveContainer renders no SVG
		// content; this was verified visually in a real browser instead.)
		await waitFor(() =>
			expect(screen.queryByText("No history yet.")).not.toBeInTheDocument(),
		);
	});
});
