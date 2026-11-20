import { z } from "zod";

export const reservationSeatResponseSchema = z.object({
  id: z.uuid(),
  reservation_id: z.uuid(),
  seat_id: z.uuid(),
  showtime_id: z.uuid(),
  price_cents: z.number().int(),
  is_active: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const reservationStatusHistoryResponseSchema = z.object({
  id: z.uuid(),
  reservation_id: z.uuid(),
  from_status: z.enum([
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "EXPIRED",
  ]).nullable(),
  to_status: z.enum([
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "EXPIRED",
  ]),
  reason: z.enum([
    "CREATED",
    "CONFIRMED_BY_CUSTOMER",
    "CANCELLED_BY_CUSTOMER",
    "SHOWTIME_CANCELLED",
    "PAYMENT_TIMEOUT",
  ]),
  changed_at: z.iso.datetime(),
});

export const reservationResponseSchema = z.object({
  id: z.uuid(),
  showtime_id: z.uuid(),
  customer_name: z.string(),
  customer_email: z.email(),
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "EXPIRED",
  ]),
  total_cents: z.number().int().nonnegative(),
  expires_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  reservation_seats: z.array(reservationSeatResponseSchema),
  status_history: z.array(reservationStatusHistoryResponseSchema),
});

export const reservationDetailResponseSchema =
  reservationResponseSchema.extend({
    showtime: z.object({
      id: z.uuid(),
      movie_id: z.uuid(),
      room_id: z.uuid(),
      starts_at: z.iso.datetime(),
      ends_at: z.iso.datetime(),
      base_price_cents: z.number().int(),
      status: z.enum(["SCHEDULED", "CANCELLED"]),
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
    }),

    reservation_seats: z.array(
      reservationSeatResponseSchema.extend({
        seat: z.object({
          id: z.uuid(),
          room_id: z.uuid(),
          row_label: z.string(),
          seat_number: z.number().int(),
          type: z.enum(["REGULAR", "VIP"]),
          created_at: z.iso.datetime(),
          updated_at: z.iso.datetime(),
        }),
      })
    ),
  });