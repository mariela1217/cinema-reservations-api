import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  message: z.string(),
}).meta({ id: "HealthResponse", description: "Estado del servicio. No consulta la base de datos." });
