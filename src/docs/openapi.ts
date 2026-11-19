import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { createMovieSchema, updateMovieSchema } from "../schemas/movie.schema";
import { z } from "zod";
import { createRoomSchema } from "../schemas/room.schema";

export const registry = new OpenAPIRegistry();

registry.registerPath({
  method: "get",
  path: "/movies",
  tags: ["Movies"],
  summary: "Consultar todas las películas",
  description: "Devuelve el listado de películas registradas en el sistema.",
  responses: {
    200: {
      description: "Listado de películas obtenido correctamente",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/movies/{id}",
  tags: ["Movies"],
  summary: "Consultar una película por ID",
  description: "Busca una película mediante su identificador UUID.",
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: "Película encontrada",
    },
    400: {
      description: "El ID tiene un formato inválido",
    },
    404: {
      description: "Película no encontrada",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/movies/{id}",
  tags: ["Movies"],
  summary: "Actualizar una película",
  description: "Modifica el título o la duración de una película existente.",
  request: {
    params: z.object({
      id: z.uuid(),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: updateMovieSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Película actualizada correctamente",
    },
    400: {
      description: "Datos inválidos",
    },
    404: {
      description: "Película no encontrada",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/movies/{id}/deactivate",
  tags: ["Movies"],
  summary: "Desactivar una película",
  description:
    "Desactiva una película sin eliminar su registro de la base de datos.",
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: "Película desactivada correctamente",
    },
    400: {
      description: "El ID tiene un formato inválido",
    },
    404: {
      description: "Película no encontrada",
    },
    409: {
      description: "La película ya estaba desactivada",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/movies",
  tags: ["Movies"],
  summary: "Crear una película",
  description: "Registra una película nueva en el sistema.",
  request: {
    body: {
    required: true,
      content: {
        "application/json": {
          schema: createMovieSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Película creada correctamente",
    },
    400: {
      description: "Datos inválidos",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/rooms",
  tags: ["Rooms"],
  summary: "Crear una sala con sus asientos",
  description:
    "Crea una sala y genera sus asientos a partir de las filas indicadas. La operación se realiza dentro de una transacción.",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createRoomSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Sala y asientos creados correctamente",
    },
    400: {
      description: "Datos inválidos",
    },
    409: {
      description: "Ya existe una sala con ese nombre",
    },
    500: {
      description: "Error interno del servidor",
    },
  },
});

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Cinema API",
      version: "1.0.0",
      description: "API REST para gestionar películas, salas, funciones y reservaciones.",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  });
}