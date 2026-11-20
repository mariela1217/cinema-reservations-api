import { beforeAll, describe, expect, it } from "vitest";
import { errorResponseSchema, validationErrorResponseSchema } from "../../src/schemas/error-response.schema";
import { roomResponseSchema } from "../../src/schemas/room-response.schema";
import { UNKNOWN_UUID, api, createRoom, expectSchema, prisma, resetDatabase, uniqueName } from "../support/fixtures";

beforeAll(resetDatabase);

describe("POST /rooms", () => {
  it("crea la sala y genera sus asientos ordenados por fila y número", async () => {
    const name = uniqueName("Sala");
    const res = await api()
      .post("/rooms")
      .send({
        name,
        rows: [
          { label: "B", seats: 2, type: "VIP" },
          { label: " A ", seats: 3, type: "REGULAR" },
        ],
      });

    expect(res.status).toBe(201);
    expectSchema(roomResponseSchema, res.body);
    expect(res.body.name).toBe(name);
    expect(res.body.seats.map((s: { row_label: string; seat_number: number; type: string }) => `${s.row_label}${s.seat_number}:${s.type}`)).toEqual([
      "A1:REGULAR",
      "A2:REGULAR",
      "A3:REGULAR",
      "B1:VIP",
      "B2:VIP",
    ]);
    expect(res.body.seats.every((s: { room_id: string }) => s.room_id === res.body.id)).toBe(true);
  });

  it.each([
    ["sin filas", { rows: [] }],
    ["etiquetas repetidas", { rows: [{ label: "A", seats: 1, type: "REGULAR" }, { label: "A", seats: 1, type: "VIP" }] }],
    ["etiquetas repetidas tras recortar espacios", { rows: [{ label: "A", seats: 1, type: "REGULAR" }, { label: "A ", seats: 1, type: "VIP" }] }],
    ["fila sin asientos", { rows: [{ label: "A", seats: 0, type: "REGULAR" }] }],
    ["más de 50 asientos por fila", { rows: [{ label: "A", seats: 51, type: "REGULAR" }] }],
    ["etiqueta de más de 5 caracteres", { rows: [{ label: "ABCDEF", seats: 1, type: "REGULAR" }] }],
    ["tipo de asiento inválido", { rows: [{ label: "A", seats: 1, type: "PREMIUM" }] }],
    ["más de 30 filas", { rows: Array.from({ length: 31 }, (_, i) => ({ label: `R${i}`, seats: 1, type: "REGULAR" })) }],
    ["campo no permitido en la fila", { rows: [{ label: "A", seats: 1, type: "REGULAR", price: 5 }] }],
  ])("rechaza %s con 400", async (_case, partial) => {
    const res = await api().post("/rooms").send({ name: uniqueName("Sala"), ...partial });
    expect(res.status).toBe(400);
    expectSchema(validationErrorResponseSchema, res.body);
  });

  it("rechaza un nombre vacío con 400", async () => {
    const res = await api().post("/rooms").send({ name: "  ", rows: [{ label: "A", seats: 1, type: "REGULAR" }] });
    expect(res.status).toBe(400);
  });

  it("nombre duplicado → 409 sin crear la sala ni sus asientos", async () => {
    const room = await createRoom();
    const before = { rooms: await prisma.room.count(), seats: await prisma.seat.count() };

    const res = await api()
      .post("/rooms")
      .send({ name: room.name, rows: [{ label: "Z", seats: 3, type: "REGULAR" }] });

    expect(res.status).toBe(409);
    expectSchema(errorResponseSchema, res.body);
    expect(res.body).toEqual({ message: "Ya existe una sala con ese nombre" });
    expect({ rooms: await prisma.room.count(), seats: await prisma.seat.count() }).toEqual(before);
  });
});

describe("GET /rooms/:id", () => {
  it("devuelve la sala con sus asientos", async () => {
    const room = await createRoom();
    const res = await api().get(`/rooms/${room.id}`);

    expect(res.status).toBe(200);
    expectSchema(roomResponseSchema, res.body);
    expect(res.body.seats).toHaveLength(6);
    expect(res.body.seats.filter((s: { type: string }) => s.type === "VIP")).toHaveLength(2);
  });

  it("ID inválido → 400 y ID inexistente → 404", async () => {
    const invalid = await api().get("/rooms/abc");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ message: "El ID debe ser un UUID válido" });

    const missing = await api().get(`/rooms/${UNKNOWN_UUID}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: "Sala no encontrada" });
  });
});
