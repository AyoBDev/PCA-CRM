-- Add companion service fields to timesheets and timesheet entries
ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "total_companion_hours" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_activities" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_time_in" TEXT;
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_time_out" TEXT;
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_hours" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_pca_initials" TEXT NOT NULL DEFAULT '';
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_client_initials" TEXT NOT NULL DEFAULT '';
ALTER TABLE "timesheet_entries" ADD COLUMN IF NOT EXISTS "companion_time_blocks" TEXT NOT NULL DEFAULT '[]';
