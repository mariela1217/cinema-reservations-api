import { beforeAll, describe, expect, it } from "vitest";
import { errorResponseSchema, validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import { reservationDetailResponseSchema, reservationResponseSchema } from "../../src/schemas/reservation-response.schema";
import {
  UNKNOWN_UUID,
  activeSeatIds,
  api,
  confirmReservation,
  createReservation,
  createScenario,
  expectSchema,
  expireReservationNow,
  historyOf,
  hoursFromNow,
  moveShowtimeStart,
  prisma,
  reservationBody,
  resetDatabase,
} from "../support/fixtures";

beforeAll(resetDatabase);

describe("POST /reservations", () => {
  it("crea una reservación PENDING con precios calculados en el servidor", async () => {
    const { showtime, seat } = await createScenario({ basePriceCents: 999 });
    const before = Date.now();
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1, seat.A2, seat.B1]));
    const after = Date.now();

    expect(res.status).toBe(201);
    expectSchema(reservationResponseSchema, res.body);
    expect(res.body).toMatchObject({ showtime_id: showtime.id, status: "PENDING", customer_email: "ana@example.com" });

    // REGULAR = base; VIP = base × 1,3 redondeado (999 → 1298,7 → 1299).
    const priceBySeat = Object.fromEntries(
      res.body.reservation_seats.map((s: { seat_id: string; price_cents: number }) => [s.seat_id, s.price_cents])
    );
    expect(priceBySeat).toEqual({ [seat.A1]: 999, [seat.A2]: 999, [seat.B1]: 1_299 });
    expect(res.body.total_cents).toBe(999 + 999 + 1_299);
    expect(res.body.reservation_seats.every((s: { is_active: boolean }) => s.is_active)).toBe(true);

    // Vence 10 minutos después de crearse.
    const expiresAt = new Date(res.body.expires_at).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(after + 10 * 60_000);

    expect(await historyOf(res.body.id)).toEqual(["∅→PENDING:CREATED"]);
  });

  it("aplica el redondeo de empate hacia arriba en VIP", async () => {
    const { showtime, seat } = await createScenario({ basePriceCents: 1_005 });
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.B1, seat.B2]));
    expect(res.status).toBe(201);
    expect(res.body.total_cents).toBe(1_307 * 2); // 1005 × 1,3 = 1306,5 → 1307
  });

  it("acepta exactamente 6 asientos", async () => {
    const { showtime, seat } = await createScenario();
    const res = await api().post("/reservations").send(reservationBody(showtime.id, Object.values(seat)));
    expect(res.status).toBe(201);
    expect(res.body.reservation_seats).toHaveLength(6);
  });

  it.each([
    ["sin asientos", { seat_ids: [] }],
    ["7 asientos", { seat_ids: Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`) }],
    ["asiento repetido", "DUPLICATE"],
    ["ID de asiento inválido", { seat_ids: ["abc"] }],
    ["correo inválido", { customer_email: "no-es-correo" }],
    ["nombre vacío", { customer_name: "   " }],
    ["total enviado por el cliente", { total_cents: 1 }],
    ["estado enviado por el cliente", { status: "CONFIRMED" }],
    ["showtime_id inválido", { showtime_id: "abc" }],
  ])("rechaza %s con 400", async (_case, override) => {
    const { showtime, seat } = await createScenario();
    const body =
      override === "DUPLICATE"
        ? reservationBody(showtime.id, [seat.A1, seat.A1])
        : reservationBody(showtime.id, [seat.A1], override as Record<string, unknown>);

    const res = await api().post("/reservations").send(body);
    expect(res.status).toBe(400);
    expectSchema(validationErrorResponseSchema, res.body);
    expect(await prisma.reservation.count({ where: { showtime_id: showtime.id } })).toBe(0);
  });

  it("asientos de otra sala → 400", async () => {
    const { showtime } = await createScenario();
    const other = await createScenario();
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [other.seat.A1]));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Uno o más asientos no pertenecen a la sala de esta función" });
  });

  it("función inexistente → 404", async () => {
    const { seat } = await createScenario();
    const res = await api().post("/reservations").send(reservationBody(UNKNOWN_UUID, [seat.A1]));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Función no encontrada" });
  });

  it("función cancelada → 409", async () => {
    const { showtime, seat } = await createScenario();
    await api().patch(`/showtimes/${showtime.id}/cancel`);
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La función ya comenzó o no está disponible" });
  });

  it("función ya iniciada → 409", async () => {
    const { showtime, seat } = await createScenario();
    await moveShowtimeStart(showtime.id, hoursFromNow(-0.25));
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    expect(res.status).toBe(409);
  });

  it("asiento ocupado → 409 sin reservar parcialmente los demás", async () => {
    const { showtime, seat } = await createScenario();
    await createReservation(showtime.id, [seat.A2]);

    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1, seat.A2]));
    expect(res.status).toBe(409);
    expectSchema(errorResponseSchema, res.body);
    expect(res.body).toEqual({ message: "Uno o más asientos ya están reservados para esta función" });

    // A1 no quedó tomado por la reservación rechazada.
    expect(await prisma.reservation.count({ where: { showtime_id: showtime.id } })).toBe(1);
    const retry = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    expect(retry.status).toBe(201);
  });

  it("el mismo asiento puede reservarse en otra función de la misma sala", async () => {
    const { movie, room, showtime, seat } = await createScenario({ durationMinutes: 60 });
    await createReservation(showtime.id, [seat.A1]);
    const next = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: showtime.ends_at, base_price_cents: 5_000 });
    const res = await api().post("/reservations").send(reservationBody(next.body.id, [seat.A1]));
    expect(res.status).toBe(201);
  });
});

describe("GET /reservations/:id", () => {
  it("devuelve la reservación con función, película, sala, asientos e historial ordenado", async () => {
    const { showtime, seat, movie, room } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1, seat.B1]);
    await confirmReservation(reservation.id);

    const res = await api().get(`/reservations/${reservation.id}`);

    expect(res.status).toBe(200);
    expectSchema(reservationDetailResponseSchema, res.body);
    expect(res.body.showtime.movie.id).toBe(movie.id);
    expect(res.body.showtime.room.id).toBe(room.id);
    expect(res.body.reservation_seats.map((s: { seat: { id: string } }) => s.seat.id).sort()).toEqual([seat.A1, seat.B1].sort());
    expect(res.body.status_history.map((h: { to_status: string }) => h.to_status)).toEqual(["PENDING", "CONFIRMED"]);
  });

  it("ID inválido → 400 y reservación inexistente → 404", async () => {
    const invalid = await api().get("/reservations/abc");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: "El ID debe ser un UUID válido" });

    const missing = await api().get(`/reservations/${UNKNOWN_UUID}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Reservación no encontrada" });
  });

  it("al consultar una PENDING vencida, la marca como EXPIRED", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(reservation.id);

    const res = await api().get(`/reservations/${reservation.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("EXPIRED");
    expect(res.body.expires_at).toBeNull();
  });
});

describe("PATCH /reservations/:id/confirm", () => {
  it("confirma una PENDING vigente: CONFIRMED, sin vencimiento y con historial", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);

    const res = await api().patch(`/reservations/${reservation.id}/confirm`);

    expect(res.status).toBe(200);
    expectSchema(reservationResponseSchema, res.body);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.expires_at).toBeNull();
    expect(await activeSeatIds(reservation.id)).toEqual([seat.A1]);
    expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CONFIRMED:CONFIRMED_BY_CUSTOMER"]);
  });

  it("confirmar dos veces → 409", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await confirmReservation(reservation.id);
    const res = await api().patch(`/reservations/${reservation.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La reservación no está pendiente o ya expiró" });
  });

  it("confirmar una vencida → 409, queda EXPIRED y libera sus asientos", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(reservation.id);

    const res = await api().patch(`/reservations/${reservation.id}/confirm`);
    expect(res.status).toBe(409);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("EXPIRED");
    expect(await activeSeatIds(reservation.id)).toEqual([]);
    expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→EXPIRED:PAYMENT_TIMEOUT"]);
  });

  it("función ya iniciada → 409 y la reservación sigue PENDING", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await moveShowtimeStart(showtime.id, hoursFromNow(-0.1));

    const res = await api().patch(`/reservations/${reservation.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La función ya comenzó o fue cancelada" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("PENDING");
  });

  it("función cancelada → 409", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await api().patch(`/showtimes/${showtime.id}/cancel`);

    const res = await api().patch(`/reservations/${reservation.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La función ya comenzó o fue cancelada" });
  });

  it("ID inválido → 400 y reservación inexistente → 404", async () => {
    expect((await api().patch("/reservations/abc/confirm")).status).toBe(400);
    const missing = await api().patch(`/reservations/${UNKNOWN_UUID}/confirm`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Reservación no encontrada" });
  });
});

describe("PATCH /reservations/:id/cancel", () => {
  it("cancela una PENDING, libera sus asientos y registra el motivo", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);

    const res = await api().patch(`/reservations/${reservation.id}/cancel`);

    expect(res.status).toBe(200);
    expectSchema(reservationResponseSchema, res.body);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.expires_at).toBeNull();
    expect(await activeSeatIds(reservation.id)).toEqual([]);
    expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:CANCELLED_BY_CUSTOMER"]);

    // El asiento liberado se puede volver a reservar.
    const again = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    expect(again.status).toBe(201);
  });

  it("cancela una CONFIRMED con más de 2 horas de anticipación", async () => {
    const { showtime, seat } = await createScenario({ startsAt: hoursFromNow(3) });
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await confirmReservation(reservation.id);

    const res = await api().patch(`/reservations/${reservation.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(await historyOf(reservation.id)).toEqual([
      "∅→PENDING:CREATED",
      "PENDING→CONFIRMED:CONFIRMED_BY_CUSTOMER",
      "CONFIRMED→CANCELLED:CANCELLED_BY_CUSTOMER",
    ]);
  });

  it("rechaza cancelar una CONFIRMED a menos de 2 horas → 409 y sigue CONFIRMED", async () => {
    const { showtime, seat } = await createScenario({ startsAt: hoursFromNow(3) });
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await confirmReservation(reservation.id);
    await moveShowtimeStart(showtime.id, hoursFromNow(1.9));

    const res = await api().patch(`/reservations/${reservation.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La reservación cambió de estado, expiró o está fuera del plazo de cancelación" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("CONFIRMED");
    expect(await activeSeatIds(reservation.id)).toEqual([seat.A1]);
  });

  it.each(["CANCELLED", "EXPIRED"] as const)("una reservación %s ya no puede cancelarse → 409", async (finalState) => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    if (finalState === "CANCELLED") {
      await api().patch(`/reservations/${reservation.id}/cancel`);
    } else {
      await expireReservationNow(reservation.id);
    }

    const res = await api().patch(`/reservations/${reservation.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Esta reservación ya no puede cancelarse" });
  });

  it("ID inválido → 400 y reservación inexistente → 404", async () => {
    expect((await api().patch("/reservations/abc/cancel")).status).toBe(400);
    const missing = await api().patch(`/reservations/${UNKNOWN_UUID}/cancel`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Reservación no encontrada" });
  });
});
