import { z } from "zod";

// .meta() solo agrega documentación OpenAPI; no cambia la validación.
export const createShowtimeSchema = z.object({
  movie_id: z.uuid().meta({ description: "UUID de una película activa.", example: "6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d" }),

  room_id: z.uuid().meta({ description: "UUID de la sala.", example: "a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d" }),

  starts_at: z.iso.datetime({ offset: true }).meta({
    description:
      "Inicio de la función en ISO 8601 con zona horaria obligatoria (Z o ±hh:mm). Debe ser una fecha futura. " +
      "Las respuestas siempre devuelven las fechas en UTC.",
    example: "2026-12-05T20:00:00.000Z",
  }),

  base_price_cents: z.number()
    .int("El precio debe ser un número entero")
    .positive("El precio debe ser mayor que cero")
    .meta({
      description: "Precio base por asiento REGULAR, en centavos (entero > 0). El VIP se calcula en el servidor: base × 1,3, redondeado.",
      example: 10000,
    }),
}).strict().meta({
  id: "CreateShowtimeRequest",
  description: "Datos para programar una función. ends_at no se envía: lo calcula el servidor.",
});
