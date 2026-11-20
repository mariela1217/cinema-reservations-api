import express from "express";
import { Prisma } from "@prisma/client";
import {prisma} from "./lib/prisma";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { createMovieSchema, updateMovieSchema} from "./schemas/movie.schema";
import { setupSwagger } from "./docs/swagger";
import { z } from "zod";
import { createRoomSchema } from "./schemas/room.schema";
import { createShowtimeSchema } from "./schemas/showtime.schema";
import { createReservationSchema } from "./schemas/reservation.schema";
import { expirePendingReservations } from "./services/reservation-expiration.service";
import { isShowtimeOpen, lockShowtimeForShare } from "./services/showtime-lock";

const app = express();

app.disable("x-powered-by");


app.use(express.json());
setupSwagger(app);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Cinema Booking API is running"
  });
});

app.get("/movies", async (_req, res) => {
  try {
    const movies = await prisma.movie.findMany();

    res.status(200).json(movies);
  } catch (error) {
    console.error("Error al consultar películas:", error);

    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.get("/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const validation = z.uuid().safeParse(id);

    if (!validation.success) {
      return res.status(400).json({
        message: "El ID debe ser un UUID válido"
      });
    }

    const movie = await prisma.movie.findUnique({
      where: { id: validation.data }
    });

    if (!movie) {
      return res.status(404).json({
        message: "Película no encontrada"
      });
    }

    return res.status(200).json(movie);
  } catch (error) {
    console.error("Error al consultar película:", error);

    return res.status(500).json({
      message: "Error interno del servidor"
    });
  }
});

app.post("/movies", async (req, res) => {
  try {
    const validation = createMovieSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: validation.error.flatten()
      });
    }

    const movie = await prisma.movie.create({
      data: validation.data
    });

    return res.status(201).json(movie);
  } catch (error) {
    console.error("Error al crear película:", error);

    return res.status(500).json({
      message: "Error interno del servidor"
    });
  }
});

app.patch("/movies/:id", async (req, res) => {
  try {
    const idValidation = z.uuid().safeParse(req.params.id);

    if (!idValidation.success) {
      return res.status(400).json({
        message: "El ID debe ser un UUID válido",
      });
    }

    const bodyValidation = updateMovieSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: bodyValidation.error.flatten(),
      });
    }

    const existingMovie = await prisma.movie.findUnique({
      where: { id: idValidation.data },
    });

    if (!existingMovie) {
      return res.status(404).json({
        message: "Película no encontrada",
      });
    }

    const updatedMovie = await prisma.movie.update({
      where: { id: idValidation.data },
      data: bodyValidation.data,
    });

    return res.status(200).json(updatedMovie);
  } catch (error) {
    console.error("Error al actualizar película:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.patch("/movies/:id/deactivate", async (req, res) => {
  try {
    const idValidation = z.uuid().safeParse(req.params.id);

    if (!idValidation.success) {
      return res.status(400).json({
        message: "El ID debe ser un UUID válido",
      });
    }

    const movie = await prisma.movie.findUnique({
      where: { id: idValidation.data },
    });

    if (!movie) {
      return res.status(404).json({
        message: "Película no encontrada",
      });
    }

    if (!movie.is_active) {
      return res.status(409).json({
        message: "La película ya está desactivada",
      });
    }

    const deactivatedMovie = await prisma.movie.update({
      where: { id: idValidation.data },
      data: { is_active: false },
    });

    return res.status(200).json(deactivatedMovie);
  } catch (error) {
    console.error("Error al desactivar película:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.post("/rooms", async (req, res) => {
  try {
    const validation = createRoomSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: validation.error.flatten(),
      });
    }

    const { name, rows } = validation.data;

    const room = await prisma.$transaction(async (tx) => {
      const newRoom = await tx.room.create({
        data: { name },
      });

      const seats = rows.flatMap((row) =>
        Array.from({ length: row.seats }, (_, index) => ({
          room_id: newRoom.id,
          row_label: row.label,
          seat_number: index + 1,
          type: row.type,
        }))
      );

      await tx.seat.createMany({
        data: seats,
      });

      return tx.room.findUniqueOrThrow({
        where: { id: newRoom.id },
        include: {
          seats: {
            orderBy: [
              { row_label: "asc" },
              { seat_number: "asc" },
            ],
          },
        },
      });
    });

    return res.status(201).json(room);
  } catch (error) {
    console.error("Error al crear sala:", error);

    // El índice único rooms_name_key impide nombres de sala repetidos.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("name")
    ) {
      return res.status(409).json({
        message: "Ya existe una sala con ese nombre",
      });
    }

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.get("/rooms/:id", async (req, res) => {
  try {
    const idValidation = z.uuid().safeParse(req.params.id);

    if (!idValidation.success) {
      return res.status(400).json({
        message: "El ID debe ser un UUID válido",
      });
    }

    const room = await prisma.room.findUnique({
      where: {
        id: idValidation.data,
      },
      include: {
        seats: {
          orderBy: [
            { row_label: "asc" },
            { seat_number: "asc" },
          ],
        },
      },
    });

    if (!room) {
      return res.status(404).json({
        message: "Sala no encontrada",
      });
    }

    return res.status(200).json(room);
  } catch (error) {
    console.error("Error al consultar sala:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.post("/showtimes", async (req, res) => {
  try {
    const validation = createShowtimeSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        message: "Datos inválidos",
        errors: validation.error.flatten(),
      });
    }

    const { movie_id, room_id, starts_at, base_price_cents } = validation.data;

    const startDate = new Date(starts_at);

    if (startDate <= new Date()) {
      return res.status(400).json({
        message: "La función debe comenzar en una fecha futura",
      });
    }

    const movie = await prisma.movie.findUnique({
      where: { id: movie_id },
    });

    if (!movie) {
      return res.status(404).json({
        message: "Película no encontrada",
      });
    }

    if (!movie.is_active) {
      return res.status(409).json({
        message: "No se pueden programar funciones de películas inactivas",
      });
    }

    const room = await prisma.room.findUnique({
      where: { id: room_id },
    });

    if (!room) {
      return res.status(404).json({
        message: "Sala no encontrada",
      });
    }

    // La sala estará ocupada durante la película y 20 minutos de limpieza.
    const totalMinutes = movie.duration_minutes + 20;
    const endDate = new Date(startDate.getTime() + totalMinutes * 60_000);

    const showtime = await prisma.showtime.create({
      data: {
        movie_id,
        room_id,
        starts_at: startDate,
        ends_at: endDate,
        base_price_cents,
      },
      include: {
        movie: true,
        room: true,
      },
    });

    return res.status(201).json(showtime);
  } catch (error) {
    console.error("Error al crear función:", error);

    // PostgreSQL: restricción de exclusión de horarios.
    const databaseError = error as {
        code?: string;
        meta?: { code?: string };
        message?: string;
    };

    const isOverlapError =
    databaseError.code === "P2004" ||
    databaseError.meta?.code === "23P01" ||
  (
    databaseError.message?.includes('23P01') &&
    databaseError.message?.includes('showtimes_no_overlap')
  );
  
  if (isOverlapError) {
    return res.status(409).json({
        message: "La sala ya tiene una función programada en ese horario",
    });
}

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.get("/showtimes", async (_req, res) => {
  try {
    const showtimes = await prisma.showtime.findMany({
      include: {
        movie: true,
        room: true,
      },
      orderBy: {
        starts_at: "asc",
      },
    });

    return res.status(200).json(showtimes);
  } catch (error) {
    console.error("Error al consultar funciones:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});


app.get("/showtimes/:id/seats", async (req, res) => {
  try {
    await expirePendingReservations();
    const idValidation = z.uuid().safeParse(req.params.id);

    if (!idValidation.success) {
      return res.status(400).json({
        message: "El ID debe ser un UUID válido",
      });
    }

    const showtime = await prisma.showtime.findUnique({
      where: { id: idValidation.data },
      include: {
        room: {
          include: {
            seats: {
              orderBy: [
                { row_label: "asc" },
                { seat_number: "asc" },
              ],
            },
          },
        },
      },
    });

    if (!showtime) {
      return res.status(404).json({
        message: "Función no encontrada",
      });
    }

    const occupiedSeats = await prisma.reservationSeat.findMany({
      where: {
        showtime_id: showtime.id,
        is_active: true,
      },
      select: {
        seat_id: true,
      },
    });

    const occupiedIds = new Set(
      occupiedSeats.map((seat) => seat.seat_id)
    );

    const seats = showtime.room.seats.map((seat) => ({
      id: seat.id,
      row_label: seat.row_label,
      seat_number: seat.seat_number,
      type: seat.type,
      available:
        showtime.status === "SCHEDULED" &&
        showtime.starts_at > new Date() &&
        !occupiedIds.has(seat.id),
    }));

    return res.status(200).json({
      showtime_id: showtime.id,
      room_id: showtime.room_id,
      seats,
    });
  } catch (error) {
    console.error("Error al consultar disponibilidad:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.patch("/showtimes/:id/cancel", async (req, res) => {
  const validation = z.uuid().safeParse(req.params.id);

  if (!validation.success) {
    return res.status(400).json({
      message: "El ID debe ser un UUID válido",
    });
  }

  try {
    const showtimeId = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.showtime.updateMany({
        where: {
          id: showtimeId,
          status: "SCHEDULED",
        },
        data: {
          status: "CANCELLED",
        },
      });

      if (updated.count === 0) {
        return null;
      }

      // Bloquea y lee el estado vigente de las reservaciones activas.
      // Las PENDING ya vencidas se dejan a la expiración, que registra PAYMENT_TIMEOUT.
      const now = new Date();
      const reservations = await tx.$queryRaw<
        { id: string; status: "PENDING" | "CONFIRMED" }[]
      >`
        SELECT id, status::text AS status
        FROM reservations
        WHERE showtime_id = ${showtimeId}::uuid
          AND (status = 'CONFIRMED' OR (status = 'PENDING' AND expires_at > ${now}))
        ORDER BY id
        FOR UPDATE
      `;

      let cancelledReservations = 0;

      for (const reservation of reservations) {
        const updatedReservation = await tx.reservation.updateMany({
          where: { id: reservation.id, status: reservation.status },
          data: {
            status: "CANCELLED",
            expires_at: null,
          },
        });

        if (updatedReservation.count === 0) {
          continue;
        }

        cancelledReservations++;

        await tx.reservationSeat.updateMany({
          where: {
            reservation_id: reservation.id,
            is_active: true,
          },
          data: {
            is_active: false,
          },
        });

        await tx.reservationStatusHistory.create({
          data: {
            reservation_id: reservation.id,
            from_status: reservation.status,
            to_status: "CANCELLED",
            reason: "SHOWTIME_CANCELLED",
          },
        });
      }

      return {
        showtime: await tx.showtime.findUniqueOrThrow({
          where: { id: showtimeId },
        }),
        cancelled_reservations: cancelledReservations,
      };
    });

    if (!result) {
      const existing = await prisma.showtime.findUnique({
        where: { id: showtimeId },
      });

      if (!existing) {
        return res.status(404).json({
          message: "Función no encontrada",
        });
      }

      return res.status(409).json({
        message: "La función ya está cancelada",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error al cancelar función:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.post("/reservations", async (req, res) => {
  const validation = createReservationSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      message: "Datos inválidos",
      errors: validation.error.flatten(),
    });
  }

  const { showtime_id, customer_name, customer_email, seat_ids } =
    validation.data;

  try {
    await expirePendingReservations();
    const showtime = await prisma.showtime.findUnique({
      where: { id: showtime_id },
    });

    if (!showtime) {
      return res.status(404).json({
        message: "Función no encontrada",
      });
    }

    if (
      showtime.status !== "SCHEDULED" ||
      showtime.starts_at <= new Date()
    ) {
      return res.status(409).json({
        message: "La función ya comenzó o no está disponible",
      });
    }

    const seats = await prisma.seat.findMany({
      where: {
        id: { in: seat_ids },
        room_id: showtime.room_id,
      },
    });

    if (seats.length !== seat_ids.length) {
      return res.status(400).json({
        message: "Uno o más asientos no pertenecen a la sala de esta función",
      });
    }

    // El servidor calcula el precio; nunca confía en un total enviado.
    const pricedSeats = seats.map((seat) => ({
      seat_id: seat.id,
      price_cents:
        seat.type === "VIP"
          ? Math.round(showtime.base_price_cents * 1.3)
          : showtime.base_price_cents,
    }));

    const total_cents = pricedSeats.reduce(
      (total, seat) => total + seat.price_cents,
      0
    );

    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    const reservation = await prisma.$transaction(async (tx) => {
      // Revalida la función con bloqueo: una cancelación concurrente
      // debe esperar a esta transacción o esta debe ver la función cancelada.
      const lockedShowtime = await lockShowtimeForShare(tx, showtime_id);

      if (!lockedShowtime || !isShowtimeOpen(lockedShowtime)) {
        return null;
      }

      const newReservation = await tx.reservation.create({
        data: {
          showtime_id,
          customer_name,
          customer_email,
          status: "PENDING",
          total_cents,
          expires_at,
        },
      });

      await tx.reservationSeat.createMany({
        data: pricedSeats.map((seat) => ({
          reservation_id: newReservation.id,
          showtime_id,
          seat_id: seat.seat_id,
          price_cents: seat.price_cents,
          is_active: true,
        })),
      });

      await tx.reservationStatusHistory.create({
        data: {
          reservation_id: newReservation.id,
          from_status: null,
          to_status: "PENDING",
          reason: "CREATED",
        },
      });

      return tx.reservation.findUniqueOrThrow({
        where: { id: newReservation.id },
        include: {
          reservation_seats: true,
          status_history: true,
        },
      });
    });

    if (!reservation) {
      return res.status(409).json({
        message: "La función ya comenzó o no está disponible",
      });
    }

    return res.status(201).json(reservation);
  } catch (error) {
    console.error("Error al crear reservación:", error);

    // Identificamos el índice único que protege los asientos ocupados.
    const databaseError = error as {
        code?: string;
        meta?: {
            modelName?: string;
            target?: string[];
        };
    };
    
    const seatConflict =
    databaseError.code === "P2002" &&
    databaseError.meta?.modelName === "ReservationSeat" &&
    Array.isArray(databaseError.meta?.target) &&
    databaseError.meta.target.includes("showtime_id") &&
    databaseError.meta.target.includes("seat_id");

    if (seatConflict) {
      return res.status(409).json({
        message: "Uno o más asientos ya están reservados para esta función",
      });
    }

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.patch("/reservations/:id/confirm", async (req, res) => {
  const idValidation = z.uuid().safeParse(req.params.id);

  if (!idValidation.success) {
    return res.status(400).json({
      message: "El ID debe ser un UUID válido",
    });
  }

  try {
    await expirePendingReservations();

    const reservationId = idValidation.data;

    const existingReservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!existingReservation) {
      return res.status(404).json({
        message: "Reservación no encontrada",
      });
    }

    const confirmedReservation = await prisma.$transaction(async (tx) => {
      // No se confirma sobre una función cancelada o ya iniciada.
      const lockedShowtime = await lockShowtimeForShare(
        tx,
        existingReservation.showtime_id
      );

      if (!lockedShowtime || !isShowtimeOpen(lockedShowtime)) {
        return "SHOWTIME_UNAVAILABLE" as const;
      }

      const result = await tx.reservation.updateMany({
        where: {
          id: reservationId,
          status: "PENDING",
          expires_at: {
            gt: new Date(),
          },
        },
        data: {
          status: "CONFIRMED",
          expires_at: null,
        },
      });

      if (result.count === 0) {
        return null;
      }

      await tx.reservationStatusHistory.create({
        data: {
          reservation_id: reservationId,
          from_status: "PENDING",
          to_status: "CONFIRMED",
          reason: "CONFIRMED_BY_CUSTOMER",
        },
      });

      return tx.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: {
          reservation_seats: true,
          status_history: {
            orderBy: {
              changed_at: "asc",
            },
          },
        },
      });
    });

    if (confirmedReservation === "SHOWTIME_UNAVAILABLE") {
      return res.status(409).json({
        message: "La función ya comenzó o fue cancelada",
      });
    }

    if (!confirmedReservation) {
      return res.status(409).json({
        message:
          "La reservación no está pendiente o ya expiró",
      });
    }

    return res.status(200).json(confirmedReservation);
  } catch (error) {
    console.error("Error al confirmar reservación:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.patch("/reservations/:id/cancel", async (req, res) => {
  const validation = z.uuid().safeParse(req.params.id);

  if (!validation.success) {
    return res.status(400).json({
      message: "El ID debe ser un UUID válido",
    });
  }

  try {
    await expirePendingReservations();

    const reservationId = validation.data;

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { showtime: true },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Reservación no encontrada",
      });
    }

    if (!["PENDING", "CONFIRMED"].includes(existing.status)) {
      return res.status(409).json({
        message: "Esta reservación ya no puede cancelarse",
      });
    }

    const twoHoursBefore = new Date(
      existing.showtime.starts_at.getTime() - 2 * 60 * 60 * 1000
    );

    // Una reservación confirmada solo puede cancelarse hasta 2 horas antes.
    // starts_at no cambia después de crear la función, así que puede revisarse aquí.
    if (existing.status === "CONFIRMED" && new Date() > twoHoursBefore) {
      return res.status(409).json({
        message:
          "La reservación cambió de estado, expiró o está fuera del plazo de cancelación",
      });
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      // La condición evita cancelar una reservación
      // cuyo estado haya cambiado mientras procesábamos.
      // Solo usa columnas de la propia fila para que PostgreSQL la reevalúe al bloquearla.
      const result = await tx.reservation.updateMany({
        where: {
          id: reservationId,
          status: existing.status,
          ...(existing.status === "PENDING"
            ? { expires_at: { gt: new Date() } }
            : {}),
        },
        data: {
          status: "CANCELLED",
          expires_at: null,
        },
      });

      if (result.count === 0) {
        return null;
      }

      await tx.reservationSeat.updateMany({
        where: {
          reservation_id: reservationId,
          is_active: true,
        },
        data: {
          is_active: false,
        },
      });

      await tx.reservationStatusHistory.create({
        data: {
          reservation_id: reservationId,
          from_status: existing.status,
          to_status: "CANCELLED",
          reason: "CANCELLED_BY_CUSTOMER",
        },
      });

      return tx.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: {
          reservation_seats: true,
          status_history: {
            orderBy: { changed_at: "asc" },
          },
        },
      });
    });

    if (!cancelled) {
      return res.status(409).json({
        message:
          "La reservación cambió de estado, expiró o está fuera del plazo de cancelación",
      });
    }

    return res.status(200).json(cancelled);
  } catch (error) {
    console.error("Error al cancelar reservación:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

app.get("/reservations/:id", async (req, res) => {
  const validation = z.uuid().safeParse(req.params.id);

  if (!validation.success) {
    return res.status(400).json({
      message: "El ID debe ser un UUID válido",
    });
  }

  try {
    await expirePendingReservations();

    const reservation = await prisma.reservation.findUnique({
      where: {
        id: validation.data,
      },
      include: {
        showtime: {
          include: {
            movie: true,
            room: true,
          },
        },
        reservation_seats: {
          include: {
            seat: true,
          },
        },
        status_history: {
          orderBy: {
            changed_at: "asc",
          },
        },
      },
    });

    if (!reservation) {
      return res.status(404).json({
        message: "Reservación no encontrada",
      });
    }

    return res.status(200).json(reservation);
  } catch (error) {
    console.error("Error al consultar reservación:", error);

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});

// Deben registrarse después de todas las rutas.
app.use(notFoundHandler);
app.use(errorHandler);

export { app };