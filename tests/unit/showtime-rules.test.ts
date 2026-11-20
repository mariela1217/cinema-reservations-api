import { describe, expect, it } from "vitest";
import { CLEANING_MINUTES, calculateShowtimeEnd, isShowtimeOpen } from "../../src/domain/showtime-rules";

const START = new Date("2030-01-01T18:00:00.000Z");

describe("calculateShowtimeEnd", () => {
  it("suma la duración más 20 minutos de limpieza", () => {
    expect(CLEANING_MINUTES).toBe(20);
    expect(calculateShowtimeEnd(START, 100).toISOString()).toBe("2030-01-01T20:00:00.000Z");
  });

  it("con la duración mínima de 1 minuto ocupa 21 minutos", () => {
    expect(calculateShowtimeEnd(START, 1).getTime() - START.getTime()).toBe(21 * 60_000);
  });

  it("no modifica la fecha de inicio recibida", () => {
    const start = new Date(START);
    calculateShowtimeEnd(start, 90);
    expect(start.getTime()).toBe(START.getTime());
  });
});

describe("isShowtimeOpen", () => {
  const before = new Date(START.getTime() - 1);

  it("acepta una función programada que todavía no comienza", () => {
    expect(isShowtimeOpen({ status: "SCHEDULED", starts_at: START }, before)).toBe(true);
  });

  it("rechaza una función que comienza exactamente ahora", () => {
    expect(isShowtimeOpen({ status: "SCHEDULED", starts_at: START }, START)).toBe(false);
  });

  it("rechaza una función ya iniciada", () => {
    expect(isShowtimeOpen({ status: "SCHEDULED", starts_at: START }, new Date(START.getTime() + 1))).toBe(false);
  });

  it("rechaza una función cancelada aunque no haya comenzado", () => {
    expect(isShowtimeOpen({ status: "CANCELLED", starts_at: START }, before)).toBe(false);
  });
});
