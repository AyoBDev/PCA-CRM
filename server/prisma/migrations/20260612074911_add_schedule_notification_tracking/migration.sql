-- AlterTable
ALTER TABLE "schedule_notifications" ADD COLUMN     "message" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "opened_at" TIMESTAMP(3),
ADD COLUMN     "sent_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "schedule_notifications" ADD CONSTRAINT "schedule_notifications_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
