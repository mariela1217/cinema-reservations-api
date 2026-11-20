import { describe, expect, it } from "vitest";
import {
  CANCELLATION_DEADLINE_HOURS,
  RESERVATION_TTL_MINUTES,
  calculateExpiration,
  isWithinCancellationWindow,
} from "../../src/domain/reservation-rules";

const NOW = new Date("2030-01-01T12:00:00.000Z");
const HOUR = 3_600_000;

describe("calculateExpiration", () => {
  it("vence exactamente 10 minutos después", () => {
    expect(RESERVATION_TTL_MINUTES).toBe(10);
    expect(calculateExpiration(NOW).toISOString()).toBe("2030-01-01T12:10:00.000Z");
  });

  it("usa la hora actual cuando no recibe una fecha", () => {
    const before = Date.now();
    const expiration = calculateExpiration().getTime();
    const after = Date.now();
    expect(expiration).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(expiration).toBeLessThanOrEqual(after + 10 * 60_000);
  });
});

describe("isWithinCancellationWindow", () => {
  const startsAt = new Date(NOW.getTime() + 2 * HOUR);

  it("el plazo es de 2 horas", () => {
    expect(CANCELLATION_DEADLINE_HOURS).toBe(2);
  });

  it("permite cancelar con más de 2 horas de anticipación", () => {
    expect(isWithinCancellationWindow(startsAt, new Date(NOW.getTime() - 1))).toBe(true);
  });

  it("permite cancelar exactamente 2 horas antes (límite inclusivo)", () => {
    expect(isWithinCancellationWindow(startsAt, NOW)).toBe(true);
  });

  it("rechaza 1 ms después del límite", () => {
    expect(isWithinCancellationWindow(startsAt, new Date(NOW.getTime() + 1))).toBe(false);
  });

  it("rechaza cuando la función ya comenzó", () => {
    expect(isWithinCancellationWindow(startsAt, new Date(startsAt.getTime() + 1))).toBe(false);
  });
});
