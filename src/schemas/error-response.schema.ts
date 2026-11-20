import { z } from "zod";

export const errorResponseSchema = z.object({
  message: z.string(),
});

// Estructura de ZodError.flatten() usada en las respuestas 400 de validación.
export const validationErrorResponseSchema = z.object({
  message: z.string(),
  errors: z.object({
    formErrors: z.array(z.string()),
    fieldErrors: z.record(z.string(), z.array(z.string())),
  }),
});
