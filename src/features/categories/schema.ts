import { z } from "zod";

export const categoryDocSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export interface Category {
  id: string;
  key: string;
  name: string;
  emoji: string;
  order: number;
}

export function parseCategoryDoc(id: string, data: unknown): Category {
  const parsed = categoryDocSchema.parse(data);
  return { id, ...parsed };
}
