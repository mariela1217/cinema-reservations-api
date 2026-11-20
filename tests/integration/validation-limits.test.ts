// Límites máximos de duración, precio base y correo: el límite exacto se acepta,
// el límite + 1 responde 400 (antes producía 500 al exceder las columnas).
import { beforeAll, describe, expect, it } from "vitest";
import { validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import {
  api,
  createMovie,
  createRoom,
  createScenario,
  expectSchema,
  hoursFromNow,
  prisma,
  reservationBody,
  resetDatabase,
  uniqueName,
} from "../support/fixtures";

beforeAll(resetDatabase);

const MAX_DURATION = 1440;
const MAX_PRICE = 10_000_000;
const MAX_EMAIL = 254;

// Correo sintácticamente válido de exactamente `length` caracteres.
function emailOfLength(length: number): string {
  const local = "a".repeat(64);
  const fixed = local.length + "@".length + 63 + 1 + 63 + 1 + ".com".length;
  return `${local}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - fixed)}.com`;
}

function expectFieldError(body: unknown, field: string, message: string) {
  expectSchema(validationErrorResponseSchema, body);
  expect((body as { errors: { fieldErrors: Record<string, string[]> } }).errors.fieldErrors[field]).toContain(message);
}

describe("duration_minutes: máximo 1440", () => {
  it("acepta exactamente 1440 minutos", async () => {
    const res = await api().post("/movies").send({ title: uniqueName("Maratón"), duration_minutes: MAX_DURATION });
    expect(res.status).toBe(201);
    expect(res.body.duration_minutes).toBe(MAX_DURATION);
  });

  it("rechaza 1441 minutos con 400 al crear", async () => {
    const res = await api().post("/movies").send({ title: uniqueName("Maratón"), duration_minutes: MAX_DURATION + 1 });
    expect(res.status).toBe(400);
    expectFieldError(res.body, "duration_minutes", "La duración no puede superar 1440 minutos");
  });

  it("rechaza 1441 minutos con 400 al actualizar", async () => {
    const movie = await createMovie();
    const res = await api().patch(`/movies/${movie.id}`).send({ duration_minutes: MAX_DURATION + 1 });
    expect(res.status).toBe(400);
    expectFieldError(res.body, "duration_minutes", "La duración no puede superar 1440 minutos");
  });

  it("rechaza un valor fuera del rango de INTEGER con 400 (antes 500)", async () => {
    const res = await api().post("/movies").send({ title: uniqueName("Maratón"), duration_minutes: 3_000_000_000 });
    expect(res.status).toBe(400);
  });
});

describe("base_price_cents: máximo 10 000 000", () => {
  const showtimeBody = async (price: number) => {
    const movie = await createMovie();
    const room = await createRoom();
    return { movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(48).toISOString(), base_price_cents: price };
  };

  it("acepta exactamente 10 000 000 centavos", async () => {
    const res = await api().post("/showtimes").send(await showtimeBody(MAX_PRICE));
    expect(res.status).toBe(201);
    expect(res.body.base_price_cents).toBe(MAX_PRICE);
  });

  it("rechaza 10 000 001 centavos con 400", async () => {
    const res = await api().post("/showtimes").send(await showtimeBody(MAX_PRICE + 1));
    expect(res.status).toBe(400);
    expectFieldError(res.body, "base_price_cents", "El precio no puede superar 10000000 centavos");
  });

  it("reserva 6 asientos VIP con el precio máximo sin desbordar: 6 × 13 000 000", async () => {
    const movie = await createMovie();
    const room = await createRoom([{ label: "V", seats: 6, type: "VIP" }]);
    const showtime = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(72).toISOString(), base_price_cents: MAX_PRICE });
    expect(showtime.status).toBe(201);

    const res = await api().post("/reservations").send(reservationBody(showtime.body.id, Object.values(room.seat)));

    expect(res.status).toBe(201);
    expect(res.body.reservation_seats).toHaveLength(6);
    expect(res.body.reservation_seats.every((s: { price_cents: number }) => s.price_cents === 13_000_000)).toBe(true);
    expect(res.body.total_cents).toBe(78_000_000);

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.total_cents).toBe(78_000_000);
  });
});

describe("customer_email: máximo 254 caracteres", () => {
  it("acepta un correo de exactamente 254 caracteres", async () => {
    const { showtime, seat } = await createScenario();
    const email = emailOfLength(MAX_EMAIL);
    expect(email).toHaveLength(MAX_EMAIL);

    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1], { customer_email: email }));
    expect(res.status).toBe(201);
    expect(res.body.customer_email).toBe(email);
  });

  it("rechaza un correo de 255 caracteres con 400 (antes 500)", async () => {
    const { showtime, seat } = await createScenario();
    const email = emailOfLength(MAX_EMAIL + 1);
    expect(email).toHaveLength(MAX_EMAIL + 1);

    const res = await api().post("/reservations").send(reservationBody(showtime.id, [seat.A1], { customer_email: email }));
    expect(res.status).toBe(400);
    expectFieldError(res.body, "customer_email", "El correo no puede superar 254 caracteres");
    expect(await prisma.reservation.count({ where: { showtime_id: showtime.id } })).toBe(0);
  });
});
