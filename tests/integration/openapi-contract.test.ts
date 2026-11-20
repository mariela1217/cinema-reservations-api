// Contrato entre la documentación y la API real: cada ejemplo de error documentado
// se provoca por HTTP y su respuesta debe coincidir exactamente con el ejemplo.
import type { Response } from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { generateOpenAPIDocument } from "../../src/docs/openapi";
import {
  type ErrorExampleKey,
  type ValidationExampleKey,
  errorExamples,
  validationExamples,
} from "../../src/docs/examples";
import {
  UNKNOWN_UUID,
  api,
  confirmReservation,
  createMovie,
  createReservation,
  createRoom,
  createScenario,
  hoursFromNow,
  moveShowtimeStart,
  reservationBody,
  resetDatabase,
} from "../support/fixtures";

beforeAll(resetDatabase);

type Trigger = () => Promise<Response>;

// Cómo provocar cada error documentado. "internal" (500) no puede provocarse por HTTP sin
// romper la base de datos; su ejemplo se verifica en tests/unit/openapi.test.ts.
const errorTriggers: Record<Exclude<ErrorExampleKey, "internal">, { status: number; trigger: Trigger }> = {
  invalidId: { status: 400, trigger: () => api().get("/movies/abc") },
  malformedJson: {
    status: 400,
    trigger: () => api().post("/movies").set("Content-Type", "application/json").send('{"title":'),
  },
  payloadTooLarge: {
    status: 413,
    trigger: () => api().post("/movies").send({ title: "x".repeat(110 * 1024), duration_minutes: 90 }),
  },
  movieNotFound: { status: 404, trigger: () => api().get(`/movies/${UNKNOWN_UUID}`) },
  movieAlreadyInactive: {
    status: 409,
    trigger: async () => {
      const movie = await createMovie();
      await api().patch(`/movies/${movie.id}/deactivate`);
      return api().patch(`/movies/${movie.id}/deactivate`);
    },
  },
  roomNotFound: { status: 404, trigger: () => api().get(`/rooms/${UNKNOWN_UUID}`) },
  roomNameTaken: {
    status: 409,
    trigger: async () => {
      const room = await createRoom();
      return api().post("/rooms").send({ name: room.name, rows: [{ label: "A", seats: 1, type: "REGULAR" }] });
    },
  },
  showtimeInPast: {
    status: 400,
    trigger: async () => {
      const movie = await createMovie();
      const room = await createRoom();
      return api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(-1).toISOString(), base_price_cents: 5_000 });
    },
  },
  showtimeInactiveMovie: {
    status: 409,
    trigger: async () => {
      const movie = await createMovie();
      const room = await createRoom();
      await api().patch(`/movies/${movie.id}/deactivate`);
      return api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: room.id, starts_at: hoursFromNow(48).toISOString(), base_price_cents: 5_000 });
    },
  },
  showtimeOverlap: {
    status: 409,
    trigger: async () => {
      const { movie, room, showtime } = await createScenario();
      return api()
        .post("/showtimes")
        .send({ movie_id: movie.id, room_id: room.id, starts_at: showtime.starts_at, base_price_cents: 5_000 });
    },
  },
  showtimeNotFound: { status: 404, trigger: () => api().get(`/showtimes/${UNKNOWN_UUID}/seats`) },
  showtimeAlreadyCancelled: {
    status: 409,
    trigger: async () => {
      const { showtime } = await createScenario();
      await api().patch(`/showtimes/${showtime.id}/cancel`);
      return api().patch(`/showtimes/${showtime.id}/cancel`);
    },
  },
  reservationShowtimeUnavailable: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario();
      await api().patch(`/showtimes/${showtime.id}/cancel`);
      return api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    },
  },
  seatsNotInRoom: {
    status: 400,
    trigger: async () => {
      const { showtime } = await createScenario();
      const other = await createScenario();
      return api().post("/reservations").send(reservationBody(showtime.id, [other.seat.A1]));
    },
  },
  seatsTaken: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario();
      await createReservation(showtime.id, [seat.A1]);
      return api().post("/reservations").send(reservationBody(showtime.id, [seat.A1]));
    },
  },
  reservationNotFound: { status: 404, trigger: () => api().get(`/reservations/${UNKNOWN_UUID}`) },
  confirmShowtimeUnavailable: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario();
      const reservation = await createReservation(showtime.id, [seat.A1]);
      await moveShowtimeStart(showtime.id, hoursFromNow(-0.1));
      return api().patch(`/reservations/${reservation.id}/confirm`);
    },
  },
  confirmNotPending: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario();
      const reservation = await createReservation(showtime.id, [seat.A1]);
      await confirmReservation(reservation.id);
      return api().patch(`/reservations/${reservation.id}/confirm`);
    },
  },
  cancelFinalState: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario();
      const reservation = await createReservation(showtime.id, [seat.A1]);
      await api().patch(`/reservations/${reservation.id}/cancel`);
      return api().patch(`/reservations/${reservation.id}/cancel`);
    },
  },
  cancelOutsideWindow: {
    status: 409,
    trigger: async () => {
      const { showtime, seat } = await createScenario({ startsAt: hoursFromNow(3) });
      const reservation = await createReservation(showtime.id, [seat.A1]);
      await confirmReservation(reservation.id);
      await moveShowtimeStart(showtime.id, hoursFromNow(1.9));
      return api().patch(`/reservations/${reservation.id}/cancel`);
    },
  },
};

// Entradas que producen cada ejemplo de validación documentado (salida real de Zod).
const validationTriggers: Record<ValidationExampleKey, Trigger> = {
  movieMissingFields: () => api().post("/movies").send({}),
  movieUnknownField: () => api().post("/movies").send({ title: "Dune", duration_minutes: 166, is_active: false }),
  movieEmptyPatch: async () => {
    const movie = await createMovie();
    return api().patch(`/movies/${movie.id}`).send({});
  },
  roomDuplicateRows: () =>
    api()
      .post("/rooms")
      .send({ name: "Sala 1", rows: [{ label: "A", seats: 10, type: "REGULAR" }, { label: "A", seats: 8, type: "VIP" }] }),
  showtimeInvalidFields: async () => {
    const movie = await createMovie();
    const room = await createRoom();
    return api()
      .post("/showtimes")
      .send({ movie_id: movie.id, room_id: room.id, starts_at: "2026-12-05 20:00", base_price_cents: 0 });
  },
  reservationInvalidFields: async () => {
    const { showtime } = await createScenario();
    return api()
      .post("/reservations")
      .send(reservationBody(showtime.id, [], { customer_email: "ana.perez" }));
  },
  reservationTooManySeatsAndTotal: async () => {
    const { showtime } = await createScenario();
    const seatIds = Array.from({ length: 7 }, (_, i) => `0a0a0a0a-0000-4000-8000-00000000000${i}`);
    return api()
      .post("/reservations")
      .send(reservationBody(showtime.id, seatIds, { total_cents: 1 }));
  },
};

describe("Los ejemplos de error documentados coinciden con la API", () => {
  it("cada ejemplo de error tiene un disparador, salvo el 500", () => {
    expect(Object.keys(errorTriggers).sort()).toEqual(
      Object.keys(errorExamples).filter((key) => key !== "internal").sort()
    );
  });

  it.each(Object.entries(errorTriggers))("%s", async (key, { status, trigger }) => {
    const res = await trigger();
    expect(res.status).toBe(status);
    expect(res.body).toEqual(errorExamples[key as ErrorExampleKey].value);
  });

  it.each(Object.entries(validationTriggers))("validación: %s", async (key, trigger) => {
    const res = await trigger();
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validationExamples[key as ValidationExampleKey].value);
  });
});

describe("Cada respuesta documentada declara el código que la API devuelve", () => {
  const doc = generateOpenAPIDocument() as unknown as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };

  it.each([
    ["/movies/{id}", "get", "400"],
    ["/movies/{id}/deactivate", "patch", "409"],
    ["/rooms", "post", "409"],
    ["/showtimes", "post", "409"],
    ["/reservations", "post", "409"],
    ["/reservations", "post", "413"],
    ["/reservations/{id}/confirm", "patch", "409"],
    ["/reservations/{id}/cancel", "patch", "409"],
  ])("%s %s documenta %s", (path, method, code) => {
    expect(doc.paths[path][method].responses[code]).toBeDefined();
  });
});

describe("Documento servido", () => {
  it("/api-docs.json sirve exactamente el documento generado", async () => {
    const res = await api().get("/api-docs.json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(generateOpenAPIDocument())));
  });
});
