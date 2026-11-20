import { beforeAll, describe, expect, it } from "vitest";
import { errorResponseSchema, validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import {
  cancelShowtimeResponseSchema,
  showtimeResponseSchema,
  showtimeSeatsResponseSchema,
  showtimesListResponseSchema,
} from "../../src/schemas/showtime-response.schema";
import {
  UNKNOWN_UUID,
  activeSeatIds,
  api,
  confirmReservation,
  createMovie,
  createReservation,
  createRoom,
  createScenario,
  createShowtime,
  expectSchema,
  historyOf,
  hoursFromNow,
  moveShowtimeStart,
  prisma,
  resetDatabase,
} from "../support/fixtures";

beforeAll(resetDatabase);

describe("POST /showtimes", () => {
  it("crea la función y calcula ends_at = inicio + duración + 20 min", async () => {
    const movie = await createMovie({ duration_minutes: 100 });
    const room = await createRoom();
    const startsAt = new Date(Date.UTC(2031, 0, 15, 18, 0, 0));

    const res = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: startsAt.toISOString(), base_price_cents: 9_500 });

    expect(res.status).toBe(201);
    expectSchema(showtimeResponseSchema, res.body);
    expect(res.body).toMatchObject({
      movie_id: movie.id,
      room_id: room.id,
      status: "SCHEDULED",
      base_price_cents: 9_500,
      starts_at: "2031-01-15T18:00:00.000Z",
      ends_at: "2031-01-15T20:00:00.000Z",
    });
    expect(res.body.movie.id).toBe(movie.id);
    expect(res.body.room.id).toBe(room.id);
  });

  it("acepta una fecha con desplazamiento horario", async () => {
    const movie = await createMovie({ duration_minutes: 60 });
    const room = await createRoom();
    const res = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: "2031-02-01T10:00:00-06:00", base_price_cents: 5_000 });
    expect(res.status).toBe(201);
    expect(res.body.starts_at).toBe("2031-02-01T16:00:00.000Z");
  });

  it.each([
    ["fecha sin zona horaria", { starts_at: "2031-01-01T10:00:00" }],
    ["fecha inválida", { starts_at: "mañana" }],
    ["precio 0", { base_price_cents: 0 }],
    ["precio decimal", { base_price_cents: 99.5 }],
    ["movie_id inválido", { movie_id: "abc" }],
    ["campo no permitido (ends_at)", { ends_at: "2031-01-01T12:00:00Z" }],
  ])("rechaza %s con 400", async (_case, override) => {
    const movie = await createMovie();
    const room = await createRoom();
    const res = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(48).toISOString(), base_price_cents: 5_000, ...override });
    expect(res.status).toBe(400);
    expectSchema(validationErrorResponseSchema, res.body);
  });

  it("fecha en el pasado → 400", async () => {
    const movie = await createMovie();
    const room = await createRoom();
    const res = await api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(-1).toISOString(), base_price_cents: 5_000 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "La función debe comenzar en una fecha futura" });
  });

  it("película o sala inexistente → 404", async () => {
    const movie = await createMovie();
    const room = await createRoom();
    const startsAt = hoursFromNow(48).toISOString();

    const noMovie = await api().post("/showtimes").send({ movie_id: UNKNOWN_UUID, room_id: room.id, starts_at: startsAt, base_price_cents: 5_000 });
    expect(noMovie.status).toBe(404);
    expect(noMovie.body).toEqual({ message: "Película no encontrada" });

    const noRoom = await api().post("/showtimes").send({ movie_id: movie.id, room_id: UNKNOWN_UUID, starts_at: startsAt, base_price_cents: 5_000 });
    expect(noRoom.status).toBe(404);
    expect(noRoom.body).toEqual({ message: "Sala no encontrada" });
  });

  it("película inactiva → 409", async () => {
    const movie = await createMovie();
    const room = await createRoom();
    await api().patch(`/movies/${movie.id}/deactivate`);
    const res = await api().post("/showtimes").send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(48).toISOString(), base_price_cents: 5_000 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "No se pueden programar funciones de películas inactivas" });
  });

  describe("solapamiento en la misma sala (duración + 20 min de limpieza)", () => {
    it("rechaza una función que empieza durante otra → 409", async () => {
      const { movie, room, showtime } = await createScenario({ durationMinutes: 100 });
      const res = await api()
        .post("/showtimes")
        .send({
          movie_id: movie.id,
          room_id: room.id,
          starts_at: new Date(new Date(showtime.starts_at).getTime() + 110 * 60_000).toISOString(), // dentro de la limpieza
          base_price_cents: 5_000,
        });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: "La sala ya tiene una función programada en ese horario" });
    });

    it("rechaza una función que empieza antes y termina durante otra → 409", async () => {
      const { movie, room, showtime } = await createScenario({ durationMinutes: 100 });
      const res = await api()
        .post("/showtimes")
        .send({
          movie_id: movie.id,
          room_id: room.id,
          starts_at: new Date(new Date(showtime.starts_at).getTime() - 60 * 60_000).toISOString(),
          base_price_cents: 5_000,
        });
      expect(res.status).toBe(409);
    });

    it("permite una función que empieza exactamente en ends_at de otra", async () => {
      const { movie, room, showtime } = await createScenario({ durationMinutes: 100 });
      const res = await api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: room.id, starts_at: showtime.ends_at, base_price_cents: 5_000 });
      expect(res.status).toBe(201);
    });

    it("permite el mismo horario en otra sala", async () => {
      const { movie, showtime } = await createScenario();
      const otherRoom = await createRoom();
      const res = await api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: otherRoom.id, starts_at: showtime.starts_at, base_price_cents: 5_000 });
      expect(res.status).toBe(201);
    });

    it("una función cancelada libera su horario", async () => {
      const { movie, room, showtime } = await createScenario();
      await api().patch(`/showtimes/${showtime.id}/cancel`);
      const res = await api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: room.id, starts_at: showtime.starts_at, base_price_cents: 5_000 });
      expect(res.status).toBe(201);
    });
  });
});

describe("GET /showtimes", () => {
  it("lista las funciones ordenadas por inicio, con película y sala", async () => {
    const movie = await createMovie();
    const late = await createShowtime({ movieId: movie.id, roomId: (await createRoom()).id, startsAt: hoursFromNow(24 * 60) });
    const early = await createShowtime({ movieId: movie.id, roomId: (await createRoom()).id, startsAt: hoursFromNow(24 * 59) });

    const res = await api().get("/showtimes");
    expect(res.status).toBe(200);
    expectSchema(showtimesListResponseSchema, res.body);

    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(late.id));
    const starts = res.body.map((s: { starts_at: string }) => s.starts_at);
    expect([...starts].sort()).toEqual(starts);
  });
});

describe("GET /showtimes/:id/seats", () => {
  it("todos los asientos disponibles en una función nueva", async () => {
    const { showtime, room } = await createScenario();
    const res = await api().get(`/showtimes/${showtime.id}/seats`);

    expect(res.status).toBe(200);
    expectSchema(showtimeSeatsResponseSchema, res.body);
    expect(res.body).toMatchObject({ showtime_id: showtime.id, room_id: room.id });
    expect(res.body.seats).toHaveLength(6);
    expect(res.body.seats.every((s: { available: boolean }) => s.available)).toBe(true);
  });

  it("los asientos reservados aparecen ocupados", async () => {
    const { showtime, seat } = await createScenario();
    await createReservation(showtime.id, [seat.A1, seat.B1]);

    const res = await api().get(`/showtimes/${showtime.id}/seats`);
    const unavailable = res.body.seats.filter((s: { available: boolean }) => !s.available).map((s: { id: string }) => s.id);
    expect(unavailable.sort()).toEqual([seat.A1, seat.B1].sort());
  });

  it("una función cancelada no tiene asientos disponibles", async () => {
    const { showtime } = await createScenario();
    await api().patch(`/showtimes/${showtime.id}/cancel`);
    const res = await api().get(`/showtimes/${showtime.id}/seats`);
    expect(res.body.seats.some((s: { available: boolean }) => s.available)).toBe(false);
  });

  it("una función ya iniciada no tiene asientos disponibles", async () => {
    const { showtime } = await createScenario();
    await moveShowtimeStart(showtime.id, hoursFromNow(-0.5));
    const res = await api().get(`/showtimes/${showtime.id}/seats`);
    expect(res.body.seats.some((s: { available: boolean }) => s.available)).toBe(false);
  });

  it("ID inválido → 400 y función inexistente → 404", async () => {
    expect((await api().get("/showtimes/abc/seats")).status).toBe(400);
    const missing = await api().get(`/showtimes/${UNKNOWN_UUID}/seats`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Función no encontrada" });
  });
});

describe("PATCH /showtimes/:id/cancel", () => {
  it("cancela la función y en cascada sus reservaciones pendientes y confirmadas", async () => {
    const { showtime, seat } = await createScenario();
    const pending = await createReservation(showtime.id, [seat.A1]);
    const confirmed = await createReservation(showtime.id, [seat.A2]);
    await confirmReservation(confirmed.id);
    const alreadyCancelled = await createReservation(showtime.id, [seat.A3]);
    await api().patch(`/reservations/${alreadyCancelled.id}/cancel`);

    const res = await api().patch(`/showtimes/${showtime.id}/cancel`);

    expect(res.status).toBe(200);
    expectSchema(cancelShowtimeResponseSchema, res.body);
    expect(res.body.showtime.status).toBe("CANCELLED");
    expect(res.body.cancelled_reservations).toBe(2);

    for (const id of [pending.id, confirmed.id]) {
      const r = await prisma.reservation.findUniqueOrThrow({ where: { id } });
      expect(r.status).toBe("CANCELLED");
      expect(r.expires_at).toBeNull();
      expect(await activeSeatIds(id)).toEqual([]);
    }
    expect(await historyOf(pending.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:SHOWTIME_CANCELLED"]);
    expect(await historyOf(confirmed.id)).toEqual([
      "∅→PENDING:CREATED",
      "PENDING→CONFIRMED:CONFIRMED_BY_CUSTOMER",
      "CONFIRMED→CANCELLED:SHOWTIME_CANCELLED",
    ]);
    // La reservación que ya estaba cancelada no recibe una segunda transición.
    expect(await historyOf(alreadyCancelled.id)).toEqual(["∅→PENDING:CREATED", "PENDING→CANCELLED:CANCELLED_BY_CUSTOMER"]);
  });

  it("deja a la expiración las PENDING ya vencidas", async () => {
    const { showtime, seat } = await createScenario();
    const stale = await createReservation(showtime.id, [seat.A1]);
    await prisma.reservation.update({ where: { id: stale.id }, data: { expires_at: new Date(Date.now() - 1_000) } });

    const res = await api().patch(`/showtimes/${showtime.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.cancelled_reservations).toBe(0);
  });

  it("cancelar dos veces → 409", async () => {
    const { showtime } = await createScenario();
    await api().patch(`/showtimes/${showtime.id}/cancel`);
    const res = await api().patch(`/showtimes/${showtime.id}/cancel`);
    expect(res.status).toBe(409);
    expectSchema(errorResponseSchema, res.body);
    expect(res.body).toEqual({ message: "La función ya está cancelada" });
  });

  it("ID inválido → 400 y función inexistente → 404", async () => {
    expect((await api().patch("/showtimes/abc/cancel")).status).toBe(400);
    const missing = await api().patch(`/showtimes/${UNKNOWN_UUID}/cancel`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Función no encontrada" });
  });
});
