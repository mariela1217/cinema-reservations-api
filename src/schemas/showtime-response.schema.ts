import { z } from "zod";
import { movieResponseSchema } from "./movie-response.schema";
import { seatTypeSchema, showtimeStatusSchema } from "./enums.schema";

// Información básica de una sala, sin incluir todos sus asientos.
const roomBasicResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).meta({ id: "RoomSummary", description: "Datos básicos de una sala, sin asientos." });

const showtimeFields = {
  id: z.uuid().meta({ description: "Identificador de la función." }),
  movie_id: z.uuid(),
  room_id: z.uuid(),
  starts_at: z.iso.datetime().meta({ description: "Inicio (UTC)." }),
  ends_at: z.iso.datetime().meta({
    description: "Fin de la ocupación de la sala (UTC), calculado por el servidor: inicio + duración de la película + 20 min de limpieza.",
  }),
  base_price_cents: z.number().int().positive().meta({ description: "Precio base de un asiento REGULAR, en centavos." }),
  status: showtimeStatusSchema,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
};

// Información de una función de cine.
export const showtimeResponseSchema = z.object({
  ...showtimeFields,
  movie: movieResponseSchema,
  room: roomBasicResponseSchema,
}).meta({ id: "Showtime", description: "Función con su película y su sala." });

// Para GET /showtimes, que devuelve varias funciones.
export const showtimesListResponseSchema =
  z.array(showtimeResponseSchema);

// Para PATCH /showtimes/{id}/cancel.
// Este endpoint devuelve únicamente los datos de la función,
// sin las relaciones movie y room.
export const cancelledShowtimeSchema = z.object(showtimeFields).meta({
  id: "ShowtimeRecord",
  description: "Datos de la función sin sus relaciones.",
});

export const cancelShowtimeResponseSchema = z.object({
  showtime: cancelledShowtimeSchema,
  cancelled_reservations: z.number().int().nonnegative().meta({
    description: "Reservaciones PENDING vigentes o CONFIRMED que esta operación pasó a CANCELLED.",
  }),
}).meta({ id: "CancelShowtimeResult", description: "Resultado de cancelar una función." });

// Para GET /showtimes/{id}/seats.
export const showtimeSeatsResponseSchema = z.object({
  showtime_id: z.uuid(),
  room_id: z.uuid(),
  seats: z.array(
    z.object({
      id: z.uuid().meta({ description: "Identificador del asiento." }),
      row_label: z.string(),
      seat_number: z.number().int().positive(),
      type: seatTypeSchema,
      available: z.boolean().meta({
        description:
          "true si se puede reservar ahora: la función está SCHEDULED, no ha comenzado y el asiento no tiene una reservación activa (PENDING vigente o CONFIRMED).",
      }),
    }).meta({ id: "SeatAvailability" })
  ).meta({ description: "Asientos de la sala ordenados por fila y número." }),
}).meta({ id: "ShowtimeSeats", description: "Disponibilidad de los asientos de una función." });
