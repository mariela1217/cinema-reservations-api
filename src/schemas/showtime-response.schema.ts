import { z } from "zod";
import { movieResponseSchema } from "./movie-response.schema";

// Información básica de una sala, sin incluir todos sus asientos.
const roomBasicResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

// Información de una función de cine.
export const showtimeResponseSchema = z.object({
  id: z.uuid(),
  movie_id: z.uuid(),
  room_id: z.uuid(),
  starts_at: z.iso.datetime(),
  ends_at: z.iso.datetime(),
  base_price_cents: z.number().int().positive(),
  status: z.enum(["SCHEDULED", "CANCELLED"]),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),

  movie: movieResponseSchema,
  room: roomBasicResponseSchema,
});

// Para GET /showtimes, que devuelve varias funciones.
export const showtimesListResponseSchema =
  z.array(showtimeResponseSchema);

// Para PATCH /showtimes/{id}/cancel.
// Este endpoint devuelve únicamente los datos de la función,
// sin las relaciones movie y room.
export const cancelledShowtimeSchema =
  showtimeResponseSchema.omit({
    movie: true,
    room: true,
  });

export const cancelShowtimeResponseSchema = z.object({
  showtime: cancelledShowtimeSchema,
  cancelled_reservations: z.number().int().nonnegative(),
});

// Para GET /showtimes/{id}/seats.
export const showtimeSeatsResponseSchema = z.object({
  showtime_id: z.uuid(),
  room_id: z.uuid(),
  seats: z.array(
    z.object({
      id: z.uuid(),
      row_label: z.string(),
      seat_number: z.number().int().positive(),
      type: z.enum(["REGULAR", "VIP"]),
      available: z.boolean(),
    })
  ),
});