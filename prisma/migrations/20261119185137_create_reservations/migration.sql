-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStatusReason" AS ENUM ('CREATED', 'CONFIRMED_BY_CUSTOMER', 'CANCELLED_BY_CUSTOMER', 'SHOWTIME_CANCELLED', 'PAYMENT_TIMEOUT');

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "showtime_id" UUID NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_email" VARCHAR(254) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "total_cents" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_seats" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "showtime_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservation_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_status_history" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "from_status" "ReservationStatus",
    "to_status" "ReservationStatus" NOT NULL,
    "reason" "ReservationStatusReason" NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "reservation_seats_showtime_id_seat_id_idx" ON "reservation_seats"("showtime_id", "seat_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_seats_reservation_id_seat_id_key" ON "reservation_seats"("reservation_id", "seat_id");

-- CreateIndex
CREATE INDEX "reservation_status_history_reservation_id_changed_at_idx" ON "reservation_status_history"("reservation_id", "changed_at");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_showtime_id_fkey" FOREIGN KEY ("showtime_id") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_showtime_id_fkey" FOREIGN KEY ("showtime_id") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El nombre del cliente no puede estar vacío.
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_customer_name_not_blank"
CHECK (length(trim("customer_name")) > 0);

-- El correo no puede estar vacío.
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_customer_email_not_blank"
CHECK (length(trim("customer_email")) > 0);

-- El total no puede ser negativo.
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_total_nonnegative"
CHECK ("total_cents" >= 0);

-- Una reservación pendiente debe tener fecha de expiración.
-- Los demás estados no deben tener una expiración activa.
ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_expiration_consistency"
CHECK (
    ("status" = 'PENDING' AND "expires_at" IS NOT NULL)
    OR
    ("status" <> 'PENDING' AND "expires_at" IS NULL)
);

-- Cada asiento debe tener un precio positivo.
ALTER TABLE "reservation_seats"
ADD CONSTRAINT "reservation_seats_price_positive"
CHECK ("price_cents" > 0);

-- No permitir el mismo asiento ocupado dos veces
-- para una misma función.
CREATE UNIQUE INDEX "reservation_seats_active_unique"
ON "reservation_seats" ("showtime_id", "seat_id")
WHERE "is_active" = true;

-- Un cambio de estado debe representar un cambio real.
ALTER TABLE "reservation_status_history"
ADD CONSTRAINT "reservation_status_history_valid_transition"
CHECK ("from_status" IS NULL OR "from_status" <> "to_status");