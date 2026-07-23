-- PostGIS must exist before any geography(Point, 4326) column below can be
-- created. Prisma does not emit this for Unsupported() types, so it is added
-- by hand. IF NOT EXISTS keeps the migration idempotent and safe on Railway,
-- whose Postgres image ships PostGIS available but not enabled.
CREATE EXTENSION IF NOT EXISTS postgis;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "geocode_address_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "geocode_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "geocoded_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location" geography(Point, 4326),
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "geocode_address_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "geocode_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "geocoded_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "location" geography(Point, 4326),
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "shift_callouts" (
    "id" SERIAL NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "callout_employee_id" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "reported_by_id" INTEGER,
    "resolution" TEXT NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_callouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_offers" (
    "id" SERIAL NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "callout_id" INTEGER,
    "employee_id" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}',
    "channel" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "offered_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "response" TEXT NOT NULL DEFAULT '',
    "failure_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_callouts_shift_id_idx" ON "shift_callouts"("shift_id");

-- CreateIndex
CREATE INDEX "shift_callouts_resolution_idx" ON "shift_callouts"("resolution");

-- CreateIndex
CREATE UNIQUE INDEX "shift_offers_token_key" ON "shift_offers"("token");

-- CreateIndex
CREATE INDEX "shift_offers_shift_id_idx" ON "shift_offers"("shift_id");

-- CreateIndex
CREATE INDEX "shift_offers_employee_id_idx" ON "shift_offers"("employee_id");

-- CreateIndex
CREATE INDEX "shift_offers_callout_id_idx" ON "shift_offers"("callout_id");

-- AddForeignKey
ALTER TABLE "shift_callouts" ADD CONSTRAINT "shift_callouts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_callouts" ADD CONSTRAINT "shift_callouts_callout_employee_id_fkey" FOREIGN KEY ("callout_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "shift_callouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spatial indexes. Prisma cannot express a GIST index over an Unsupported()
-- column, so these are added by hand. Without them ST_Distance/ST_DWithin fall
-- back to a sequential scan over every row.
CREATE INDEX IF NOT EXISTS "clients_location_idx" ON "clients" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "employees_location_idx" ON "employees" USING GIST ("location");
