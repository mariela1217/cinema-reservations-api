import { z } from "zod";

// .meta() solo agrega documentación OpenAPI; no cambia la validación.
const rowSchema = z.object({
  label: z.string()
    .trim()
    .min(1, "La fila debe tener una etiqueta")
    .max(5, "La etiqueta no puede superar 5 caracteres")
    .meta({ description: "Etiqueta de la fila (1 a 5 caracteres, se recortan espacios). Debe ser única en la sala.", example: "A" }),

  seats: z.number()
    .int("La cantidad de asientos debe ser entera")
    .min(1, "Cada fila debe tener al menos un asiento")
    .max(50, "Máximo 50 asientos por fila")
    .meta({ description: "Cantidad de asientos de la fila (1 a 50). Se numeran desde 1.", example: 10 }),

  type: z.enum(["REGULAR", "VIP"]).meta({
    description: "Tipo de todos los asientos de la fila. Los VIP cuestan 30 % más que el precio base de la función.",
    example: "REGULAR",
  }),
}).strict().meta({ id: "RoomRowRequest", description: "Fila de asientos que se generará en la sala." });

export const createRoomSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "El nombre de la sala es obligatorio")
    .max(100, "Máximo 100 caracteres")
    .meta({ description: "Nombre único de la sala (1 a 100 caracteres, se recortan espacios).", example: "Sala 1" }),

  rows: z.array(rowSchema)
    .min(1, "Debe existir al menos una fila")
    .max(30, "Máximo 30 filas")
    .refine(
      (rows) => new Set(rows.map((row) => row.label)).size === rows.length,
      "No se pueden repetir las etiquetas de las filas"
    )
    .meta({ description: "Entre 1 y 30 filas con etiquetas distintas." }),
}).strict().meta({
  id: "CreateRoomRequest",
  description: "Sala y sus filas. El servidor genera los asientos (fila + número) en la misma transacción.",
});
