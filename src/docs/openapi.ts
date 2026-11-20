import {
    OpenAPIRegistry,
    OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { createMovieSchema, updateMovieSchema } from "../schemas/movie.schema";
import { createRoomSchema } from "../schemas/room.schema";
import { createShowtimeSchema } from "../schemas/showtime.schema";
import { createReservationSchema } from "../schemas/reservation.schema";
import { reservationResponseSchema, reservationDetailResponseSchema } from "../schemas/reservation-response.schema";
import { movieResponseSchema, moviesListResponseSchema } from "../schemas/movie-response.schema";
import { roomResponseSchema } from "../schemas/room-response.schema";
import {
    showtimeResponseSchema,
    showtimesListResponseSchema,
    showtimeSeatsResponseSchema,
    cancelShowtimeResponseSchema,
} from "../schemas/showtime-response.schema";
import { errorResponseSchema, validationErrorResponseSchema } from "../schemas/error-response.schema";
import { healthResponseSchema } from "../schemas/health-response.schema";
import {
    IDS,
    type ErrorExampleKey,
    type ValidationExampleKey,
    errorExamples,
    validationExamples,
    movieExample,
    createMovieRequestExample,
    updateMovieRequestExample,
    updatedMovieExample,
    deactivatedMovieExample,
    createRoomRequestExample,
    roomExample,
    createShowtimeRequestExample,
    createShowtimeWithOffsetRequestExample,
    showtimeExample,
    showtimeSeatsExample,
    cancelShowtimeExample,
    createReservationRequestExample,
    pendingReservationExample,
    confirmedReservationExample,
    cancelledReservationExample,
    reservationDetailExample,
    healthExample,
} from "./examples";

export const registry = new OpenAPIRegistry();

// ── Ayudantes ───────────────────────────────────────────────────────────────

type NamedExamples = Record<string, { summary: string; value: unknown }>;

const json = (schema: z.ZodType, examples?: NamedExamples) => ({
    "application/json": { schema, ...(examples ? { examples } : {}) },
});

const success = (description: string, schema: z.ZodType, examples: NamedExamples) => ({
    description,
    content: json(schema, examples),
});

const pickErrors = (keys: readonly ErrorExampleKey[]): NamedExamples =>
    Object.fromEntries(keys.map((key) => [key, errorExamples[key]]));

const pickValidation = (keys: readonly ValidationExampleKey[]): NamedExamples =>
    Object.fromEntries(keys.map((key) => [key, validationExamples[key]]));

// Error con formato { message }.
const errorResponse = (description: string, keys: readonly ErrorExampleKey[]) => ({
    description,
    content: json(errorResponseSchema, pickErrors(keys)),
});

// 400 que puede ser de validación ({ message, errors }) o un error simple ({ message }).
const badRequest = (
    description: string,
    validationKeys: readonly ValidationExampleKey[],
    errorKeys: readonly ErrorExampleKey[]
) => ({
    description,
    content: json(
        errorKeys.length > 0
            ? z.union([validationErrorResponseSchema, errorResponseSchema])
            : validationErrorResponseSchema,
        { ...pickValidation(validationKeys), ...pickErrors(errorKeys) }
    ),
});

const invalidIdResponse = errorResponse("El ID de la ruta no es un UUID válido.", ["invalidId"]);
const internalErrorResponse = errorResponse(
    "Error inesperado. La respuesta es siempre genérica; el detalle solo queda en el registro del servidor.",
    ["internal"]
);
const payloadTooLargeResponse = errorResponse(
    "El cuerpo supera el límite de 100 KB de express.json().",
    ["payloadTooLarge"]
);

const idParams = (description: string, example: string) => ({
    params: z.object({ id: z.uuid().meta({ description, example }) }),
});

const jsonBody = (schema: z.ZodType, examples: NamedExamples) => ({
    required: true,
    content: json(schema, examples),
});

// ── Salud ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/health",
    operationId: "getHealth",
    tags: ["Health"],
    summary: "Comprobar que la API está en ejecución",
    description: "Responde siempre 200 mientras el proceso esté activo. No consulta la base de datos.",
    responses: {
        200: success("La API está en ejecución.", healthResponseSchema, {
            ok: { summary: "Servicio activo", value: healthExample },
        }),
    },
});

// ── Películas ───────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/movies",
    operationId: "listMovies",
    tags: ["Movies"],
    summary: "Consultar todas las películas",
    description: "Devuelve todas las películas registradas, activas e inactivas.",
    responses: {
        200: success("Listado de películas.", moviesListResponseSchema, {
            list: { summary: "Una película", value: [movieExample] },
        }),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "post",
    path: "/movies",
    operationId: "createMovie",
    tags: ["Movies"],
    summary: "Crear una película",
    description:
        "Registra una película activa. La duración (entero > 0) se usa para calcular cuánto ocupa la sala " +
        "cada función: duración + 20 minutos de limpieza.",
    request: {
        body: jsonBody(createMovieSchema, {
            basic: { summary: "Película de 166 minutos", value: createMovieRequestExample },
        }),
    },
    responses: {
        201: success("Película creada.", movieResponseSchema, {
            created: { summary: "Película activa", value: movieExample },
        }),
        400: badRequest(
            "Datos inválidos, campos no permitidos o JSON malformado.",
            ["movieMissingFields", "movieUnknownField"],
            ["malformedJson"]
        ),
        413: payloadTooLargeResponse,
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "get",
    path: "/movies/{id}",
    operationId: "getMovie",
    tags: ["Movies"],
    summary: "Consultar una película por ID",
    description: "Devuelve una película, esté activa o desactivada.",
    request: idParams("UUID de la película.", IDS.movie),
    responses: {
        200: success("Película encontrada.", movieResponseSchema, {
            found: { summary: "Película activa", value: movieExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una película con ese ID.", ["movieNotFound"]),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "patch",
    path: "/movies/{id}",
    operationId: "updateMovie",
    tags: ["Movies"],
    summary: "Actualizar una película",
    description:
        "Modifica el título y/o la duración. Debe enviarse al menos un campo. " +
        "Cambiar la duración no recalcula el fin (ends_at) de las funciones ya programadas.",
    request: {
        ...idParams("UUID de la película.", IDS.movie),
        body: jsonBody(updateMovieSchema, {
            duration: { summary: "Cambiar solo la duración", value: updateMovieRequestExample },
        }),
    },
    responses: {
        200: success("Película actualizada.", movieResponseSchema, {
            updated: { summary: "Duración actualizada", value: updatedMovieExample },
        }),
        400: badRequest(
            "ID inválido, cuerpo vacío, campos no permitidos o JSON malformado.",
            ["movieEmptyPatch", "movieUnknownField"],
            ["invalidId", "malformedJson"]
        ),
        404: errorResponse("No existe una película con ese ID.", ["movieNotFound"]),
        413: payloadTooLargeResponse,
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "patch",
    path: "/movies/{id}/deactivate",
    operationId: "deactivateMovie",
    tags: ["Movies"],
    summary: "Desactivar una película",
    description:
        "Marca la película como inactiva sin borrarla. Una película inactiva no admite funciones nuevas. " +
        "**Limitación actual:** no cancela ni modifica sus funciones ya programadas, que siguen aceptando " +
        "reservaciones. La API no expone endpoints DELETE; además, la base de datos impide borrar películas " +
        "o salas con funciones asociadas (ON DELETE RESTRICT).",
    request: idParams("UUID de la película.", IDS.movie),
    responses: {
        200: success("Película desactivada.", movieResponseSchema, {
            deactivated: { summary: "is_active = false", value: deactivatedMovieExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una película con ese ID.", ["movieNotFound"]),
        409: errorResponse("La película ya estaba desactivada.", ["movieAlreadyInactive"]),
        500: internalErrorResponse,
    },
});

// ── Salas ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "post",
    path: "/rooms",
    operationId: "createRoom",
    tags: ["Rooms"],
    summary: "Crear una sala con sus asientos",
    description:
        "Crea la sala y genera sus asientos en la misma transacción: por cada fila, asientos numerados " +
        "del 1 al valor de `seats`, todos del tipo indicado. Límites: 1 a 30 filas, 1 a 50 asientos por " +
        "fila, etiquetas únicas de hasta 5 caracteres. El nombre de la sala es único en la base de datos " +
        "(la comparación distingue mayúsculas y minúsculas).",
    request: {
        body: jsonBody(createRoomSchema, {
            withVip: { summary: "Fila A REGULAR y fila B VIP", value: createRoomRequestExample },
        }),
    },
    responses: {
        201: success("Sala y asientos creados.", roomResponseSchema, {
            created: { summary: "Sala con 5 asientos", value: roomExample },
        }),
        400: badRequest(
            "Datos inválidos (filas, límites, tipos) o JSON malformado.",
            ["roomDuplicateRows"],
            ["malformedJson"]
        ),
        409: errorResponse("Ya existe una sala con ese nombre (no se crea nada).", ["roomNameTaken"]),
        413: payloadTooLargeResponse,
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "get",
    path: "/rooms/{id}",
    operationId: "getRoom",
    tags: ["Rooms"],
    summary: "Consultar una sala y sus asientos",
    description: "Devuelve la sala y todos sus asientos ordenados por fila y número. Los IDs de asiento se usan al reservar.",
    request: idParams("UUID de la sala.", IDS.room),
    responses: {
        200: success("Sala encontrada.", roomResponseSchema, {
            found: { summary: "Sala con 5 asientos", value: roomExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una sala con ese ID.", ["roomNotFound"]),
        500: internalErrorResponse,
    },
});

// ── Funciones ───────────────────────────────────────────────────────────────

registry.registerPath({
    method: "post",
    path: "/showtimes",
    operationId: "createShowtime",
    tags: ["Showtimes"],
    summary: "Programar una función",
    description:
        "Programa una película **activa** en una sala, en una fecha **futura**. El servidor calcula " +
        "`ends_at = starts_at + duración + 20 min de limpieza`.\n\n" +
        "**Solapamientos:** una restricción de exclusión de PostgreSQL impide dos funciones SCHEDULED " +
        "cuyos intervalos [starts_at, ends_at) se crucen en la misma sala, también ante peticiones " +
        "simultáneas (la segunda recibe 409). Una función puede empezar exactamente en el ends_at de otra; " +
        "las funciones canceladas liberan su horario.",
    request: {
        body: jsonBody(createShowtimeSchema, {
            utc: { summary: "Inicio en UTC", value: createShowtimeRequestExample },
            withOffset: { summary: "Inicio con desplazamiento horario (−06:00)", value: createShowtimeWithOffsetRequestExample },
        }),
    },
    responses: {
        201: success("Función creada.", showtimeResponseSchema, {
            created: { summary: "Termina 186 min después (166 + 20)", value: showtimeExample },
        }),
        400: badRequest(
            "Datos inválidos, fecha en el pasado o JSON malformado.",
            ["showtimeInvalidFields"],
            ["showtimeInPast", "malformedJson"]
        ),
        404: errorResponse("La película o la sala no existen.", ["movieNotFound", "roomNotFound"]),
        409: errorResponse("Película inactiva u horario empalmado en la sala.", ["showtimeInactiveMovie", "showtimeOverlap"]),
        413: payloadTooLargeResponse,
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "get",
    path: "/showtimes",
    operationId: "listShowtimes",
    tags: ["Showtimes"],
    summary: "Consultar funciones",
    description:
        "Devuelve todas las funciones (incluidas las canceladas y las pasadas) con su película y su sala, " +
        "ordenadas por fecha de inicio.",
    responses: {
        200: success("Listado de funciones.", showtimesListResponseSchema, {
            list: { summary: "Una función programada", value: [showtimeExample] },
        }),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "get",
    path: "/showtimes/{id}/seats",
    operationId: "getShowtimeSeats",
    tags: ["Showtimes"],
    summary: "Consultar disponibilidad de asientos",
    description:
        "Devuelve los asientos de la sala de la función con `available`. Antes de calcularla, la API " +
        "marca como EXPIRED las reservaciones PENDING vencidas, lo que libera sus asientos. Si la función " +
        "está cancelada o ya comenzó, ningún asiento aparece disponible.",
    request: idParams("UUID de la función.", IDS.showtime),
    responses: {
        200: success("Disponibilidad calculada.", showtimeSeatsResponseSchema, {
            partial: { summary: "A1 y B1 ocupados", value: showtimeSeatsExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una función con ese ID.", ["showtimeNotFound"]),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "patch",
    path: "/showtimes/{id}/cancel",
    operationId: "cancelShowtime",
    tags: ["Showtimes"],
    summary: "Cancelar una función",
    description:
        "Cancela la función y, en la misma transacción, sus reservaciones CONFIRMED y PENDING vigentes: " +
        "pasan a CANCELLED con motivo SHOWTIME_CANCELLED y sus asientos se liberan. Las PENDING ya vencidas " +
        "se dejan a la expiración (PAYMENT_TIMEOUT).\n\n" +
        "**Concurrencia:** la cancelación se serializa con la creación y la confirmación de reservaciones " +
        "mediante bloqueos de fila; una reservación simultánea o queda incluida en la cascada o recibe 409.\n\n" +
        "**Comportamiento actual:** no hay restricción temporal; se puede cancelar una función que ya comenzó.",
    request: idParams("UUID de la función.", IDS.showtime),
    responses: {
        200: success("Función cancelada.", cancelShowtimeResponseSchema, {
            cancelled: { summary: "Dos reservaciones canceladas en cascada", value: cancelShowtimeExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una función con ese ID.", ["showtimeNotFound"]),
        409: errorResponse("La función ya estaba cancelada.", ["showtimeAlreadyCancelled"]),
        500: internalErrorResponse,
    },
});

// ── Reservaciones ───────────────────────────────────────────────────────────

registry.registerPath({
    method: "post",
    path: "/reservations",
    operationId: "createReservation",
    tags: ["Reservations"],
    summary: "Reservar asientos",
    description:
        "Reserva entre 1 y 6 asientos distintos de la sala de una función SCHEDULED que no ha comenzado. " +
        "Crea una reservación **PENDING** que vence a los **10 minutos** si no se confirma.\n\n" +
        "**Precios (calculados en el servidor):** REGULAR = precio base; VIP = base × 1,3 redondeado al " +
        "centavo (0,5 hacia arriba). total_cents es la suma. El cliente no puede enviar precios ni total.\n\n" +
        "**Concurrencia:** un índice único parcial sobre (función, asiento) para reservaciones activas " +
        "impide que un asiento se reserve dos veces; ante peticiones simultáneas solo una obtiene 201 y las " +
        "demás 409, sin reservas parciales. La función se revalida con bloqueo dentro de la transacción.\n\n" +
        "Antes de reservar, la API marca como EXPIRED las PENDING vencidas.",
    request: {
        body: jsonBody(createReservationSchema, {
            regularAndVip: { summary: "A1 (REGULAR) + B1 (VIP)", value: createReservationRequestExample },
        }),
    },
    responses: {
        201: success("Reservación PENDING creada.", reservationResponseSchema, {
            pending: { summary: "10 000 + 13 000 = 23 000 centavos", value: pendingReservationExample },
        }),
        400: badRequest(
            "Datos inválidos, campos no permitidos, asientos de otra sala o JSON malformado.",
            ["reservationInvalidFields", "reservationTooManySeatsAndTotal"],
            ["seatsNotInRoom", "malformedJson"]
        ),
        404: errorResponse("No existe la función.", ["showtimeNotFound"]),
        409: errorResponse("Función cancelada o ya iniciada, o algún asiento ocupado.", [
            "reservationShowtimeUnavailable",
            "seatsTaken",
        ]),
        413: payloadTooLargeResponse,
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "get",
    path: "/reservations/{id}",
    operationId: "getReservation",
    tags: ["Reservations"],
    summary: "Consultar una reservación y su historial",
    description:
        "Devuelve la reservación con su función, película, sala, asientos y el historial completo de " +
        "estados ordenado por fecha. Antes de consultar, la API marca como EXPIRED las PENDING vencidas.",
    request: idParams("UUID de la reservación.", IDS.reservation),
    responses: {
        200: success("Reservación encontrada.", reservationDetailResponseSchema, {
            confirmed: { summary: "Reservación confirmada", value: reservationDetailExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una reservación con ese ID.", ["reservationNotFound"]),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "patch",
    path: "/reservations/{id}/confirm",
    operationId: "confirmReservation",
    tags: ["Reservations"],
    summary: "Confirmar una reservación PENDING",
    description:
        "PENDING → CONFIRMED. Requiere que la reservación no haya vencido y que su función siga SCHEDULED " +
        "y no haya comenzado. expires_at pasa a null y los asientos siguen ocupados. Antes de confirmar, la " +
        "API marca como EXPIRED las PENDING vencidas. Ante una cancelación simultánea de la función, una de " +
        "las dos operaciones espera a la otra: o la confirmación ocurre primero y la cancelación la incluye, " +
        "o la confirmación recibe 409.",
    request: idParams("UUID de la reservación.", IDS.reservation),
    responses: {
        200: success("Reservación confirmada.", reservationResponseSchema, {
            confirmed: { summary: "CONFIRMED, sin vencimiento", value: confirmedReservationExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una reservación con ese ID.", ["reservationNotFound"]),
        409: errorResponse("La función ya comenzó o fue cancelada, o la reservación no está PENDING o venció.", [
            "confirmShowtimeUnavailable",
            "confirmNotPending",
        ]),
        500: internalErrorResponse,
    },
});

registry.registerPath({
    method: "patch",
    path: "/reservations/{id}/cancel",
    operationId: "cancelReservation",
    tags: ["Reservations"],
    summary: "Cancelar una reservación",
    description:
        "PENDING vigente o CONFIRMED → CANCELLED (motivo CANCELLED_BY_CUSTOMER). Libera los asientos. " +
        "Una CONFIRMED solo puede cancelarse **hasta 2 horas antes** del inicio de la función (inclusive). " +
        "Una PENDING vigente puede cancelarse en cualquier momento antes de vencer. CANCELLED y EXPIRED son " +
        "estados finales. Antes de cancelar, la API marca como EXPIRED las PENDING vencidas.",
    request: idParams("UUID de la reservación.", IDS.reservation),
    responses: {
        200: success("Reservación cancelada.", reservationResponseSchema, {
            cancelled: { summary: "CONFIRMED cancelada con más de 2 h de anticipación", value: cancelledReservationExample },
        }),
        400: invalidIdResponse,
        404: errorResponse("No existe una reservación con ese ID.", ["reservationNotFound"]),
        409: errorResponse("Estado final, fuera del plazo de 2 h o cambió de estado durante la operación.", [
            "cancelFinalState",
            "cancelOutsideWindow",
        ]),
        500: internalErrorResponse,
    },
});

// ── Documento ───────────────────────────────────────────────────────────────

const API_DESCRIPTION = `
API REST para gestionar películas, salas, funciones y reservaciones de un cine.

## Cómo probarla
1. \`POST /movies\` → crear una película.
2. \`POST /rooms\` → crear una sala con filas REGULAR y VIP (devuelve los IDs de los asientos).
3. \`POST /showtimes\` → programar la película en la sala, en una fecha futura.
4. \`GET /showtimes/{id}/seats\` → ver la disponibilidad.
5. \`POST /reservations\` → reservar de 1 a 6 asientos (queda PENDING 10 minutos).
6. \`PATCH /reservations/{id}/confirm\` o \`/cancel\`, y \`GET /reservations/{id}\` para ver el historial.

## Convenciones
- **Montos:** enteros en **centavos** (\`10000\` = 100.00).
- **Fechas:** ISO 8601. Al enviar se exige zona horaria (\`Z\` o \`±hh:mm\`); las respuestas siempre están en UTC.
- **IDs:** UUID. Un ID con formato inválido produce 400.
- **Entradas estrictas:** los cuerpos no admiten campos adicionales (400).

## Reglas de negocio
- **Funciones:** solo películas activas y fechas futuras. La sala queda ocupada duración + **20 minutos de limpieza**; no se permiten solapamientos en una sala.
- **Reservaciones:** de **1 a 6** asientos distintos de la misma función, que debe estar programada y no haber comenzado.
- **Precio:** calculado en el servidor. VIP = base × 1,3 redondeado al centavo.
- **Estados:** PENDING → CONFIRMED | CANCELLED | EXPIRED; CONFIRMED → CANCELLED. CANCELLED y EXPIRED son finales. Cada cambio queda en \`status_history\`.
- **Expiración:** una PENDING vence **10 minutos** después de crearse. La API la marca como EXPIRED (y libera sus asientos) al inicio de \`GET /showtimes/{id}/seats\`, \`POST /reservations\`, \`GET /reservations/{id}\`, confirmar y cancelar reservaciones, y además cada 30 segundos mediante un temporizador del servidor. Una PENDING vencida nunca puede confirmarse, aunque todavía no se haya procesado.
- **Cancelación:** una CONFIRMED se puede cancelar hasta **2 horas antes** del inicio. Cancelar una función cancela en cascada sus reservaciones activas.

## Concurrencia
- Un índice único parcial impide reservar dos veces el mismo asiento para la misma función, también con peticiones simultáneas (una obtiene 201, las demás 409).
- Una restricción de exclusión impide funciones solapadas en una sala.
- La creación y la confirmación de reservaciones bloquean la función (FOR SHARE) y la cancelación de la función bloquea sus reservaciones (FOR UPDATE), de modo que estas operaciones nunca dejan reservaciones activas en una función cancelada.

## Errores
- Formato general: \`{ "message": string }\` (esquema \`Error\`). Validación: \`{ "message": "Datos inválidos", "errors": { formErrors, fieldErrors } }\` (esquema \`ValidationError\`).
- 400 datos inválidos o JSON malformado · 404 recurso o ruta inexistente · 409 conflicto con el estado actual · 413 cuerpo mayor de 100 KB · 500 error inesperado, sin detalles internos.

## Alcance
- La API no tiene autenticación.
- No existen endpoints DELETE: las películas se desactivan y la base de datos impide borrar películas o salas con funciones.
`.trim();

export function generateOpenAPIDocument() {
    const generator = new OpenApiGeneratorV3(registry.definitions);

    return generator.generateDocument({
        openapi: "3.0.0",
        info: {
            title: "Cinema API",
            version: "1.0.0",
            description: API_DESCRIPTION,
        },
        servers: [
            {
                url: "http://localhost:3000",
                description: "Servidor local (npm run dev o npm start)",
            },
        ],
        tags: [
            { name: "Health", description: "Estado del servicio." },
            { name: "Movies", description: "Catálogo de películas. Se desactivan en lugar de borrarse." },
            { name: "Rooms", description: "Salas y generación de asientos REGULAR y VIP." },
            { name: "Showtimes", description: "Funciones: programación, disponibilidad y cancelación." },
            { name: "Reservations", description: "Reservaciones: creación, confirmación, cancelación e historial." },
        ],
    });
}
