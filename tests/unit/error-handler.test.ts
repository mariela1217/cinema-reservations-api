import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler, notFoundHandler } from "../../src/middlewares/error-handler";

// Mini aplicación sin base de datos que ejercita el middleware real.
function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1kb" }));

  app.get("/boom", () => {
    throw new Error("detalle interno: password=123");
  });
  app.get("/async-boom", async () => {
    throw new Error("fallo asíncrono interno");
  });
  app.get("/status/:value", (req) => {
    const error = Object.assign(new Error("x"), {
      status: JSON.parse(req.params.value),
      expose: req.query.expose === "1",
    });
    throw error;
  });
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const consoleError = vi.spyOn(console, "error");

beforeAll(() => {
  consoleError.mockImplementation(() => {});
});

afterAll(() => {
  consoleError.mockRestore();
});

function expectSafeJson(res: request.Response) {
  expect(res.headers["content-type"]).toMatch(/application\/json/);
  // Textos de los errores originales que nunca deben llegar al cliente.
  expect(res.text).not.toMatch(/stack|<html|password|detalle interno|asíncrono interno/i);
}

describe("errorHandler", () => {
  it("JSON malformado → 400 con mensaje JSON", async () => {
    const res = await request(app).post("/echo").set("Content-Type", "application/json").send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "El cuerpo de la solicitud no es un JSON válido" });
    expectSafeJson(res);
  });

  it("cuerpo demasiado grande → 413", async () => {
    const res = await request(app).post("/echo").send({ a: "x".repeat(2_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "El cuerpo de la solicitud es demasiado grande" });
  });

  it("error síncrono inesperado → 500 genérico sin detalles", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Error interno del servidor" });
    expectSafeJson(res);
    expect(consoleError).toHaveBeenCalled();
  });

  it("error asíncrono inesperado → 500 genérico", async () => {
    const res = await request(app).get("/async-boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Error interno del servidor" });
  });

  it("4xx con expose → mismo estado y mensaje genérico", async () => {
    const res = await request(app).get("/status/418?expose=1");
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ message: "Solicitud inválida" });
  });

  it.each([
    ["999", "fuera de rango"],
    ["404.5", "no entero"],
    ['"404"', "texto"],
    ["399", "menor que 400"],
    ["500", "5xx"],
  ])("estado %s (%s) → 500", async (value) => {
    const res = await request(app).get(`/status/${encodeURIComponent(value)}?expose=1`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Error interno del servidor" });
  });

  it("4xx sin expose → 500", async () => {
    const res = await request(app).get("/status/418");
    expect(res.status).toBe(500);
  });
});

describe("notFoundHandler", () => {
  it.each(["get", "post", "patch"] as const)("%s a una ruta inexistente → 404 JSON", async (method) => {
    const res = await request(app)[method]("/no-existe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Ruta no encontrada" });
  });
});
