import { z } from "zod";

const DEFAULT_LOW_STOCK_THRESHOLD = 3;

// `.catch()` falls back to the default threshold instead of throwing when
// lowStockThreshold is missing, non-numeric, non-integer, or non-positive.
// This is defense in depth on top of SettingsPane's write-side rounding: bad
// data already in Firestore (or a future writer that skips validation) must
// not be able to throw here. Firestore's onSnapshot dispatches its success
// callback via a bare setTimeout with no try/catch, so a throw from
// parseSettingsDoc inside useSettings's snapshot handler bypasses the error
// callback and wedges `loading` at `true` forever — which in turn makes
// AppRoute's `if (settingsLoading) return null` gate render nothing,
// permanently, for that user.
export const settingsDocSchema = z.object({
	lowStockThreshold: z
		.number()
		.int()
		.positive()
		.catch(DEFAULT_LOW_STOCK_THRESHOLD),
});

export interface Settings {
	lowStockThreshold: number;
}

export function parseSettingsDoc(data: unknown): Settings {
	return settingsDocSchema.parse(data);
}
