import { z } from "zod";

export const createMovieSchema = z.object({
  title: z.string()
    .trim()
    .min(1, "El título es obligatorio")
    .max(200, "El título no puede superar 200 caracteres"),

  duration_minutes: z.number()
    .int("La duración debe ser un número entero")
    .positive("La duración debe ser mayor que cero")
}).strict();