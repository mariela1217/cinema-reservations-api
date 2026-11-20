import { z } from "zod";
import { reservationStatusSchema, seatTypeSchema, showtimeStatusSchema, statusReasonSchema } from "./enums.schema";

export const reservationSeatResponseSchema = z.object({
  id: z.uuid(),
  reservation_id: z.uuid(),
  seat_id: z.uuid().meta({ description: "Asiento reservado." }),
  showtime_id: z.uuid(),
  price_cents: z.number().int().meta({
    description: "Precio cobrado por este asiento, en centavos, calculado por el servidor al crear la reservación (VIP = base × 1,3).",
  }),
  is_active: z.boolean().meta({
    description: "true mientras la reservación ocupa el asiento. Pasa a false al cancelar o expirar, lo que libera el asiento.",
  }),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).meta({ id: "ReservationSeat", description: "Asiento incluido en una reservación." });

export const reservationStatusHistoryResponseSchema = z.object({
  id: z.uuid(),
  reservation_id: z.uuid(),
  from_status: reservationStatusSchema.nullable().meta({ description: "Estado anterior; null en el primer registro." }),
  to_status: reservationStatusSchema,
  reason: statusReasonSchema,
  changed_at: z.iso.datetime().meta({ description: "Momento del cambio (UTC)." }),
}).meta({ id: "StatusHistoryEntry", description: "Cambio de estado registrado en la misma transacción que lo produjo." });

export const reservationResponseSchema = z.object({
  id: z.uuid(),
  showtime_id: z.uuid(),
  customer_name: z.string(),
  customer_email: z.email(),
  status: reservationStatusSchema,
  total_cents: z.number().int().nonnegative().meta({ description: "Suma de price_cents de los asientos, en centavos." }),
  expires_at: z.iso.datetime().nullable().meta({
    description: "Vencimiento de una reservación PENDING (creación + 10 min). null en cualquier otro estado.",
  }),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  reservation_seats: z.array(reservationSeatResponseSchema),
  status_history: z.array(reservationStatusHistoryResponseSchema).meta({ description: "Historial completo de estados." }),
}).meta({ id: "Reservation", description: "Reservación con sus asientos y su historial de estados." });

export const reservationDetailResponseSchema =
  reservationResponseSchema.extend({
    showtime: z.object({
      id: z.uuid(),
      movie_id: z.uuid(),
      room_id: z.uuid(),
      starts_at: z.iso.datetime(),
      ends_at: z.iso.datetime(),
      base_price_cents: z.number().int(),
      status: showtimeStatusSchema,
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),

      movie: z.object({
        id: z.uuid(),
        title: z.string(),
        duration_minutes: z.number().int(),
        is_active: z.boolean(),
        created_at: z.iso.datetime(),
        updated_at: z.iso.datetime(),
      }),

      room: z.object({
        id: z.uuid(),
        name: z.string(),
        created_at: z.iso.datetime(),
        updated_at: z.iso.datetime(),
      }),
    }).meta({ description: "Función de la reservación, con su película y su sala." }),

    reservation_seats: z.array(
      reservationSeatResponseSchema.extend({
        seat: z.object({
          id: z.uuid(),
          room_id: z.uuid(),
          row_label: z.string(),
          seat_number: z.number().int(),
          type: seatTypeSchema,
          created_at: z.iso.datetime(),
          updated_at: z.iso.datetime(),
        }).meta({ description: "Datos del asiento físico." }),
      })
    ),
  }).meta({
    id: "ReservationDetail",
    description: "Reservación con su función, película, sala, asientos e historial ordenado por fecha.",
  });
