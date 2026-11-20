// Reglas de horario de las funciones.

export const CLEANING_MINUTES = 20;

const MS_PER_MINUTE = 60_000;

// La sala queda ocupada durante la película más 20 minutos de limpieza.
export function calculateShowtimeEnd(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + (durationMinutes + CLEANING_MINUTES) * MS_PER_MINUTE);
}

type ShowtimeState = {
  status: "SCHEDULED" | "CANCELLED";
  starts_at: Date;
};

// Una función acepta reservaciones y confirmaciones solo si está programada y no ha comenzado.
export function isShowtimeOpen(showtime: ShowtimeState, now: Date = new Date()): boolean {
  return showtime.status === "SCHEDULED" && showtime.starts_at > now;
}
