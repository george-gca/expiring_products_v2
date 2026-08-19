import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp, {
	message: "Expected a Firestore Timestamp",
});

export const itemDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	quantity: z.number().int().nonnegative(),
	expiring_date: timestampSchema,
	duration: z.number().int().positive().nullable(),
	date_opened: timestampSchema.nullable(),
	opened: z.boolean(),
	recurring: z.boolean(),
	barcode: z.string().nullable().optional(),
	source: z.enum(["manual", "barcode"]).optional(),
});

export interface PantryItem {
	id: string;
	name: string;
	category: string;
	quantity: number;
	expiringDate: Date;
	duration: number | null;
	dateOpened: Date | null;
	opened: boolean;
	recurring: boolean;
	barcode: string | null;
	source: "manual" | "barcode";
}

export function parseItemDoc(id: string, data: unknown): PantryItem {
	const parsed = itemDocSchema.parse(data);
	return {
		id,
		name: parsed.name,
		category: parsed.category,
		quantity: parsed.quantity,
		expiringDate: parsed.expiring_date.toDate(),
		duration: parsed.duration,
		dateOpened: parsed.date_opened ? parsed.date_opened.toDate() : null,
		opened: parsed.opened,
		recurring: parsed.recurring,
		barcode: parsed.barcode ?? null,
		source: parsed.source ?? "manual",
	};
}

export function toItemDoc(item: Omit<PantryItem, "id">) {
	return {
		name: item.name,
		category: item.category,
		quantity: item.quantity,
		expiring_date: Timestamp.fromDate(item.expiringDate),
		duration: item.duration,
		date_opened: item.dateOpened ? Timestamp.fromDate(item.dateOpened) : null,
		opened: item.opened,
		recurring: item.recurring,
		barcode: item.barcode,
		source: item.source,
	};
}

export const itemHistoryDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	duration: z.string(),
	recurring: z.boolean(),
});

export interface ItemHistoryEntry {
	name: string;
	category: string;
	duration: string;
	recurring: boolean;
}

export function parseItemHistoryDoc(data: unknown): ItemHistoryEntry {
	return itemHistoryDocSchema.parse(data);
}

// `item_history` is legacy v1 data this codebase has never validated before
// Phase 2 — a real production doc could be malformed in a shape we don't
// control. Firestore's onSnapshot dispatches its success callback via a bare
// setTimeout with no try/catch, so a throw from parseItemHistoryDoc inside a
// snapshot handler bypasses the error callback entirely and can wedge a
// listener's `loading` state at `true` forever. Callers that map over a whole
// snapshot (useShoppingList) should use this safe variant and skip entries
// that fail to parse rather than let one bad doc break the whole listener.
export function safeParseItemHistoryDoc(
	data: unknown,
): ItemHistoryEntry | null {
	const result = itemHistoryDocSchema.safeParse(data);
	return result.success ? result.data : null;
}
