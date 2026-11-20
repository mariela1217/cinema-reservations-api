import type { Prisma } from "@prisma/client";

type LockedShowtime = {
  id: string;
  status: "SCHEDULED" | "CANCELLED";
  starts_at: Date;
};

// Lee la función con un bloqueo compartido (FOR SHARE) dentro de la transacción.
// Varias reservaciones de la misma función pueden tenerlo a la vez, pero la cancelación
// de la función (UPDATE) debe esperar a que terminen, y viceversa. Así el estado leído
// sigue vigente hasta el commit.
export async function lockShowtimeForShare(
  tx: Prisma.TransactionClient,
  showtimeId: string
): Promise<LockedShowtime | null> {
  const rows = await tx.$queryRaw<LockedShowtime[]>`
    SELECT id, status::text AS status, starts_at
    FROM showtimes
    WHERE id = ${showtimeId}::uuid
    FOR SHARE
  `;

  return rows[0] ?? null;
}
