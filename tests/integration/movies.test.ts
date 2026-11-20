import { beforeAll, describe, expect, it } from "vitest";
import { errorResponseSchema, validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import { movieResponseSchema, moviesListResponseSchema } from "../../src/schemas/movie-response.schema";
import { UNKNOWN_UUID, api, createMovie, expectSchema, resetDatabase, uniqueName } from "../support/fixtures";

beforeAll(resetDatabase);

describe("POST /movies", () => {
  it("crea una película activa y recorta espacios del título", async () => {
    const title = uniqueName("Dune");
    const res = await api().post("/movies").send({ title: `  ${title}  `, duration_minutes: 155 });

    expect(res.status).toBe(201);
    expectSchema(movieResponseSchema, res.body);
    expect(res.body).toMatchObject({ title, duration_minutes: 155, is_active: true });
  });

  it.each([
    ["cuerpo vacío", {}],
    ["título vacío", { title: "   ", duration_minutes: 90 }],
    ["título de más de 200 caracteres", { title: "x".repeat(201), duration_minutes: 90 }],
    ["duración 0", { title: "X", duration_minutes: 0 }],
    ["duración negativa", { title: "X", duration_minutes: -5 }],
    ["duración decimal", { title: "X", duration_minutes: 90.5 }],
    ["duración como texto", { title: "X", duration_minutes: "90" }],
    ["campo no permitido (is_active)", { title: "X", duration_minutes: 90, is_active: false }],
  ])("rechaza %s con 400 y errores de validación", async (_case, body) => {
    const res = await api().post("/movies").send(body);
    expect(res.status).toBe(400);
    expectSchema(validationErrorResponseSchema, res.body);
    expect(res.body.message).toBe("Datos inválidos");
  });
});

describe("GET /movies y GET /movies/:id", () => {
  it("lista las películas, incluida una recién creada", async () => {
    const movie = await createMovie();
    const res = await api().get("/movies");

    expect(res.status).toBe(200);
    expectSchema(moviesListResponseSchema, res.body);
    expect(res.body.map((m: { id: string }) => m.id)).toContain(movie.id);
  });

  it("consulta una película por ID", async () => {
    const movie = await createMovie();
    const res = await api().get(`/movies/${movie.id}`);

    expect(res.status).toBe(200);
    expectSchema(movieResponseSchema, res.body);
    expect(res.body.id).toBe(movie.id);
  });

  it("ID con formato inválido → 400", async () => {
    const res = await api().get("/movies/abc");
    expect(res.status).toBe(400);
    expectSchema(errorResponseSchema, res.body);
    expect(res.body.message).toBe("El ID debe ser un UUID válido");
  });

  it("ID inexistente → 404", async () => {
    const res = await api().get(`/movies/${UNKNOWN_UUID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Película no encontrada" });
  });
});

describe("PATCH /movies/:id", () => {
  it("actualiza el título y la duración", async () => {
    const movie = await createMovie();
    const title = uniqueName("Nuevo título");
    const res = await api().patch(`/movies/${movie.id}`).send({ title, duration_minutes: 120 });

    expect(res.status).toBe(200);
    expectSchema(movieResponseSchema, res.body);
    expect(res.body).toMatchObject({ id: movie.id, title, duration_minutes: 120 });
  });

  it("acepta actualizar un solo campo", async () => {
    const movie = await createMovie({ duration_minutes: 100 });
    const res = await api().patch(`/movies/${movie.id}`).send({ duration_minutes: 95 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: movie.title, duration_minutes: 95 });
  });

  it.each([
    ["cuerpo vacío", {}],
    ["campo no permitido", { is_active: false }],
    ["duración inválida", { duration_minutes: 0 }],
  ])("rechaza %s con 400", async (_case, body) => {
    const movie = await createMovie();
    const res = await api().patch(`/movies/${movie.id}`).send(body);
    expect(res.status).toBe(400);
    expectSchema(validationErrorResponseSchema, res.body);
  });

  it("ID inválido → 400 y ID inexistente → 404", async () => {
    const invalid = await api().patch("/movies/abc").send({ title: "X" });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: "El ID debe ser un UUID válido" });

    const missing = await api().patch(`/movies/${UNKNOWN_UUID}`).send({ title: "X" });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Película no encontrada" });
  });
});

describe("PATCH /movies/:id/deactivate", () => {
  it("desactiva la película y conserva el registro", async () => {
    const movie = await createMovie();
    const res = await api().patch(`/movies/${movie.id}/deactivate`);

    expect(res.status).toBe(200);
    expectSchema(movieResponseSchema, res.body);
    expect(res.body.is_active).toBe(false);

    const again = await api().get(`/movies/${movie.id}`);
    expect(again.status).toBe(200);
    expect(again.body.is_active).toBe(false);
  });

  it("desactivar dos veces → 409", async () => {
    const movie = await createMovie();
    await api().patch(`/movies/${movie.id}/deactivate`);
    const res = await api().patch(`/movies/${movie.id}/deactivate`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "La película ya está desactivada" });
  });

  it("ID inválido → 400 y ID inexistente → 404", async () => {
    expect((await api().patch("/movies/abc/deactivate")).status).toBe(400);
    const missing = await api().patch(`/movies/${UNKNOWN_UUID}/deactivate`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Película no encontrada" });
  });
});
