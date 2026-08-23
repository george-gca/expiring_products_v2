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
	last_notified_at: timestampSchema.nullable().optional(),
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
	lastNotifiedAt?: Date | null;
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
		lastNotifiedAt: parsed.last_notified_at
			? parsed.last_notified_at.toDate()
			: null,
	};
}

// items is legacy v1 data this codebase has never validated before — a real
// production doc could be malformed in a shape we don't control. Firestore's
// onSnapshot dispatches its success callback via a bare setTimeout with no
// try/catch, so a throw from parseItemDoc inside a snapshot handler bypasses
// the error callback entirely and can wedge a listener's `loading` state at
// `true` forever (same failure mode already fixed for item_history via
// safeParseItemHistoryDoc). Callers that map over a whole snapshot
// (usePantryItems) should use this safe variant and skip entries that fail
// to parse rather than let one bad doc break the whole listener.
export function safeParseItemDoc(id: string, data: unknown): PantryItem | null {
	const result = itemDocSchema.safeParse(data);
	return result.success ? parseItemDoc(id, data) : null;
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
		last_notified_at: item.lastNotifiedAt
			? Timestamp.fromDate(item.lastNotifiedAt)
			: null,
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

export const wasteEventDocSchema = z.object({
	category: z.string().min(1),
	was_opened: z.boolean(),
	was_expired: z.boolean(),
	consumed: z.number().int().nonnegative(),
	discarded: z.number().int().nonnegative(),
	occurred_at: timestampSchema,
});

export interface WasteEvent {
	id: string;
	category: string;
	wasOpened: boolean;
	wasExpired: boolean;
	consumed: number;
	discarded: number;
	occurredAt: Date;
}

export function parseWasteEventDoc(id: string, data: unknown): WasteEvent {
	const parsed = wasteEventDocSchema.parse(data);
	return {
		id,
		category: parsed.category,
		wasOpened: parsed.was_opened,
		wasExpired: parsed.was_expired,
		consumed: parsed.consumed,
		discarded: parsed.discarded,
		occurredAt: parsed.occurred_at.toDate(),
	};
}

// Same rationale as safeParseItemDoc/safeParseItemHistoryDoc above:
// onSnapshot's success callback has no try/catch, so a hook that maps over
// a whole snapshot must use this variant to skip malformed docs instead of
// wedging `loading` at `true` forever.
export function safeParseWasteEventDoc(
	id: string,
	data: unknown,
): WasteEvent | null {
	const result = wasteEventDocSchema.safeParse(data);
	return result.success ? parseWasteEventDoc(id, data) : null;
}
