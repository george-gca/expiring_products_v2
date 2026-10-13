import { z } from "zod";

export const classDocSchema = z.object({
	key: z.string().min(1),
	category: z.string().min(1),
	name: z.string().min(1),
	archived: z.boolean().optional().catch(undefined),
});

export interface ItemClass {
	id: string;
	key: string;
	category: string;
	name: string;
	archived: boolean;
}

export function parseClassDoc(id: string, data: unknown): ItemClass {
	const parsed = classDocSchema.parse(data);
	return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toClassDoc(cls: Omit<ItemClass, "id">) {
	return {
		key: cls.key,
		category: cls.category,
		name: cls.name,
		archived: cls.archived,
	};
}
