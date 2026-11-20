// Ayudantes de las pruebas de integración. Crean datos por la API (como un cliente real)
// y usan Prisma solo para leer el estado o para mover fechas en cinema_test, en lugar de esperar.
import request from "supertest";
import { expect } from "vitest";
import type { ZodType } from "zod";
import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetTestDatabase } from "./test-database";

export { prisma };

export const api = () => request(app);

// Vacía cinema_test (con las barreras 3 y 4).
export function resetDatabase(): Promise<void> {
  return resetTestDatabase(prisma);
}

let sequence = 0;
export function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix} ${process.pid}-${Date.now()}-${sequence}`;
}

const HOUR = 3_600_000;
export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR);

// Comprueba que el cuerpo cumple el esquema de respuesta documentado en Swagger.
export function expectSchema(schema: ZodType, body: unknown): void {
  const result = schema.safeParse(body);
  expect(result.success, result.success ? "" : JSON.stringify(result.error.issues, null, 2)).toBe(true);
}

type RowInput = { label: string; seats: number; type: "REGULAR" | "VIP" };

export async function createMovie(overrides: Record<string, unknown> = {}) {
  const res = await api()
    .post("/movies")
    .send({ title: uniqueName("Película"), duration_minutes: 100, ...overrides });
  expect(res.status).toBe(201);
  return res.body as { id: string; title: string; duration_minutes: number; is_active: boolean };
}

export async function createRoom(
  rows: RowInput[] = [
    { label: "A", seats: 4, type: "REGULAR" },
    { label: "B", seats: 2, type: "VIP" },
  ]
) {
  const res = await api().post("/rooms").send({ name: uniqueName("Sala"), rows });
  expect(res.status).toBe(201);
  const seat: Record<string, string> = {};
  for (const s of res.body.seats) seat[`${s.row_label}${s.seat_number}`] = s.id;
  return { ...(res.body as { id: string; name: string; seats: { id: string; type: string }[] }), seat };
}

export async function createShowtime(options: {
  movieId: string;
  roomId: string;
  startsAt?: Date;
  basePriceCents?: number;
}) {
  const res = await api()
    .post("/showtimes")
    .send({
      movie_id: options.movieId,
      room_id: options.roomId,
      starts_at: (options.startsAt ?? hoursFromNow(24 * 30)).toISOString(),
      base_price_cents: options.basePriceCents ?? 10_000,
    });
  expect(res.status).toBe(201);
  return res.body as { id: string; starts_at: string; ends_at: string; status: string };
}

// Película + sala propia (A1–A4 REGULAR, B1–B2 VIP) + función. Cada escenario usa su propia sala.
export async function createScenario(options: { startsAt?: Date; basePriceCents?: number; durationMinutes?: number } = {}) {
  const movie = await createMovie({ duration_minutes: options.durationMinutes ?? 100 });
  const room = await createRoom();
  const showtime = await createShowtime({
    movieId: movie.id,
    roomId: room.id,
    startsAt: options.startsAt,
    basePriceCents: options.basePriceCents,
  });
  return { movie, room, showtime, seat: room.seat };
}

export function reservationBody(showtimeId: string, seatIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    showtime_id: showtimeId,
    customer_name: "Ana Pérez",
    customer_email: "ana@example.com",
    seat_ids: seatIds,
    ...overrides,
  };
}

export async function createReservation(showtimeId: string, seatIds: string[]) {
  const res = await api().post("/reservations").send(reservationBody(showtimeId, seatIds));
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string; total_cents: number };
}

export async function confirmReservation(id: string) {
  const res = await api().patch(`/reservations/${id}/confirm`);
  expect(res.status).toBe(200);
  return res.body;
}

// Simula el paso del tiempo moviendo fechas en cinema_test.
export async function moveShowtimeStart(showtimeId: string, startsAt: Date): Promise<void> {
  await prisma.showtime.update({ where: { id: showtimeId }, data: { starts_at: startsAt } });
}

export async function expireReservationNow(reservationId: string): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { expires_at: new Date(Date.now() - 1_000) },
  });
}

export async function historyOf(reservationId: string): Promise<string[]> {
  const rows = await prisma.reservationStatusHistory.findMany({
    where: { reservation_id: reservationId },
    orderBy: [{ changed_at: "asc" }, { id: "asc" }],
  });
  return rows.map((h) => `${h.from_status ?? "∅"}→${h.to_status}:${h.reason}`);
}

export async function activeSeatIds(reservationId: string): Promise<string[]> {
  const rows = await prisma.reservationSeat.findMany({
    where: { reservation_id: reservationId, is_active: true },
    select: { seat_id: true },
  });
  return rows.map((r) => r.seat_id);
}

export const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";
