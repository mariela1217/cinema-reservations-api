import { beforeAll, describe, expect, it } from "vitest";
import { api, resetDatabase } from "../support/fixtures";

beforeAll(resetDatabase);

describe("Salud, documentación y errores globales", () => {
  it("GET /health → 200", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", message: "Cinema Booking API is running" });
  });

  it("GET /api-docs/ sirve Swagger UI", async () => {
    const res = await api().get("/api-docs/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Swagger UI");
  });

  it("GET /api-docs.json publica OpenAPI 3.0 con las 12 rutas", async () => {
    const res = await api().get("/api-docs.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(Object.keys(res.body.paths).sort()).toEqual(
      [
        "/movies",
        "/movies/{id}",
        "/movies/{id}/deactivate",
        "/reservations",
        "/reservations/{id}",
        "/reservations/{id}/cancel",
        "/reservations/{id}/confirm",
        "/rooms",
        "/rooms/{id}",
        "/showtimes",
        "/showtimes/{id}/cancel",
        "/showtimes/{id}/seats",
      ].sort()
    );
  });

  it("no envía la cabecera X-Powered-By", async () => {
    const res = await api().get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it.each(["get", "post", "patch", "delete"] as const)("%s a una ruta inexistente → 404 JSON", async (method) => {
    const res = await api()[method]("/no-existe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Ruta no encontrada" });
  });

  it("JSON malformado → 400 JSON sin stack trace", async () => {
    const res = await api().post("/movies").set("Content-Type", "application/json").send('{"title":');
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ message: "El cuerpo de la solicitud no es un JSON válido" });
    expect(res.text).not.toMatch(/stack|<html/i);
  });
});
