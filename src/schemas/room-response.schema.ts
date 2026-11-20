import { z } from "zod";

export const seatResponseSchema = z.object({
  id: z.uuid(),
  room_id: z.uuid(),
  row_label: z.string(),
  seat_number: z.number().int().positive(),
  type: z.enum(["REGULAR", "VIP"]),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const roomResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  seats: z.array(seatResponseSchema),
});