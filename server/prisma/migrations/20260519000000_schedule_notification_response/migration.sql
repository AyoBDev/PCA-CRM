-- AlterTable
ALTER TABLE "schedule_notifications" ADD COLUMN "response" TEXT NOT NULL DEFAULT '';
ALTER TABLE "schedule_notifications" ADD COLUMN "response_notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "schedule_notifications" ADD COLUMN "responded_at" TIMESTAMP(3);
