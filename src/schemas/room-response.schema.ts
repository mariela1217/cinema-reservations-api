import { z } from "zod";
import { seatTypeSchema } from "./enums.schema";

export const seatResponseSchema = z.object({
  id: z.uuid().meta({ description: "Identificador del asiento. Se usa en seat_ids al reservar." }),
  room_id: z.uuid().meta({ description: "Sala a la que pertenece." }),
  row_label: z.string().meta({ description: "Etiqueta de la fila." }),
  seat_number: z.number().int().positive().meta({ description: "Número dentro de la fila (desde 1)." }),
  type: seatTypeSchema,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).meta({ id: "Seat", description: "Asiento físico de una sala." });

export const roomResponseSchema = z.object({
  id: z.uuid().meta({ description: "Identificador de la sala." }),
  name: z.string().meta({ description: "Nombre único de la sala." }),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  seats: z.array(seatResponseSchema).meta({ description: "Asientos ordenados por fila y número." }),
}).meta({ id: "Room", description: "Sala con todos sus asientos." });
