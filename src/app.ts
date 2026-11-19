import "dotenv/config";
import express from "express";
import {prisma} from "./lib/prisma";
import { createMovieSchema } from "./schemas/movie.schema";
import { setupSwagger } from "./docs/swagger";

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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});