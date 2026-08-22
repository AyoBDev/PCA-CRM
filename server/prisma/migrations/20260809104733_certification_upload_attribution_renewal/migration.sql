-- AlterTable
ALTER TABLE "certification_uploads" ADD COLUMN     "effective_date" TIMESTAMP(3),
ADD COLUMN     "expiration_date" TIMESTAMP(3),
ADD COLUMN     "uploaded_by_id" INTEGER,
ADD COLUMN     "uploaded_by_name" TEXT NOT NULL DEFAULT '';
