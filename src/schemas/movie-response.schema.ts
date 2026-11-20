import { z } from "zod";

export const movieResponseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  duration_minutes: z.number().int().positive(),
  is_active: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const moviesListResponseSchema =
  z.array(movieResponseSchema);