import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expirePendingReservations } from "../../src/services/reservation-expiration.service";
import {
  activeSeatIds,
  api,
  confirmReservation,
  createReservation,
  createScenario,
  expireReservationNow,
  historyOf,
  prisma,
  reservationBody,
  resetDatabase,
} from "../support/fixtures";

// El servicio procesa todas las reservaciones vencidas de la base,
// así que cada prueba empieza con cinema_test vacía para que los conteos sean exactos.
beforeEach(resetDatabase);

afterEach(() => {
  vi.useRealTimers();
});

describe("expirePendingReservations", () => {
  it("expira solo las PENDING vencidas, libera sus asientos y registra PAYMENT_TIMEOUT", async () => {
    const { showtime, seat } = await createScenario();
    const stale = await createReservation(showtime.id, [seat.A1, seat.B1]);
    const fresh = await createReservation(showtime.id, [seat.A2]);
    const confirmed = await createReservation(showtime.id, [seat.A3]);
    await confirmReservation(confirmed.id);
    await expireReservationNow(stale.id);

    expect(await expirePendingReservations()).toBe(1);

    const staleRow = await prisma.reservation.findUniqueOrThrow({ where: { id: stale.id } });
    expect(staleRow.status).toBe("EXPIRED");
    expect(staleRow.expires_at).toBeNull();
    expect(await activeSeatIds(stale.id)).toEqual([]);
    expect(await historyOf(stale.id)).toEqual(["∅→PENDING:CREATED", "PENDING→EXPIRED:PAYMENT_TIMEOUT"]);

    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING");
    expect(await activeSeatIds(fresh.id)).toEqual([seat.A2]);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: confirmed.id } })).status).toBe("CONFIRMED");
  });

  it("es idempotente: una segunda ejecución no hace nada", async () => {
    const { showtime, seat } = await createScenario();
    const stale = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(stale.id);

    expect(await expirePendingReservations()).toBe(1);
    expect(await expirePendingReservations()).toBe(0);
    expect(await historyOf(stale.id)).toHaveLength(2);
  });

  it("límite exacto: 1 ms antes no expira; en expires_at sí", async () => {
    const { showtime, seat } = await createScenario();
    const reservation = await createReservation(showtime.id, [seat.A1]);
    const { expires_at } = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    const expiresAt = expires_at!.getTime();

    // Solo se congela Date: los temporizadores reales siguen funcionando para Prisma.
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(expiresAt - 1);
    expect(await expirePendingReservations()).toBe(0);

    vi.setSystemTime(expiresAt);
    expect(await expirePendingReservations()).toBe(1);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("EXPIRED");
  });

  it("los asientos liberados se pueden reservar de nuevo", async () => {
    const { showtime, seat } = await createScenario();
    const stale = await createReservation(showtime.id, [seat.A1]);
    await expireReservationNow(stale.id);

    // POST /reservations ejecuta la expiración antes de reservar.
    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    expect(res.status).toBe(201);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED");
  });

  it("sin reservaciones vencidas devuelve 0", async () => {
    expect(await expirePendingReservations()).toBe(0);
  });
});
