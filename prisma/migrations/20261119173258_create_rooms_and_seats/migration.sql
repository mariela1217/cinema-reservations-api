-- CreateEnum
CREATE TYPE "SeatType" AS ENUM ('REGULAR', 'VIP');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "row_label" VARCHAR(5) NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "type" "SeatType" NOT NULL DEFAULT 'REGULAR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "seats_room_id_row_label_seat_number_key" ON "seats"("room_id", "row_label", "seat_number");

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El nombre de la sala no puede estar vacío ni contener solo espacios.
ALTER TABLE "rooms"
ADD CONSTRAINT "rooms_name_not_blank"
CHECK (length(trim("name")) > 0);

-- La fila del asiento no puede estar vacía ni contener solo espacios.
ALTER TABLE "seats"
ADD CONSTRAINT "seats_row_label_not_blank"
CHECK (length(trim("row_label")) > 0);

-- El número del asiento debe ser mayor que cero.
ALTER TABLE "seats"
ADD CONSTRAINT "seats_number_positive"
CHECK ("seat_number" > 0);