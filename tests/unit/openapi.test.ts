// Contrato de la documentación OpenAPI (sin base de datos).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";
import { generateOpenAPIDocument } from "../../src/docs/openapi";
import * as ex from "../../src/docs/examples";
import { seatPriceCents, totalCents } from "../../src/domain/pricing";
import { calculateShowtimeEnd } from "../../src/domain/showtime-rules";
import { calculateExpiration, isWithinCancellationWindow } from "../../src/domain/reservation-rules";
import { errorHandler } from "../../src/middlewares/error-handler";
import { createMovieSchema, updateMovieSchema } from "../../src/schemas/movie.schema";
import { createRoomSchema } from "../../src/schemas/room.schema";
import { createShowtimeSchema } from "../../src/schemas/showtime.schema";
import { createReservationSchema } from "../../src/schemas/reservation.schema";
import { movieResponseSchema, moviesListResponseSchema } from "../../src/schemas/movie-response.schema";
import { roomResponseSchema } from "../../src/schemas/room-response.schema";
import {
  cancelShowtimeResponseSchema,
  showtimeResponseSchema,
  showtimeSeatsResponseSchema,
  showtimesListResponseSchema,
} from "../../src/schemas/showtime-response.schema";
import { reservationDetailResponseSchema, reservationResponseSchema } from "../../src/schemas/reservation-response.schema";
import { errorResponseSchema, validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import { healthResponseSchema } from "../../src/schemas/health-response.schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const doc: Json = generateOpenAPIDocument();
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

const operations = Object.entries(doc.paths).flatMap(([path, item]: [string, Json]) =>
  Object.entries(item)
    .filter(([method]) => HTTP_METHODS.includes(method))
    .map(([method, op]) => ({ key: `${method.toUpperCase()} ${path}`, method, path, op: op as Json }))
);

function collectRefs(node: Json, refs: string[] = []): string[] {
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") refs.push(node.$ref);
    Object.values(node).forEach((child) => collectRefs(child, refs));
  }
  return refs;
}

function expectValid(schema: ZodType, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success, result.success ? "" : JSON.stringify(result.error.issues, null, 2)).toBe(true);
}

// Todos los ejemplos del documento, emparejados con el esquema Zod que deben cumplir.
const validatedExamples: [string, unknown, ZodType][] = [
  ["health", ex.healthExample, healthResponseSchema],
  ["película", ex.movieExample, movieResponseSchema],
  ["lista de películas", [ex.movieExample], moviesListResponseSchema],
  ["película actualizada", ex.updatedMovieExample, movieResponseSchema],
  ["película desactivada", ex.deactivatedMovieExample, movieResponseSchema],
  ["crear película", ex.createMovieRequestExample, createMovieSchema],
  ["actualizar película", ex.updateMovieRequestExample, updateMovieSchema],
  ["crear sala", ex.createRoomRequestExample, createRoomSchema],
  ["sala", ex.roomExample, roomResponseSchema],
  ["crear función", ex.createShowtimeRequestExample, createShowtimeSchema],
  ["crear función con desplazamiento", ex.createShowtimeWithOffsetRequestExample, createShowtimeSchema],
  ["función", ex.showtimeExample, showtimeResponseSchema],
  ["lista de funciones", [ex.showtimeExample], showtimesListResponseSchema],
  ["disponibilidad", ex.showtimeSeatsExample, showtimeSeatsResponseSchema],
  ["cancelar función", ex.cancelShowtimeExample, cancelShowtimeResponseSchema],
  ["crear reservación", ex.createReservationRequestExample, createReservationSchema],
  ["reservación PENDING", ex.pendingReservationExample, reservationResponseSchema],
  ["reservación CONFIRMED", ex.confirmedReservationExample, reservationResponseSchema],
  ["reservación CANCELLED", ex.cancelledReservationExample, reservationResponseSchema],
  ["detalle de reservación", ex.reservationDetailExample, reservationDetailResponseSchema],
  ...Object.entries(ex.errorExamples).map(([k, e]) => [`error ${k}`, e.value, errorResponseSchema] as [string, unknown, ZodType]),
  ...Object.entries(ex.validationExamples).map(
    ([k, e]) => [`validación ${k}`, e.value, validationErrorResponseSchema] as [string, unknown, ZodType]
  ),
];

describe("Estructura del documento", () => {
  it("documenta las 13 rutas y 16 operaciones, incluida /health", () => {
    expect(Object.keys(doc.paths)).toHaveLength(13);
    expect(operations).toHaveLength(16);
    expect(doc.paths["/health"].get).toBeDefined();
  });

  it.each(operations.map((o) => [o.key, o.op]))("%s tiene operationId, tag, resumen y descripción", (_key, op: Json) => {
    expect(op.operationId).toMatch(/^[a-z][A-Za-z]+$/);
    expect(op.tags).toHaveLength(1);
    expect(op.summary).toBeTruthy();
    expect(op.description?.length).toBeGreaterThan(20);
  });

  it("los operationId son únicos y cada tag está descrito", () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    const described = new Set(doc.tags.map((t: Json) => t.name));
    for (const o of operations) expect(described.has(o.op.tags[0])).toBe(true);
  });

  it("cada parámetro de ruta tiene descripción y un ejemplo UUID válido", () => {
    for (const o of operations) {
      for (const param of o.op.parameters ?? []) {
        expect(param.description, o.key).toBeTruthy();
        expect(param.schema.example, o.key).toMatch(/^[0-9a-f-]{36}$/);
      }
    }
  });

  it("todas las referencias $ref apuntan a componentes registrados y no sobran componentes", () => {
    const components = doc.components.schemas;
    const refs = collectRefs(doc);
    const names = new Set(refs.map((r) => r.replace("#/components/schemas/", "")));
    expect(refs.length).toBeGreaterThan(0);
    for (const name of names) expect(components[name], name).toBeDefined();
    for (const name of Object.keys(components)) expect(names.has(name), `${name} sin usar`).toBe(true);
  });

  it("cada respuesta y cada cuerpo de solicitud tiene esquema y al menos un ejemplo", () => {
    for (const o of operations) {
      const media = [
        ...(o.op.requestBody ? [["body", o.op.requestBody.content["application/json"]]] : []),
        ...Object.entries(o.op.responses).map(([code, r]: [string, Json]) => [code, r.content?.["application/json"]]),
      ];
      for (const [where, content] of media) {
        expect(content?.schema, `${o.key} ${where}`).toBeDefined();
        expect(Object.keys(content?.examples ?? {}).length, `${o.key} ${where}`).toBeGreaterThan(0);
      }
    }
  });

  it("documenta 413 en las operaciones con cuerpo y 500 en todas salvo /health", () => {
    for (const o of operations) {
      if (o.op.requestBody) expect(o.op.responses["413"], o.key).toBeDefined();
      if (o.path !== "/health") expect(o.op.responses["500"], o.key).toBeDefined();
    }
  });

  it("los cuerpos de solicitud conservan sus restricciones de validación", () => {
    const s = doc.components.schemas;
    expect(s.CreateMovieRequest.additionalProperties).toBe(false);
    expect(s.CreateMovieRequest.required).toEqual(["title", "duration_minutes"]);
    expect(s.UpdateMovieRequest.minProperties).toBe(1);
    expect(s.CreateReservationRequest.properties.seat_ids).toMatchObject({ minItems: 1, maxItems: 6, uniqueItems: true });
    expect(s.CreateReservationRequest.additionalProperties).toBe(false);
    expect(s.CreateRoomRequest.properties.rows).toMatchObject({ minItems: 1, maxItems: 30 });
    expect(s.RoomRowRequest.properties.seats).toMatchObject({ minimum: 1, maximum: 50 });
    expect(s.CreateShowtimeRequest.properties.starts_at.format).toBe("date-time");
  });
});

describe("Ejemplos", () => {
  it.each(validatedExamples.map(([name, value, schema]) => [name, value, schema]))(
    "el ejemplo «%s» cumple su esquema Zod",
    (_name, value, schema) => expectValid(schema as ZodType, value)
  );

  it("cada ejemplo del documento es uno de los ejemplos validados", () => {
    const validated = validatedExamples.map(([, value]) => JSON.stringify(value));
    for (const o of operations) {
      const media = [
        o.op.requestBody?.content["application/json"],
        ...Object.values(o.op.responses).map((r: Json) => r.content?.["application/json"]),
      ].filter(Boolean);
      for (const content of media) {
        for (const [name, example] of Object.entries(content.examples ?? {}) as [string, Json][]) {
          expect(validated, `${o.key} → ${name}`).toContain(JSON.stringify(example.value));
        }
      }
    }
  });

  it("los ejemplos describen un escenario coherente con las reglas de negocio", () => {
    const movie = ex.movieExample;
    const showtime = ex.showtimeExample;
    const reservation = ex.pendingReservationExample;
    const room = ex.roomExample;

    // ends_at = inicio + duración + 20 min.
    expect(showtime.ends_at).toBe(calculateShowtimeEnd(new Date(showtime.starts_at), movie.duration_minutes).toISOString());
    expect(showtime.movie_id).toBe(movie.id);
    expect(showtime.room_id).toBe(room.id);

    // Precios por asiento y total.
    const typeOf = (seatId: string) => room.seats.find((s) => s.id === seatId)!.type;
    for (const rs of reservation.reservation_seats) {
      expect(rs.price_cents).toBe(seatPriceCents(showtime.base_price_cents, typeOf(rs.seat_id)));
      expect(rs.showtime_id).toBe(showtime.id);
    }
    expect(reservation.total_cents).toBe(totalCents(reservation.reservation_seats.map((s) => s.price_cents)));

    // Vence 10 min después de crearse.
    expect(reservation.expires_at).toBe(calculateExpiration(new Date(reservation.created_at)).toISOString());

    // La solicitud de ejemplo pide los mismos asientos que contiene la reservación.
    expect(ex.createReservationRequestExample.seat_ids).toEqual(reservation.reservation_seats.map((s) => s.seat_id));

    // La disponibilidad marca ocupados justo esos asientos.
    const taken = ex.showtimeSeatsExample.seats.filter((s) => !s.available).map((s) => s.id);
    expect(taken.sort()).toEqual([...ex.createReservationRequestExample.seat_ids].sort());

    // La cancelación de ejemplo ocurre dentro del plazo de 2 h y libera los asientos.
    const cancelled = ex.cancelledReservationExample;
    expect(isWithinCancellationWindow(new Date(showtime.starts_at), new Date(cancelled.updated_at))).toBe(true);
    expect(cancelled.reservation_seats.every((s) => !s.is_active)).toBe(true);

    // El historial encadena cada estado con el anterior.
    const chain = cancelled.status_history;
    chain.forEach((entry, i) => expect(entry.from_status).toBe(i === 0 ? null : chain[i - 1].to_status));
    expect(chain.at(-1)!.to_status).toBe(cancelled.status);
  });

  it("el ejemplo de error 500 es la respuesta real del middleware de errores", async () => {
    const app = express();
    app.get("/boom", () => {
      throw new Error("detalle interno");
    });
    app.use(errorHandler);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get("/boom");

    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual(ex.errorExamples.internal.value);
  });
});
