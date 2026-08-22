import { z } from "zod";

export const categoryDocSchema = z.object({
	key: z.string().min(1),
	name: z.string().min(1),
	emoji: z.string().min(1),
	order: z.number().int().nonnegative(),
	archived: z.boolean().optional().catch(undefined),
});

export interface Category {
	id: string;
	key: string;
	name: string;
	emoji: string;
	order: number;
	archived: boolean;
}

export function parseCategoryDoc(id: string, data: unknown): Category {
	const parsed = categoryDocSchema.parse(data);
	return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toCategoryDoc(category: Omit<Category, "id">) {
	return {
		key: category.key,
		name: category.name,
		emoji: category.emoji,
		order: category.order,
		archived: category.archived,
	};
}
