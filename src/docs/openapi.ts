import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { createMovieSchema } from "../schemas/movie.schema";

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