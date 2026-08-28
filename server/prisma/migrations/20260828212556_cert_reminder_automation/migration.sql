-- AlterTable
ALTER TABLE "employee_certifications" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" INTEGER,
ADD COLUMN     "approved_by_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "current_version_key" TEXT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "onboarding_status" SET DEFAULT 'active';

-- CreateTable
CREATE TABLE "cert_reminder_logs" (
    "id" SERIAL NOT NULL,
    "certification_id" INTEGER NOT NULL,
    "version_key" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "channels" JSONB NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agency_id" INTEGER NOT NULL,

    CONSTRAINT "cert_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cert_reminder_logs_agency_id_idx" ON "cert_reminder_logs"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "cert_reminder_logs_certification_id_version_key_stage_key" ON "cert_reminder_logs"("certification_id", "version_key", "stage");

-- AddForeignKey
ALTER TABLE "cert_reminder_logs" ADD CONSTRAINT "cert_reminder_logs_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "employee_certifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cert_reminder_logs" ADD CONSTRAINT "cert_reminder_logs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
