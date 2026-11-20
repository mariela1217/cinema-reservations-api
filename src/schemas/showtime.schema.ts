import { z } from "zod";

export const createShowtimeSchema = z.object({
  movie_id: z.uuid(),

  room_id: z.uuid(),

  starts_at: z.iso.datetime({ offset: true }),

  base_price_cents: z.number()
    .int("El precio debe ser un número entero")
    .positive("El precio debe ser mayor que cero"),
}).strict();