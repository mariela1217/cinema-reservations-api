-- CreateEnum
CREATE TYPE "ShowtimeStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "showtimes" (
    "id" UUID NOT NULL,
    "movie_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "base_price_cents" INTEGER NOT NULL,
    "status" "ShowtimeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "showtimes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showtimes_movie_id_starts_at_idx" ON "showtimes"("movie_id", "starts_at");

-- CreateIndex
CREATE INDEX "showtimes_room_id_starts_at_idx" ON "showtimes"("room_id", "starts_at");

-- AddForeignKey
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El precio base debe ser mayor que cero.
ALTER TABLE "showtimes"
ADD CONSTRAINT "showtimes_price_positive"
CHECK ("base_price_cents" > 0);

-- La fecha de finalización debe ser posterior al inicio.
ALTER TABLE "showtimes"
ADD CONSTRAINT "showtimes_valid_time_range"
CHECK ("ends_at" > "starts_at");

-- Habilita la comparación de UUID junto con rangos de tiempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Impide que dos funciones programadas se empalmen en la misma sala.
ALTER TABLE "showtimes"
ADD CONSTRAINT "showtimes_no_overlap"
EXCLUDE USING gist (
    "room_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" = 'SCHEDULED');