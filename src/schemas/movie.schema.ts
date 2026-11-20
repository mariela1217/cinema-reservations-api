import { z } from "zod";

// .meta() solo agrega documentación OpenAPI; no cambia la validación.
export const createMovieSchema = z.object({
  title: z.string()
    .trim()
    .min(1, "El título es obligatorio")
    .max(200, "El título no puede superar 200 caracteres")
    .meta({ description: "Título de la película. Se recortan los espacios al inicio y al final.", example: "Dune: Parte Dos" }),

  duration_minutes: z.number()
    .int("La duración debe ser un número entero")
    .positive("La duración debe ser mayor que cero")
    .max(1440, "La duración no puede superar 1440 minutos")
    .meta({
      description:
        "Duración en minutos (entero de 1 a 1440, es decir, hasta 24 h). Junto con 20 min de limpieza define cuánto ocupa la sala cada función.",
      example: 166,
    }),
}).strict().meta({
  id: "CreateMovieRequest",
  description: "Datos para registrar una película. No se aceptan campos adicionales (p. ej. is_active).",
});

export const updateMovieSchema = createMovieSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "Debes proporcionar al menos un campo para actualizar",
  }
).meta({
  id: "UpdateMovieRequest",
  description: "Campos a modificar. Debe incluir al menos uno; no se aceptan campos adicionales.",
  minProperties: 1,
} as never);
