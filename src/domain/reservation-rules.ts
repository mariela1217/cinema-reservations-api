// Reglas de tiempo de las reservaciones.

export const RESERVATION_TTL_MINUTES = 10;
export const CANCELLATION_DEADLINE_HOURS = 2;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

// Una reservación PENDING vence 10 minutos después de crearse.
export function calculateExpiration(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_TTL_MINUTES * MS_PER_MINUTE);
}

// Una reservación confirmada puede cancelarse hasta 2 horas antes del inicio (inclusive).
export function isWithinCancellationWindow(startsAt: Date, now: Date = new Date()): boolean {
  return now.getTime() <= startsAt.getTime() - CANCELLATION_DEADLINE_HOURS * MS_PER_HOUR;
}
