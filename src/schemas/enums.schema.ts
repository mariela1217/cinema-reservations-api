import { z } from "zod";

// Enumeraciones compartidas por los esquemas de respuesta (documentación OpenAPI).

export const seatTypeSchema = z.enum(["REGULAR", "VIP"]).meta({
  id: "SeatType",
  description: "REGULAR cobra el precio base; VIP cobra base × 1,3 redondeado al centavo.",
});

export const showtimeStatusSchema = z.enum(["SCHEDULED", "CANCELLED"]).meta({
  id: "ShowtimeStatus",
  description: "SCHEDULED: programada. CANCELLED: cancelada (libera su horario en la sala).",
});

export const reservationStatusSchema = z.enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"]).meta({
  id: "ReservationStatus",
  description:
    "PENDING: creada, retiene los asientos hasta expires_at (10 min). " +
    "CONFIRMED: confirmada dentro del plazo. CANCELLED: cancelada por el cliente o por cancelación de la función. " +
    "EXPIRED: venció sin confirmarse. Transiciones válidas: PENDING→CONFIRMED, PENDING→CANCELLED, " +
    "PENDING→EXPIRED y CONFIRMED→CANCELLED. CANCELLED y EXPIRED son estados finales.",
});

export const statusReasonSchema = z.enum([
  "CREATED",
  "CONFIRMED_BY_CUSTOMER",
  "CANCELLED_BY_CUSTOMER",
  "SHOWTIME_CANCELLED",
  "PAYMENT_TIMEOUT",
]).meta({
  id: "StatusChangeReason",
  description:
    "CREATED: alta de la reservación. CONFIRMED_BY_CUSTOMER / CANCELLED_BY_CUSTOMER: acción del cliente. " +
    "SHOWTIME_CANCELLED: el cine canceló la función. PAYMENT_TIMEOUT: venció sin confirmarse.",
});
