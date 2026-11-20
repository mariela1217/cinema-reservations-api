// Reglas de precio. Todos los montos son enteros en centavos.

export type SeatType = "REGULAR" | "VIP";

export const VIP_SURCHARGE_PERCENT = 30;

// Precio de un asiento: el VIP cuesta 30 % más, redondeado al centavo (0,5 hacia arriba).
// Se calcula con aritmética entera: base × 130 es exacto para cualquier INTEGER de PostgreSQL
// (máximo ≈ 2,8 × 10^11, muy por debajo de 2^53), y la división entre 100 solo puede
// quedar en ,5 exacto, que Math.round redondea hacia arriba.
export function seatPriceCents(basePriceCents: number, seatType: SeatType): number {
  if (seatType === "VIP") {
    return Math.round((basePriceCents * (100 + VIP_SURCHARGE_PERCENT)) / 100);
  }

  return basePriceCents;
}

export function totalCents(pricesCents: readonly number[]): number {
  return pricesCents.reduce((total, price) => total + price, 0);
}
