import { z } from "zod";

export const settingsDocSchema = z.object({
	lowStockThreshold: z.number().int().positive(),
});

export interface Settings {
	lowStockThreshold: number;
}

export function parseSettingsDoc(data: unknown): Settings {
	return settingsDocSchema.parse(data);
}
