-- CreateTable
CREATE TABLE "timesheet_reminders" (
    "id" SERIAL NOT NULL,
    "timesheet_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'sent',

    CONSTRAINT "timesheet_reminders_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "timesheet_reminders" ADD CONSTRAINT "timesheet_reminders_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
