import {
    OpenAPIRegistry,
    OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { createMovieSchema, updateMovieSchema } from "../schemas/movie.schema";
import { z } from "zod";
import { createRoomSchema } from "../schemas/room.schema";
import { createShowtimeSchema } from "../schemas/showtime.schema";
import { createReservationSchema } from "../schemas/reservation.schema";
import { reservationResponseSchema, reservationDetailResponseSchema } from "../schemas/reservation-response.schema";
import { movieResponseSchema, moviesListResponseSchema } from "../schemas/movie-response.schema";
import { roomResponseSchema } from "../schemas/room-response.schema";
import { showtimeResponseSchema, showtimesListResponseSchema, showtimeSeatsResponseSchema, cancelShowtimeResponseSchema } from "../schemas/showtime-response.schema";
import { errorResponseSchema, validationErrorResponseSchema } from "../schemas/error-response.schema";

export const registry = new OpenAPIRegistry();
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: errorResponseSchema,
    },
  },
});

// 400 con detalle de validación de Zod: { message, errors: { formErrors, fieldErrors } }.
const validationErrorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: validationErrorResponseSchema,
    },
  },
});

// 400 que puede devolver solo { message } o { message, errors } según la causa.
const badRequestResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: z.union([validationErrorResponseSchema, errorResponseSchema]),
    },
  },
});

registry.registerPath({
    method: "get",
    path: "/movies",
    tags: ["Movies"],
    summary: "Consultar todas las películas",
    description: "Devuelve el listado de películas registradas en el sistema.",
    responses: {
        200: {
            description: "Listado de películas obtenido correctamente",
            content: {
                "application/json": {
                    schema: moviesListResponseSchema,
                },
            },
        },
        500: errorResponse("Error interno del servidor"),
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
            content: {
                "application/json": {
                    schema: movieResponseSchema,
                },
            },
        },
        400: errorResponse("El ID tiene un formato inválido"),
        
        404: errorResponse("Película no encontrada"),

        500: errorResponse("Error interno del servidor"),
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
            content: {
                "application/json": {
                    schema: movieResponseSchema,
                },
            },
        },

        400: badRequestResponse("Datos inválidos"),
        404: errorResponse("Película no encontrada"),
        500: errorResponse("Error interno del servidor"),
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
            content: {
                "application/json": {
                    schema: movieResponseSchema,
                },
            },
        },
        400: errorResponse("El ID tiene un formato inválido"),
        404: errorResponse("Película no encontrada"),
        409: errorResponse("La película ya estaba desactivada"),
        500: errorResponse("Error interno del servidor"),
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
            content: {
                "application/json": {
                    schema: movieResponseSchema,
                },
            },
        },
        400: validationErrorResponse("Datos inválidos"),
        500: errorResponse("Error interno del servidor"),
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
            content: {
                "application/json": {
                    schema: roomResponseSchema,
                },
            },
        },
        400: validationErrorResponse("Datos inválidos"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "get",
    path: "/rooms/{id}",
    tags: ["Rooms"],
    summary: "Consultar una sala y sus asientos",
    description:
        "Devuelve la información de una sala y todos sus asientos, ordenados por fila y número.",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Sala encontrada con sus asientos",
            content: {
                "application/json": {
                    schema: roomResponseSchema,
                },
            },
        },
        400: errorResponse("El ID tiene un formato inválido"),
        404: errorResponse("Sala no encontrada"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "post",
    path: "/showtimes",
    tags: ["Showtimes"],
    summary: "Programar una función de cine",
    description:
        "Programa una película activa en una sala. " +
        "El servidor calcula la hora de finalización incluyendo " +
        "20 minutos de limpieza. No se permiten horarios empalmados.",
    request: {
        body: {
            required: true,
            content: {
                "application/json": {
                    schema: createShowtimeSchema,
                },
            },
        },
    },
    responses: {
        201: {
            description: "Función creada correctamente",
            content: {
                "application/json": {
                    schema: showtimeResponseSchema,
                },
            },
        },
        400: badRequestResponse("Datos inválidos o fecha de inicio en el pasado"),
        404: errorResponse("Película o sala no encontrada"),
        409: errorResponse("Película inactiva o conflicto de horarios en la sala"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "get",
    path: "/showtimes",
    tags: ["Showtimes"],
    summary: "Consultar funciones de cine",
    description:
        "Devuelve todas las funciones registradas, incluyendo " +
        "la información de sus películas y salas, ordenadas por fecha de inicio.",
    responses: {
        200: {
            description: "Listado de funciones obtenido correctamente",
            content: {
                "application/json": {
                    schema: showtimesListResponseSchema,
                },
            },
        },
        500: errorResponse("Error interno del servidor"),
    },
});


registry.registerPath({
    method: "get",
    path: "/showtimes/{id}/seats",
    tags: ["Showtimes"],
    summary: "Consultar disponibilidad de asientos",
    description:
        "Devuelve los asientos de la sala correspondiente a una función " +
        "e indica si cada uno está disponible. " +
        "Un asiento ocupado por una reservación activa no está disponible.",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Disponibilidad de asientos obtenida correctamente",
            content: {
                "application/json": {
                    schema: showtimeSeatsResponseSchema,
                },
            },
        },
        400: errorResponse("El ID tiene un formato inválido"),
        404: errorResponse("Función no encontrada"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "patch",
    path: "/showtimes/{id}/cancel",
    tags: ["Showtimes"],
    summary: "Cancelar una función de cine",
    description:
        "Cancela una función programada y todas sus reservaciones " +
        "pendientes o confirmadas. Libera los asientos y registra " +
        "los cambios de estado en el historial. " +
        "La operación se ejecuta dentro de una transacción.",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Función cancelada correctamente",
            content: {
                "application/json": {
                    schema: cancelShowtimeResponseSchema,
                },
            },
        },
        400: errorResponse("El ID de la función es inválido"),
        404: errorResponse("Función no encontrada"),
        409: errorResponse("La función ya está cancelada"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "post",
    path: "/reservations",
    tags: ["Reservations"],
    summary: "Crear una reservación de asientos",
    description:
        "Permite reservar entre 1 y 6 asientos para una función. " +
        "Calcula el precio de cada asiento, aplica un incremento del 30% " +
        "a los asientos VIP y crea una reservación PENDING durante 10 minutos. " +
        "Impide reservar asientos que ya están ocupados.",
    request: {
        body: {
            required: true,
            content: {
                "application/json": {
                    schema: createReservationSchema,
                },
            },
        },
    },
    responses: {
        201: {
            description: "Reservación creada correctamente",
            content: {
                "application/json": {
                    schema: reservationResponseSchema,
                },
            },
        },
        400: badRequestResponse("Datos inválidos o asientos que no pertenecen a la sala"),
        404: errorResponse("Función no encontrada"),
        409: errorResponse("Función no disponible o asientos ya ocupados"),
        500: errorResponse("Error interno del servidor"),
    },
});


registry.registerPath({
    method: "get",
    path: "/reservations/{id}",
    tags: ["Reservations"],
    summary: "Consultar una reservación y su historial",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Reservación obtenida correctamente",
            content: {
                "application/json": {
                    schema: reservationDetailResponseSchema,
                },
            },
        },
        400: errorResponse("ID inválido"),
        404: errorResponse("Reservación no encontrada"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "patch",
    path: "/reservations/{id}/confirm",
    tags: ["Reservations"],
    summary: "Confirmar una reservación pendiente",
    description:
        "Confirma una reservación PENDING siempre que no haya vencido. " +
        "Los asientos permanecen ocupados.",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Reservación actualizada correctamente",
            content: {
                "application/json": {
                    schema: reservationResponseSchema,
                },
            },
        },
        400: errorResponse("ID inválido"),
        404: errorResponse("Reservación no encontrada"),
        409: errorResponse("La reservación ya expiró o no está pendiente"),
        500: errorResponse("Error interno del servidor"),
    },
});

registry.registerPath({
    method: "patch",
    path: "/reservations/{id}/cancel",
    tags: ["Reservations"],
    summary: "Cancelar una reservación",
    description:
        "Permite cancelar reservaciones pendientes vigentes o confirmadas. " +
        "Las reservaciones confirmadas solo pueden cancelarse al menos " +
        "dos horas antes de iniciar la función. " +
        "Libera los asientos y registra el cambio en el historial.",
    request: {
        params: z.object({
            id: z.uuid(),
        }),
    },
    responses: {
        200: {
            description: "Reservación actualizada correctamente",
            content: {
                "application/json": {
                    schema: reservationResponseSchema,
                },
            },
        },
        400: errorResponse("ID inválido"),
        404: errorResponse("Reservación no encontrada"),
        409: errorResponse("La reservación no puede cancelarse"),
        500: errorResponse("Error interno del servidor"),
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