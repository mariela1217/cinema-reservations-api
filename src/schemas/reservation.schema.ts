import { z } from "zod";

// .meta() solo agrega documentación OpenAPI; no cambia la validación.
export const createReservationSchema = z.object({
  showtime_id: z.uuid().meta({ description: "UUID de la función.", example: "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f" }),

  customer_name: z.string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(150, "El nombre no puede superar 150 caracteres")
    .meta({ description: "Nombre del cliente (1 a 150 caracteres, se recortan espacios).", example: "Ana Pérez" }),

  customer_email: z.email().meta({ description: "Correo electrónico del cliente.", example: "ana.perez@example.com" }),

  seat_ids: z.array(z.uuid())
    .min(1, "Debes seleccionar al menos un asiento")
    .max(6, "No puedes reservar más de seis asientos")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "No puedes seleccionar el mismo asiento dos veces"
    )
    .meta({
      description: "Entre 1 y 6 UUID de asientos distintos, todos de la sala de la función.",
      uniqueItems: true,
      example: ["0a0a0a0a-0000-4000-8000-0000000000a1", "0a0a0a0a-0000-4000-8000-0000000000b1"],
    } as never),
}).strict().meta({
  id: "CreateReservationRequest",
  description:
    "Datos de la reservación. El total y los precios los calcula el servidor; " +
    "enviar campos adicionales (p. ej. total_cents o status) produce 400.",
});
