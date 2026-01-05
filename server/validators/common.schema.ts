import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const searchSchema = z.object({
  search: z.string().optional(),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
