// Ejemplos de la documentación OpenAPI.
//
// Todos describen el mismo escenario coherente:
// - Película "Dune: Parte Dos", 166 min.
// - "Sala 1": fila A con 3 asientos REGULAR y fila B con 2 asientos VIP.
// - Función el 2026-12-05 a las 20:00 UTC; termina a las 23:06 (166 min + 20 min de limpieza).
// - Precio base 10 000 centavos; VIP = 13 000 (base × 1,3).
// - Reservación de A1 (REGULAR) + B1 (VIP) = 23 000 centavos, creada a las 18:00 y vigente hasta las 18:10.
//
// Las pruebas de tests/unit/openapi.test.ts validan cada ejemplo contra su esquema Zod
// y las de integración comparan los ejemplos de error con las respuestas HTTP reales.

export const IDS = {
  movie: "6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d",
  room: "a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d",
  showtime: "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f",
  reservation: "e1f2a3b4-c5d6-4e7f-a8b9-c0d1e2f3a4b5",
  seats: {
    A1: "0a0a0a0a-0000-4000-8000-0000000000a1",
    A2: "0a0a0a0a-0000-4000-8000-0000000000a2",
    A3: "0a0a0a0a-0000-4000-8000-0000000000a3",
    B1: "0a0a0a0a-0000-4000-8000-0000000000b1",
    B2: "0a0a0a0a-0000-4000-8000-0000000000b2",
  },
  reservationSeats: {
    A1: "1b1b1b1b-0000-4000-8000-000000000001",
    B1: "1b1b1b1b-0000-4000-8000-000000000002",
  },
  history: {
    created: "2c2c2c2c-0000-4000-8000-000000000001",
    confirmed: "2c2c2c2c-0000-4000-8000-000000000002",
    cancelled: "2c2c2c2c-0000-4000-8000-000000000003",
  },
} as const;

const AT = {
  movieCreated: "2026-11-20T15:00:00.000Z",
  roomCreated: "2026-11-20T15:05:00.000Z",
  showtimeCreated: "2026-11-20T15:10:00.000Z",
  showtimeStarts: "2026-12-05T20:00:00.000Z",
  showtimeEnds: "2026-12-05T23:06:00.000Z",
  reservationCreated: "2026-12-01T18:00:00.000Z",
  reservationExpires: "2026-12-01T18:10:00.000Z",
  reservationConfirmed: "2026-12-01T18:04:00.000Z",
  reservationCancelled: "2026-12-02T09:00:00.000Z",
  showtimeCancelled: "2026-12-03T12:00:00.000Z",
} as const;

const BASE_PRICE = 10_000;
const VIP_PRICE = 13_000;

// ── Películas ──────────────────────────────────────────────────────────────

export const movieExample = {
  id: IDS.movie,
  title: "Dune: Parte Dos",
  duration_minutes: 166,
  is_active: true,
  created_at: AT.movieCreated,
  updated_at: AT.movieCreated,
};

export const createMovieRequestExample = { title: "Dune: Parte Dos", duration_minutes: 166 };
export const updateMovieRequestExample = { duration_minutes: 170 };
export const updatedMovieExample = { ...movieExample, duration_minutes: 170, updated_at: "2026-11-21T10:00:00.000Z" };
export const deactivatedMovieExample = { ...movieExample, is_active: false, updated_at: "2026-11-25T09:30:00.000Z" };

// ── Salas y asientos ───────────────────────────────────────────────────────

const seat = (label: keyof typeof IDS.seats, type: "REGULAR" | "VIP") => ({
  id: IDS.seats[label],
  room_id: IDS.room,
  row_label: label[0],
  seat_number: Number(label.slice(1)),
  type,
  created_at: AT.roomCreated,
  updated_at: AT.roomCreated,
});

export const createRoomRequestExample = {
  name: "Sala 1",
  rows: [
    { label: "A", seats: 3, type: "REGULAR" },
    { label: "B", seats: 2, type: "VIP" },
  ],
};

export const roomExample = {
  id: IDS.room,
  name: "Sala 1",
  created_at: AT.roomCreated,
  updated_at: AT.roomCreated,
  seats: [seat("A1", "REGULAR"), seat("A2", "REGULAR"), seat("A3", "REGULAR"), seat("B1", "VIP"), seat("B2", "VIP")],
};

const roomSummary = { id: IDS.room, name: "Sala 1", created_at: AT.roomCreated, updated_at: AT.roomCreated };

// ── Funciones ──────────────────────────────────────────────────────────────

const showtimeRecord = {
  id: IDS.showtime,
  movie_id: IDS.movie,
  room_id: IDS.room,
  starts_at: AT.showtimeStarts,
  ends_at: AT.showtimeEnds,
  base_price_cents: BASE_PRICE,
  status: "SCHEDULED" as const,
  created_at: AT.showtimeCreated,
  updated_at: AT.showtimeCreated,
};

export const createShowtimeRequestExample = {
  movie_id: IDS.movie,
  room_id: IDS.room,
  starts_at: AT.showtimeStarts,
  base_price_cents: BASE_PRICE,
};

export const createShowtimeWithOffsetRequestExample = {
  ...createShowtimeRequestExample,
  starts_at: "2026-12-05T14:00:00-06:00",
};

export const showtimeExample = { ...showtimeRecord, movie: movieExample, room: roomSummary };

export const showtimeSeatsExample = {
  showtime_id: IDS.showtime,
  room_id: IDS.room,
  seats: [
    { id: IDS.seats.A1, row_label: "A", seat_number: 1, type: "REGULAR", available: false },
    { id: IDS.seats.A2, row_label: "A", seat_number: 2, type: "REGULAR", available: true },
    { id: IDS.seats.A3, row_label: "A", seat_number: 3, type: "REGULAR", available: true },
    { id: IDS.seats.B1, row_label: "B", seat_number: 1, type: "VIP", available: false },
    { id: IDS.seats.B2, row_label: "B", seat_number: 2, type: "VIP", available: true },
  ],
};

export const cancelShowtimeExample = {
  showtime: { ...showtimeRecord, status: "CANCELLED" as const, updated_at: AT.showtimeCancelled },
  cancelled_reservations: 2,
};

// ── Reservaciones ──────────────────────────────────────────────────────────

export const createReservationRequestExample = {
  showtime_id: IDS.showtime,
  customer_name: "Ana Pérez",
  customer_email: "ana.perez@example.com",
  seat_ids: [IDS.seats.A1, IDS.seats.B1],
};

const reservationSeat = (label: "A1" | "B1", price: number, isActive: boolean, updatedAt: string) => ({
  id: IDS.reservationSeats[label],
  reservation_id: IDS.reservation,
  seat_id: IDS.seats[label],
  showtime_id: IDS.showtime,
  price_cents: price,
  is_active: isActive,
  created_at: AT.reservationCreated,
  updated_at: updatedAt,
});

const historyCreated = {
  id: IDS.history.created,
  reservation_id: IDS.reservation,
  from_status: null,
  to_status: "PENDING" as const,
  reason: "CREATED" as const,
  changed_at: AT.reservationCreated,
};

const historyConfirmed = {
  id: IDS.history.confirmed,
  reservation_id: IDS.reservation,
  from_status: "PENDING" as const,
  to_status: "CONFIRMED" as const,
  reason: "CONFIRMED_BY_CUSTOMER" as const,
  changed_at: AT.reservationConfirmed,
};

const historyCancelled = {
  id: IDS.history.cancelled,
  reservation_id: IDS.reservation,
  from_status: "CONFIRMED" as const,
  to_status: "CANCELLED" as const,
  reason: "CANCELLED_BY_CUSTOMER" as const,
  changed_at: AT.reservationCancelled,
};

const reservationBase = {
  id: IDS.reservation,
  showtime_id: IDS.showtime,
  customer_name: "Ana Pérez",
  customer_email: "ana.perez@example.com",
  total_cents: BASE_PRICE + VIP_PRICE,
  created_at: AT.reservationCreated,
};

export const pendingReservationExample = {
  ...reservationBase,
  status: "PENDING" as const,
  expires_at: AT.reservationExpires,
  updated_at: AT.reservationCreated,
  reservation_seats: [
    reservationSeat("A1", BASE_PRICE, true, AT.reservationCreated),
    reservationSeat("B1", VIP_PRICE, true, AT.reservationCreated),
  ],
  status_history: [historyCreated],
};

export const confirmedReservationExample = {
  ...reservationBase,
  status: "CONFIRMED" as const,
  expires_at: null,
  updated_at: AT.reservationConfirmed,
  reservation_seats: pendingReservationExample.reservation_seats,
  status_history: [historyCreated, historyConfirmed],
};

export const cancelledReservationExample = {
  ...reservationBase,
  status: "CANCELLED" as const,
  expires_at: null,
  updated_at: AT.reservationCancelled,
  reservation_seats: [
    reservationSeat("A1", BASE_PRICE, false, AT.reservationCancelled),
    reservationSeat("B1", VIP_PRICE, false, AT.reservationCancelled),
  ],
  status_history: [historyCreated, historyConfirmed, historyCancelled],
};

export const reservationDetailExample = {
  ...confirmedReservationExample,
  showtime: { ...showtimeRecord, movie: movieExample, room: roomSummary },
  reservation_seats: [
    { ...reservationSeat("A1", BASE_PRICE, true, AT.reservationCreated), seat: seat("A1", "REGULAR") },
    { ...reservationSeat("B1", VIP_PRICE, true, AT.reservationCreated), seat: seat("B1", "VIP") },
  ],
};

export const healthExample = { status: "ok", message: "Cinema Booking API is running" };

// ── Errores ────────────────────────────────────────────────────────────────
// Cada clave es un caso documentado; tests/integration/openapi-contract.test.ts
// provoca cada uno por HTTP y compara la respuesta real con este valor.

export const errorExamples = {
  invalidId: { summary: "ID con formato inválido", value: { message: "El ID debe ser un UUID válido" } },
  malformedJson: { summary: "JSON malformado", value: { message: "El cuerpo de la solicitud no es un JSON válido" } },
  payloadTooLarge: { summary: "Cuerpo mayor de 100 KB", value: { message: "El cuerpo de la solicitud es demasiado grande" } },
  internal: { summary: "Error inesperado (sin detalles internos)", value: { message: "Error interno del servidor" } },

  movieNotFound: { summary: "Película inexistente", value: { message: "Película no encontrada" } },
  movieAlreadyInactive: { summary: "La película ya estaba desactivada", value: { message: "La película ya está desactivada" } },

  roomNotFound: { summary: "Sala inexistente", value: { message: "Sala no encontrada" } },
  roomNameTaken: { summary: "Nombre de sala repetido", value: { message: "Ya existe una sala con ese nombre" } },

  showtimeInPast: { summary: "Fecha de inicio en el pasado", value: { message: "La función debe comenzar en una fecha futura" } },
  showtimeInactiveMovie: {
    summary: "Película desactivada",
    value: { message: "No se pueden programar funciones de películas inactivas" },
  },
  showtimeOverlap: {
    summary: "Horario empalmado en la sala (incluye 20 min de limpieza)",
    value: { message: "La sala ya tiene una función programada en ese horario" },
  },
  showtimeNotFound: { summary: "Función inexistente", value: { message: "Función no encontrada" } },
  showtimeAlreadyCancelled: { summary: "La función ya estaba cancelada", value: { message: "La función ya está cancelada" } },

  reservationShowtimeUnavailable: {
    summary: "Función cancelada o ya iniciada",
    value: { message: "La función ya comenzó o no está disponible" },
  },
  seatsNotInRoom: {
    summary: "Algún asiento es de otra sala",
    value: { message: "Uno o más asientos no pertenecen a la sala de esta función" },
  },
  seatsTaken: {
    summary: "Algún asiento ya está ocupado (también ante peticiones simultáneas)",
    value: { message: "Uno o más asientos ya están reservados para esta función" },
  },
  reservationNotFound: { summary: "Reservación inexistente", value: { message: "Reservación no encontrada" } },
  confirmShowtimeUnavailable: {
    summary: "Función cancelada o ya iniciada",
    value: { message: "La función ya comenzó o fue cancelada" },
  },
  confirmNotPending: {
    summary: "No está PENDING o ya venció",
    value: { message: "La reservación no está pendiente o ya expiró" },
  },
  cancelFinalState: {
    summary: "Ya está CANCELLED o EXPIRED",
    value: { message: "Esta reservación ya no puede cancelarse" },
  },
  cancelOutsideWindow: {
    summary: "CONFIRMED a menos de 2 h del inicio, o cambió de estado durante la operación",
    value: { message: "La reservación cambió de estado, expiró o está fuera del plazo de cancelación" },
  },
} as const;

export type ErrorExampleKey = keyof typeof errorExamples;

// Errores de validación reales (salida de ZodError.flatten()).
export const validationExamples = {
  movieMissingFields: {
    summary: "Faltan campos obligatorios",
    value: {
      message: "Datos inválidos",
      errors: {
        formErrors: [],
        fieldErrors: {
          title: ["Invalid input: expected string, received undefined"],
          duration_minutes: ["Invalid input: expected number, received undefined"],
        },
      },
    },
  },
  movieUnknownField: {
    summary: "Campo no permitido",
    value: { message: "Datos inválidos", errors: { formErrors: ['Unrecognized key: "is_active"'], fieldErrors: {} } },
  },
  movieEmptyPatch: {
    summary: "Cuerpo sin campos",
    value: {
      message: "Datos inválidos",
      errors: { formErrors: ["Debes proporcionar al menos un campo para actualizar"], fieldErrors: {} },
    },
  },
  roomDuplicateRows: {
    summary: "Etiquetas de fila repetidas",
    value: {
      message: "Datos inválidos",
      errors: { formErrors: [], fieldErrors: { rows: ["No se pueden repetir las etiquetas de las filas"] } },
    },
  },
  showtimeInvalidFields: {
    summary: "Fecha sin zona horaria y precio no positivo",
    value: {
      message: "Datos inválidos",
      errors: {
        formErrors: [],
        fieldErrors: { starts_at: ["Invalid ISO datetime"], base_price_cents: ["El precio debe ser mayor que cero"] },
      },
    },
  },
  reservationInvalidFields: {
    summary: "Correo inválido y ningún asiento",
    value: {
      message: "Datos inválidos",
      errors: {
        formErrors: [],
        fieldErrors: { customer_email: ["Invalid email address"], seat_ids: ["Debes seleccionar al menos un asiento"] },
      },
    },
  },
  reservationTooManySeatsAndTotal: {
    summary: "Más de 6 asientos y total enviado por el cliente",
    value: {
      message: "Datos inválidos",
      errors: {
        formErrors: ['Unrecognized key: "total_cents"'],
        fieldErrors: { seat_ids: ["No puedes reservar más de seis asientos"] },
      },
    },
  },
} as const;

export type ValidationExampleKey = keyof typeof validationExamples;
