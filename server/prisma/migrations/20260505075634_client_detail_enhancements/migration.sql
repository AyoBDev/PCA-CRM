-- AlterTable
ALTER TABLE "authorizations" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "authorization_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "authorized_hours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "caregiver_requirements" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergency_contact_relation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gender" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "main_services" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pca_notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondary_address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondary_emergency_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondary_emergency_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondary_emergency_relation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondary_phone" TEXT NOT NULL DEFAULT '';
