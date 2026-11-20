// Escenarios de concurrencia de la etapa 3, coordinados con bloqueos verificables.
//
// Patrón: una transacción "compuerta" retiene una fila; la petición A queda detenida en un
// punto concreto (confirmado en pg_stat_activity); se lanza la petición B y se confirma
// dónde espera; se libera la compuerta y se comprueban respuestas HTTP, estado final,
// historial y las 8 invariantes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WAITING_ON,
  closeGateClient,
  expectInvariantsHold,
  holdLock,
  openGateClient,
  start,
  waitForBlocked,
} from "../support/concurrency";
import {
  api,
  createReservation,
  createScenario,
  expireReservationNow,
  historyOf,
  hoursFromNow,
  moveShowtimeStart,
  prisma,
  reservationBody,
  resetDatabase,
} from "../support/fixtures";

beforeAll(async () => {
  await resetDatabase();
  await openGateClient();
});

afterAll(closeGateClient);

const reserve = (showtimeId: string, seatIds: string[]) => api().post("/reservations").send(reservationBody(showtimeId, seatIds));
const cancelShowtime = (showtimeId: string) => api().patch(`/showtimes/${showtimeId}/cancel`);
const confirm = (reservationId: string) => api().patch(`/reservations/${reservationId}/confirm`);
const cancelReservation = (reservationId: string) => api().patch(`/reservations/${reservationId}/cancel`);
const statusOf = async (reservationId: string) =>
  (await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status;

describe("Asientos simultáneos (índice único parcial, P2002 → 409)", () => {
  it("S1 · 10 reservaciones simultáneas del mismo asiento: un 201 y nueve 409", async () => {
    const { showtime, seat } = await createScenario();

    const responses = await Promise.all(Array.from({ length: 10 }, () => reserve(showtime.id, [seat.A1])));
    const statuses = responses.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    for (const r of responses.filter((x) => x.status === 409)) {
      expect(r.body).toEqual({ message: "Uno o más asientos ya están reservados para esta función" });
    }
    expect(await prisma.reservationSeat.count({ where: { showtime_id: showtime.id, seat_id: seat.A1, is_active: true } })).toBe(1);
    expect(await prisma.reservation.count({ where: { showtime_id: showtime.id } })).toBe(1);
    await expectInvariantsHold([showtime.id]);
  });

  it("S2 · determinista: R2 espera en el índice único a R1 y recibe 409", async () => {
    const { showtime, seat } = await createScenario();
    // R1 inserta A1 y A2 y queda retenida en la verificación de la FK de A2.
    const held = await holdLock((tx) => tx.$queryRaw`SELECT id FROM seats WHERE id = ${seat.A2}::uuid FOR UPDATE`);
    try {
      const r1 = start(reserve(showtime.id, [seat.A1, seat.A2]));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsInsert, 1)).toBe(true);

      const r2 = start(reserve(showtime.id, [seat.A1]));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsInsert, 2)).toBe(true);

      await held.release();
      const [x1, x2] = await Promise.all([r1, r2]);

      expect(x1.status).toBe(201);
      expect(x2.status).toBe(409);
      expect(x2.body).toEqual({ message: "Uno o más asientos ya están reservados para esta función" });
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });
});

describe("Crear reservación vs. cancelar función (los dos órdenes)", () => {
  it("S3 · crear primero: la cancelación espera a la reserva y la cancela en cascada", async () => {
    const { showtime, seat } = await createScenario();
    // R ya tiene FOR SHARE sobre la función y queda retenida en la FK del asiento.
    const held = await holdLock((tx) => tx.$queryRaw`SELECT id FROM seats WHERE id = ${seat.A1}::uuid FOR UPDATE`);
    try {
      const r = start(reserve(showtime.id, [seat.A1]));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsInsert)).toBe(true);

      const c = start(cancelShowtime(showtime.id));
      expect(await waitForBlocked(WAITING_ON.showtimeUpdate)).toBe(true);

      await held.release();
      const [xr, xc] = await Promise.all([r, c]);

      expect(xr.status).toBe(201);
      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(1);
      expect(await statusOf(xr.body.id)).toBe("CANCELLED");
      expect(await historyOf(xr.body.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:SHOWTIME_CANCELLED"]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });

  it("S4 · cancelar primero: la reserva espera a la cancelación y recibe 409 sin insertar nada", async () => {
    const { showtime, seat } = await createScenario();
    const existing = await createReservation(showtime.id, [seat.B1]);
    // C ya actualizó la función y queda retenida al bloquear la reserva existente.
    const held = await holdLock((tx) => tx.$queryRaw`SELECT id FROM reservations WHERE id = ${existing.id}::uuid FOR UPDATE`);
    try {
      const c = start(cancelShowtime(showtime.id));
      expect(await waitForBlocked(WAITING_ON.reservationsRowLock)).toBe(true);

      const r = start(reserve(showtime.id, [seat.A1]));
      expect(await waitForBlocked(WAITING_ON.showtimeShareLock)).toBe(true);

      await held.release();
      const [xc, xr] = await Promise.all([c, r]);

      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(1);
      expect(xr.status).toBe(409);
      expect(xr.body).toEqual({ message: "La función ya comenzó o no está disponible" });
      expect(await prisma.reservationSeat.count({ where: { showtime_id: showtime.id, seat_id: seat.A1 } })).toBe(0);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });
});

describe("Confirmar vs. cancelar función (los dos órdenes)", () => {
  it("S5 · confirmar primero: la cancelación espera y registra CONFIRMED→CANCELLED", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    // Confirm ya tiene FOR SHARE sobre la función y queda retenida al actualizar la reserva.
    const held = await holdLock((tx) => tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservation.id}::uuid FOR UPDATE`);
    try {
      const k = start(confirm(reservation.id));
      expect(await waitForBlocked(WAITING_ON.reservationUpdate)).toBe(true);

      const c = start(cancelShowtime(showtime.id));
      expect(await waitForBlocked(WAITING_ON.showtimeUpdate)).toBe(true);

      await held.release();
      const [xk, xc] = await Promise.all([k, c]);

      expect(xk.status).toBe(200);
      expect(xk.body.status).toBe("CONFIRMED");
      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(1);
      expect(await historyOf(reservation.id)).toEqual([
        "∅→PENDING:CREATED",
        "PENDING→CONFIRMED:CONFIRMED_BY_CUSTOMER",
        "CONFIRMED→CANCELLED:SHOWTIME_CANCELLED",
      ]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });

  it("S6 · cancelar primero: la confirmación espera y recibe 409", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    const held = await holdLock((tx) => tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservation.id}::uuid FOR UPDATE`);
    try {
      const c = start(cancelShowtime(showtime.id));
      expect(await waitForBlocked(WAITING_ON.reservationsRowLock)).toBe(true);

      const k = start(confirm(reservation.id));
      expect(await waitForBlocked(WAITING_ON.showtimeShareLock)).toBe(true);

      await held.release();
      const [xc, xk] = await Promise.all([c, k]);

      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(1);
      expect(xk.status).toBe(409);
      expect(xk.body).toEqual({ message: "La función ya comenzó o fue cancelada" });
      expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:SHOWTIME_CANCELLED"]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });
});

describe("Consistencia del historial ante transiciones simultáneas", () => {
  it("S7 · el cliente cancela mientras se cancela la función: una sola transición", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    // La cancelación del cliente ya cambió el estado y queda retenida al liberar asientos.
    const held = await holdLock(
      (tx) => tx.$queryRaw`SELECT id FROM reservation_seats WHERE reservation_id = ${reservation.id}::uuid FOR UPDATE`
    );
    try {
      const u = start(cancelReservation(reservation.id));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsUpdate)).toBe(true);

      const c = start(cancelShowtime(showtime.id));
      expect(await waitForBlocked(WAITING_ON.reservationsRowLock)).toBe(true);

      await held.release();
      const [xu, xc] = await Promise.all([u, c]);

      expect(xu.status).toBe(200);
      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(0);
      expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:CANCELLED_BY_CUSTOMER"]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });

  it("S8 · la expiración ocurre durante la cancelación de la función: queda EXPIRED", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(reservation.id);
    // La expiración (disparada por GET) ya cambió el estado y queda retenida al liberar asientos.
    const held = await holdLock(
      (tx) => tx.$queryRaw`SELECT id FROM reservation_seats WHERE reservation_id = ${reservation.id}::uuid FOR UPDATE`
    );
    try {
      const e = start(api().get(`/reservations/${reservation.id}`));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsUpdate)).toBe(true);

      // La cancelación no debería necesitar esperar (la PENDING vencida queda fuera de su filtro).
      // Se continúa en cuanto termine o quede bloqueada; ambas son condiciones observables.
      const c = start(cancelShowtime(showtime.id));
      await Promise.race([c, waitForBlocked(WAITING_ON.reservationsRowLock)]);

      await held.release();
      const [xe, xc] = await Promise.all([e, c]);

      expect(xe.status).toBe(200);
      expect(xe.body.status).toBe("EXPIRED");
      expect(xc.status).toBe(200);
      expect(xc.body.cancelled_reservations).toBe(0);
      expect(await statusOf(reservation.id)).toBe("EXPIRED");
      expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→EXPIRED:PAYMENT_TIMEOUT"]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });

  it("S9 · confirmar mientras la expiración retiene la reserva: 409", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(reservation.id);
    const held = await holdLock(
      (tx) => tx.$queryRaw`SELECT id FROM reservation_seats WHERE reservation_id = ${reservation.id}::uuid FOR UPDATE`
    );
    try {
      const e = start(api().get(`/reservations/${reservation.id}`));
      expect(await waitForBlocked(WAITING_ON.reservationSeatsUpdate)).toBe(true);

      // La confirmación ejecuta primero la expiración y queda esperando la misma fila.
      const k = start(confirm(reservation.id));
      expect(await waitForBlocked(WAITING_ON.reservationUpdate)).toBe(true);

      await held.release();
      const [, xk] = await Promise.all([e, k]);

      expect(xk.status).toBe(409);
      expect(xk.body).toEqual({ message: "La reservación no está pendiente o ya expiró" });
      expect(await historyOf(reservation.id)).toEqual(["∅→PENDING:CREATED", "PENDING→EXPIRED:PAYMENT_TIMEOUT"]);
    } finally {
      await held.release();
    }
    await expectInvariantsHold([showtime.id]);
  });
});

describe("Límites temporales y liberación de asientos", () => {
  it("S10 · expiración: vigente se confirma; vencida por 10 ms → 409 y EXPIRED", async () => {
    const { showtime, seat } = await createScenario();
    const valid = await createReservation(showtime.id, [seat.A1]);
    const stale = await createReservation(showtime.id, [seat.A2]);
    await prisma.reservation.update({ where: { id: valid.id }, data: { expires_at: new Date(Date.now() + 60_000) } });
    await prisma.reservation.update({ where: { id: stale.id }, data: { expires_at: new Date(Date.now() - 10) } });

    expect((await confirm(valid.id)).status).toBe(200);
    expect((await confirm(stale.id)).status).toBe(409);
    expect(await statusOf(stale.id)).toBe("EXPIRED");
    await expectInvariantsHold([showtime.id]);
  });

  it("S11 · regla de 2 h: a 2 h + 2 min se cancela; a 2 h − 2 min → 409", async () => {
    const onTime = await createScenario({ startsAt: hoursFromNow(2 + 2 / 60) });
    const late = await createScenario({ startsAt: hoursFromNow(2 - 2 / 60) });
    const a = await createReservation(onTime.showtime.id, [onTime.seat.A1]);
    const b = await createReservation(late.showtime.id, [late.seat.A1]);
    expect((await confirm(a.id)).status).toBe(200);
    expect((await confirm(b.id)).status).toBe(200);

    expect((await cancelReservation(a.id)).status).toBe(200);
    expect((await cancelReservation(b.id)).status).toBe(409);
    expect(await statusOf(b.id)).toBe("CONFIRMED");
    await expectInvariantsHold([onTime.showtime.id, late.showtime.id]);
  });

  it("S12 · después de iniciada la función: confirmar → 409 (sigue PENDING) y reservar → 409", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    await moveShowtimeStart(showtime.id, hoursFromNow(-0.01)); // la función comenzó hace ~36 s

    const k = await confirm(reservation.id);
    expect(k.status).toBe(409);
    expect(k.body).toEqual({ message: "La función ya comenzó o fue cancelada" });
    expect(await statusOf(reservation.id)).toBe("PENDING");
    expect((await reserve(showtime.id, [seat.A2])).status).toBe(409);
    await expectInvariantsHold([showtime.id]);
  });

  it("S14 · reservar en una función cancelada → 409", async () => {
    const { showtime, seat } = await createScenario();
    expect((await cancelShowtime(showtime.id)).status).toBe(200);
    expect((await reserve(showtime.id, [seat.A1])).status).toBe(409);
    await expectInvariantsHold([showtime.id]);
  });

  it("S15 · tras cancelar, el asiento aparece disponible y se puede reservar de nuevo", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    expect((await cancelReservation(reservation.id)).status).toBe(200);

    const seats = await api().get(`/showtimes/${showtime.id}/seats`);
    expect(seats.body.seats.find((s: { id: string }) => s.id === seat.A1).available).toBe(true);
    expect((await reserve(showtime.id, [seat.A1])).status).toBe(201);
    await expectInvariantsHold([showtime.id]);
  });

  it("S16 · función solapada en la misma sala → 409; justo en ends_at → 201", async () => {
    const { movie, room, showtime } = await createScenario();
    const startsAt = new Date(showtime.starts_at).getTime();

    const overlap = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: new Date(startsAt + 30 * 60_000).toISOString(), base_price_cents: 9_000 });
    const edge = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: showtime.ends_at, base_price_cents: 9_000 });

    expect(overlap.status).toBe(409);
    expect(edge.status).toBe(201);
    await expectInvariantsHold([showtime.id, edge.body.id]);
  });
});
