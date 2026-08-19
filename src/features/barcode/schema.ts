import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp, {
	message: "Expected a Firestore Timestamp",
});

export const barcodeProductDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	suggestedDuration: z.number().int().positive().nullable(),
	source: z.enum(["openfoodfacts", "manual"]),
	updatedAt: timestampSchema,
});

export interface BarcodeProduct {
	name: string;
	category: string;
	suggestedDuration: number | null;
	source: "openfoodfacts" | "manual";
	updatedAt: Date;
}

export function parseBarcodeProductDoc(data: unknown): BarcodeProduct {
	const parsed = barcodeProductDocSchema.parse(data);
	return {
		name: parsed.name,
		category: parsed.category,
		suggestedDuration: parsed.suggestedDuration,
		source: parsed.source,
		updatedAt: parsed.updatedAt.toDate(),
	};
}

export function toBarcodeProductDoc(
	product: Omit<BarcodeProduct, "updatedAt">,
) {
	return {
		name: product.name,
		category: product.category,
		suggestedDuration: product.suggestedDuration,
		source: product.source,
		updatedAt: Timestamp.now(),
	};
}
