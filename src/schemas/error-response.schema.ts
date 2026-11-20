import { z } from "zod";

export const errorResponseSchema = z.object({
  message: z.string().meta({ description: "Mensaje legible. Nunca incluye detalles internos ni stack traces." }),
}).meta({ id: "Error", description: "Formato de todos los errores, salvo los de validación." });

// Estructura de ZodError.flatten() usada en las respuestas 400 de validación.
export const validationErrorResponseSchema = z.object({
  message: z.string().meta({ description: 'Siempre "Datos inválidos".', example: "Datos inválidos" }),
  errors: z.object({
    formErrors: z.array(z.string()).meta({ description: "Errores del objeto completo (p. ej. campos no permitidos)." }),
    fieldErrors: z.record(z.string(), z.array(z.string())).meta({ description: "Errores por campo: nombre del campo → mensajes." }),
  }),
}).meta({ id: "ValidationError", description: "Error 400 de validación de entrada (Zod)." });
