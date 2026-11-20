import { z } from "zod";

export const movieResponseSchema = z.object({
  id: z.uuid().meta({ description: "Identificador de la película." }),
  title: z.string().meta({ description: "Título." }),
  duration_minutes: z.number().int().positive().meta({ description: "Duración en minutos." }),
  is_active: z.boolean().meta({
    description: "false si fue desactivada. Una película inactiva no admite funciones nuevas; las ya programadas no se modifican.",
  }),
  created_at: z.iso.datetime().meta({ description: "Fecha de alta (UTC)." }),
  updated_at: z.iso.datetime().meta({ description: "Última modificación (UTC)." }),
}).meta({ id: "Movie", description: "Película del catálogo." });

export const moviesListResponseSchema =
  z.array(movieResponseSchema);
