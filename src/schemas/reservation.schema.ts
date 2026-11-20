import { z } from "zod";

export const createReservationSchema = z.object({
  showtime_id: z.uuid(),

  customer_name: z.string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(150, "El nombre no puede superar 150 caracteres"),

  customer_email: z.email(),

  seat_ids: z.array(z.uuid())
    .min(1, "Debes seleccionar al menos un asiento")
    .max(6, "No puedes reservar más de seis asientos")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "No puedes seleccionar el mismo asiento dos veces"
    ),
}).strict();