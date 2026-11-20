import { describe, expect, it } from "vitest";
import { VIP_SURCHARGE_PERCENT, seatPriceCents, totalCents } from "../../src/domain/pricing";

const INT4_MAX = 2_147_483_647;

describe("seatPriceCents", () => {
  it("REGULAR cobra el precio base sin cambios", () => {
    expect(seatPriceCents(10_000, "REGULAR")).toBe(10_000);
    expect(seatPriceCents(1, "REGULAR")).toBe(1);
  });

  it("VIP cobra 30 % más", () => {
    expect(VIP_SURCHARGE_PERCENT).toBe(30);
    expect(seatPriceCents(10_000, "VIP")).toBe(13_000);
    expect(seatPriceCents(8_550, "VIP")).toBe(11_115);
  });

  it.each([
    // [base, esperado]  base × 1,3 exacto → redondeo
    [5, 7], // 6,5 → 7 (empate hacia arriba)
    [15, 20], // 19,5 → 20
    [25, 33], // 32,5 → 33
    [35, 46], // 45,5 → 46
    [1, 1], // 1,3 → 1
    [2, 3], // 2,6 → 3
    [3, 4], // 3,9 → 4
    [999, 1_299], // 1298,7 → 1299
    [1_005, 1_307], // 1306,5 → 1307
  ])("VIP redondea al centavo con empates hacia arriba (base %i → %i)", (base, expected) => {
    expect(seatPriceCents(base, "VIP")).toBe(expected);
  });

  it("es exacto en el máximo de INTEGER de PostgreSQL", () => {
    // 2147483647 × 1,3 = 2791728741,1 → 2791728741
    expect(seatPriceCents(INT4_MAX, "VIP")).toBe(2_791_728_741);
    expect(Number.isSafeInteger(INT4_MAX * 130)).toBe(true);
  });

  it("con el precio base máximo permitido, 6 asientos VIP caben en INTEGER", () => {
    const vip = seatPriceCents(10_000_000, "VIP");
    expect(vip).toBe(13_000_000);
    expect(totalCents(Array(6).fill(vip))).toBe(78_000_000);
    expect(78_000_000).toBeLessThanOrEqual(INT4_MAX);
  });

  it("siempre devuelve enteros", () => {
    for (let base = 1; base <= 2_000; base++) {
      expect(Number.isInteger(seatPriceCents(base, "VIP"))).toBe(true);
    }
  });
});

describe("totalCents", () => {
  it("suma los precios por asiento", () => {
    expect(totalCents([10_000, 10_000, 13_000])).toBe(33_000);
  });

  it("devuelve 0 para una lista vacía", () => {
    expect(totalCents([])).toBe(0);
  });
});
