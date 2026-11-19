import "dotenv/config";
import express from "express";
import {prisma} from "./lib/prisma";
import { createMovieSchema, updateMovieSchema} from "./schemas/movie.schema";
import { setupSwagger } from "./docs/swagger";
import { z } from "zod";
import { createRoomSchema } from "./schemas/room.schema";

const app = express();


app.use(express.json());
setupSwagger(app);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Cinema Booking API is running"
  });
});

const PORT = 3000;

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

    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});