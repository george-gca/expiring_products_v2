import { z } from "zod";

const DEFAULT_LOW_STOCK_THRESHOLD = 3;
const DEFAULT_LANGUAGE = "pt-br";
const DEFAULT_HIDE_DISTANT_THRESHOLD_MONTHS = 3;
const DEFAULT_NOTIFICATIONS_ENABLED = false;
const DEFAULT_NOTIFY_DAYS_BEFORE_EXPIRY = 3;
const DEFAULT_NOTIFY_HOUR_LOCAL = 8;
const DEFAULT_NOTIFY_TIMEZONE = "America/Sao_Paulo";

// `.catch()` on every field falls back to its default instead of throwing
// when the field is missing or malformed. This is defense in depth on top
// of each write path's own validation: bad data already in Firestore (or a
// future writer that skips validation) must not be able to throw here.
// Firestore's onSnapshot dispatches its success callback via a bare
// setTimeout with no try/catch, so a throw from parseSettingsDoc inside
// useSettings's snapshot handler bypasses the error callback and wedges
// `loading` at `true` forever — which in turn makes AppRoute's
// `if (settingsLoading) return null` gate render nothing, permanently, for
// that user.
export const settingsDocSchema = z.object({
	lowStockThreshold: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_LOW_STOCK_THRESHOLD),
	language: z.enum(["pt-br", "en-us"]).catch(DEFAULT_LANGUAGE),
	hideDistantThresholdMonths: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_HIDE_DISTANT_THRESHOLD_MONTHS),
	notificationsEnabled: z.boolean().catch(DEFAULT_NOTIFICATIONS_ENABLED),
	notifyDaysBeforeExpiry: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_NOTIFY_DAYS_BEFORE_EXPIRY),
	notifyHourLocal: z
		.number()
		.int()
		.min(0)
		.max(23)
		.catch(DEFAULT_NOTIFY_HOUR_LOCAL),
	notifyTimezone: z.string().min(1).catch(DEFAULT_NOTIFY_TIMEZONE),
});

export interface Settings {
	lowStockThreshold: number;
	language: "pt-br" | "en-us";
	hideDistantThresholdMonths: number;
	notificationsEnabled: boolean;
	notifyDaysBeforeExpiry: number;
	notifyHourLocal: number;
	notifyTimezone: string;
}

export function parseSettingsDoc(data: unknown): Settings {
	return settingsDocSchema.parse(data);
}
