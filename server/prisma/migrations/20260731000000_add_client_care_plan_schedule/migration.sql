-- Add a dedicated Care Plan "Schedule Needs" field to clients, populated at
-- lead conversion and editable on the Care Plan tab's Care Plan Summary section.
ALTER TABLE "clients" ADD COLUMN "care_plan_schedule" TEXT NOT NULL DEFAULT '';
