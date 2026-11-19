import { z } from "zod";

const rowSchema = z.object({
  label: z.string()
    .trim()
    .min(1, "La fila debe tener una etiqueta")
    .max(5, "La etiqueta no puede superar 5 caracteres"),

  seats: z.number()
    .int("La cantidad de asientos debe ser entera")
    .min(1, "Cada fila debe tener al menos un asiento")
    .max(50, "Máximo 50 asientos por fila"),

  type: z.enum(["REGULAR", "VIP"]),
}).strict();

export const createRoomSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "El nombre de la sala es obligatorio")
    .max(100, "Máximo 100 caracteres"),

  rows: z.array(rowSchema)
    .min(1, "Debe existir al menos una fila")
    .max(30, "Máximo 30 filas")
    .refine(
      (rows) => new Set(rows.map((row) => row.label)).size === rows.length,
      "No se pueden repetir las etiquetas de las filas"
    ),
}).strict();