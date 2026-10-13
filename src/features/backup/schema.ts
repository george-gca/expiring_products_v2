import { z } from "zod";

const backupSettingsSchema = z.object({
	lowStockThreshold: z.number().int().positive(),
	language: z.enum(["pt-br", "en-us"]),
	hideDistantThresholdMonths: z.number().int().positive(),
	hideDistantEnabled: z.boolean(),
	notificationsEnabled: z.boolean(),
	notifyDaysBeforeExpiry: z.number().int().positive(),
	notifyHourLocal: z.number().int().min(0).max(23),
	notifyTimezone: z.string().min(1),
});

const backupCategorySchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1),
	emoji: z.string().min(1),
	order: z.number().int().nonnegative(),
});

const backupItemSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	quantity: z.number().int().nonnegative(),
	expiringDate: z.string().datetime().nullable(),
	duration: z.number().int().positive().nullable(),
	dateOpened: z.string().datetime().nullable(),
	opened: z.boolean(),
	recurring: z.boolean(),
	barcode: z.string().nullable(),
	source: z.enum(["manual", "barcode"]),
	// Optional so backup files exported before item classes still parse.
	classKey: z.string().nullable().optional(),
});

const backupItemHistorySchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	duration: z.string(),
	recurring: z.boolean(),
	// The durable per-name class membership Shopping Mode reads; optional so
	// pre-classes backup files still parse.
	classKey: z.string().nullable().optional(),
});

const backupClassSchema = z.object({
	key: z.string().min(1),
	category: z.string().min(1),
	name: z.string().min(1),
	archived: z.boolean(),
});

export const backupSchema = z.object({
	version: z.literal(1),
	exportedAt: z.string().datetime(),
	settings: backupSettingsSchema,
	categories: z.array(backupCategorySchema),
	items: z.array(backupItemSchema),
	itemHistory: z.array(backupItemHistorySchema),
	classes: z.array(backupClassSchema).optional().default([]),
});

export type Backup = z.infer<typeof backupSchema>;

export function parseBackup(data: unknown): Backup {
	return backupSchema.parse(data);
}

// A malformed backup *file* should fail loudly (see settings.schema.ts's
// `.catch()` for the different case this deliberately does NOT follow: a
// live onSnapshot listener must never get stuck on bad data already in
// Firestore, but a user-supplied import file failing validation should
// reject the whole import, not silently substitute defaults).
export function safeParseBackup(data: unknown): Backup | null {
	const result = backupSchema.safeParse(data);
	return result.success ? result.data : null;
}
