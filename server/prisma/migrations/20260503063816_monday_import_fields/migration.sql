-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "backup_doctor_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "backup_doctor_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "critical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "doctor_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "doctor_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pa_number" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "client_notes" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_notes_client_id_idx" ON "client_notes"("client_id");

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
