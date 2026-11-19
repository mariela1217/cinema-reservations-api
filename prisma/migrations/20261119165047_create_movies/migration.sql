-- CreateTable
CREATE TABLE "movies" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- La duración de la película debe ser mayor que cero.
ALTER TABLE "movies"
ADD CONSTRAINT "movies_duration_positive"
CHECK ("duration_minutes" > 0);

-- El título no puede estar vacío ni contener solo espacios.
ALTER TABLE "movies"
ADD CONSTRAINT "movies_title_not_blank"
CHECK (length(trim("title")) > 0);

