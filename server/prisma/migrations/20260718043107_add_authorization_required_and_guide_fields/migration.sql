-- AlterTable
ALTER TABLE "authorizations" ADD COLUMN     "authorization_type" TEXT NOT NULL DEFAULT 'Weekly Units',
ADD COLUMN     "authorized_hours_per_year" DOUBLE PRECISION,
ADD COLUMN     "authorized_visits_per_year" INTEGER,
ADD COLUMN     "hours_per_visit" DOUBLE PRECISION,
ADD COLUMN     "used_hours_ytd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "authorization_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "override_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "override_by" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "override_expires_on" TIMESTAMP(3),
ADD COLUMN     "override_reason" TEXT NOT NULL DEFAULT '';
