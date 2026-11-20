// Ayudantes para coordinar escenarios de concurrencia de forma determinista.
//
// Una transacción "compuerta" retiene un bloqueo de fila concreto. Las peticiones HTTP que
// necesitan esa fila quedan esperando dentro de PostgreSQL; waitForBlocked() confirma en
// pg_stat_activity que cada petición está detenida en la sentencia esperada antes de seguir.
// Nada depende de esperas arbitrarias: solo de condiciones observables.
import type { PrismaClient, Prisma } from "@prisma/client";
import type request from "supertest";
import { expect } from "vitest";
import { assertConnectedToTestDatabase, createTestPrismaClient, resolveTestDatabaseUrl } from "./test-database";

// Sentencias que generan Prisma 6 y nuestro SQL en los puntos de espera.
// Si una actualización mayor de Prisma cambia el texto del SQL, se ajusta solo aquí.
export const WAITING_ON = {
  showtimeShareLock: /FOR SHARE/,
  showtimeUpdate: /UPDATE "public"\."showtimes"/,
  reservationUpdate: /UPDATE "public"\."reservations"/,
  reservationSeatsUpdate: /UPDATE "public"\."reservation_seats"/,
  reservationSeatsInsert: /INSERT INTO "public"\."reservation_seats"/,
  reservationsRowLock: /FROM reservations[\s\S]*FOR UPDATE/,
} as const;

let gateClient: PrismaClient | null = null;

// Cliente independiente del de la app, protegido por las mismas barreras.
export async function openGateClient(): Promise<PrismaClient> {
  gateClient = createTestPrismaClient(resolveTestDatabaseUrl());
  await assertConnectedToTestDatabase(gateClient);
  return gateClient;
}

export async function closeGateClient(): Promise<void> {
  await gateClient?.$disconnect();
  gateClient = null;
}

function gate(): PrismaClient {
  if (!gateClient) throw new Error("Llama a openGateClient() en beforeAll.");
  return gateClient;
}

export type HeldLock = { release: () => Promise<void> };

// Abre una transacción que ejecuta `lock` (un SELECT … FOR UPDATE) y la mantiene abierta
// hasta release(). Usar siempre con try/finally para no dejar bloqueos colgados si falla una aserción.
export async function holdLock(lock: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<HeldLock> {
  let releaseSignal!: () => void;
  let acquiredSignal!: () => void;
  const released = new Promise<void>((resolve) => (releaseSignal = resolve));
  const acquired = new Promise<void>((resolve) => (acquiredSignal = resolve));

  const done = gate().$transaction(
    async (tx) => {
      await lock(tx);
      acquiredSignal();
      await released;
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  // Si el bloqueo falla, `done` rechaza y la prueba falla aquí.
  await Promise.race([acquired, done]);

  let finished = false;
  return {
    async release() {
      if (finished) return;
      finished = true;
      releaseSignal();
      await done;
    },
  };
}

// Espera hasta que al menos `count` sesiones estén bloqueadas en una sentencia que coincida
// con `pattern`. Devuelve false si no ocurre antes del límite (por defecto 3 s, menor que el
// timeout de 5 s de las transacciones interactivas de Prisma).
export async function waitForBlocked(pattern: RegExp, count = 1, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await gate().$queryRaw<{ query: string }[]>`
      SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;

    if (rows.filter((row) => pattern.test(row.query)).length >= count) {
      return true;
    }
  }

  return false;
}

// Lanza la petición sin esperar su respuesta (Supertest la envía al llamar a then()).
export function start(test: request.Test): Promise<request.Response> {
  return Promise.resolve(test);
}

// Las 8 invariantes de integridad, limitadas a las funciones del escenario.
export async function findInvariantViolations(showtimeIds: string[]): Promise<Record<string, number>> {
  const ids = showtimeIds;
  const [row] = await gate().$queryRaw<Record<string, number>[]>`
    SELECT
      (SELECT count(*) FROM reservations r JOIN showtimes s ON s.id = r.showtime_id
        WHERE r.showtime_id = ANY(${ids}::uuid[]) AND s.status = 'CANCELLED'
          AND (r.status = 'CONFIRMED' OR (r.status = 'PENDING' AND r.expires_at > now())))::int
        AS i1_reserva_activa_en_funcion_cancelada,
      (SELECT count(*) FROM reservation_seats rs JOIN reservations r ON r.id = rs.reservation_id
        WHERE r.showtime_id = ANY(${ids}::uuid[]) AND rs.is_active AND r.status NOT IN ('PENDING', 'CONFIRMED'))::int
        AS i2_asiento_activo_en_reserva_inactiva,
      (SELECT count(*) FROM reservation_seats rs JOIN reservations r ON r.id = rs.reservation_id
        WHERE r.showtime_id = ANY(${ids}::uuid[]) AND NOT rs.is_active AND r.status IN ('PENDING', 'CONFIRMED'))::int
        AS i3_asiento_inactivo_en_reserva_activa,
      (SELECT count(*) FROM reservation_seats rs JOIN reservations r ON r.id = rs.reservation_id
        WHERE r.showtime_id = ANY(${ids}::uuid[]) AND rs.showtime_id <> r.showtime_id)::int
        AS i4_showtime_id_inconsistente,
      (SELECT count(*) FROM reservations r WHERE r.showtime_id = ANY(${ids}::uuid[]) AND r.status IS DISTINCT FROM
        (SELECT h.to_status FROM reservation_status_history h WHERE h.reservation_id = r.id
          ORDER BY h.changed_at DESC, h.id DESC LIMIT 1))::int
        AS i5_historial_distinto_del_estado,
      (SELECT count(*) FROM (
          SELECT h.from_status, lag(h.to_status) OVER (PARTITION BY h.reservation_id ORDER BY h.changed_at, h.id) AS previous
          FROM reservation_status_history h JOIN reservations r ON r.id = h.reservation_id
          WHERE r.showtime_id = ANY(${ids}::uuid[])) chain
        WHERE chain.from_status IS DISTINCT FROM chain.previous)::int
        AS i6_cadena_de_historial_rota,
      (SELECT count(*) FROM (
          SELECT seat_id FROM reservation_seats
          WHERE showtime_id = ANY(${ids}::uuid[]) AND is_active
          GROUP BY showtime_id, seat_id HAVING count(*) > 1) doubles)::int
        AS i7_asiento_reservado_dos_veces,
      (SELECT count(*) FROM reservations r WHERE r.showtime_id = ANY(${ids}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM reservation_seats rs WHERE rs.reservation_id = r.id))::int
        AS i8_reserva_sin_asientos`;

  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== 0));
}

export async function expectInvariantsHold(showtimeIds: string[]): Promise<void> {
  expect(await findInvariantViolations(showtimeIds)).toEqual({});
}
