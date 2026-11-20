import { prisma } from "../lib/prisma";

export async function expirePendingReservations() {
  const now = new Date();

  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expires_at: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
  });

  let expiredCount = 0;

  for (const reservation of expiredReservations) {
    const wasExpired = await prisma.$transaction(async (tx) => {
      const result = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          status: "PENDING",
          expires_at: {
            lte: now,
          },
        },
        data: {
          status: "EXPIRED",
          expires_at: null,
        },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.reservationSeat.updateMany({
        where: {
          reservation_id: reservation.id,
          is_active: true,
        },
        data: {
          is_active: false,
        },
      });

      await tx.reservationStatusHistory.create({
        data: {
          reservation_id: reservation.id,
          from_status: "PENDING",
          to_status: "EXPIRED",
          reason: "PAYMENT_TIMEOUT",
        },
      });

      return true;
    });

    if (wasExpired) {
      expiredCount++;
    }
  }

  return expiredCount;
}