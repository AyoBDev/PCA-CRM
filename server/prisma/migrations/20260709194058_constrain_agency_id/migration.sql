/*
  Warnings:

  - A unique constraint covering the columns `[agency_id,name]` on the table `insurance_types` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[agency_id,name]` on the table `permission_groups` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[agency_id,code]` on the table `services` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[agency_id,email]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Made the column `agency_id` on table `admin_event_seen` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `admin_files` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `admin_folders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `authorization_documents` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `authorizations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `availability_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `bulk_edit_batches` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `certification_uploads` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `client_activities` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `client_care_team` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `client_documents` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `client_notes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `clients` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `conversations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `employee_availability` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `employee_certifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `employee_schedule_links` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `employee_tasks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `employees` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `hospital_visits` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `incidents` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `insurance_types` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `leads` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `messages` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `onboarding_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `password_reset_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `pay_receipts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `payroll_profiles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `payroll_runs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `payroll_visits` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `permanent_links` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `permission_groups` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `push_subscriptions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `schedule_notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `services` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `shifts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `signing_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `task_reminders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `tasks` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `time_off_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `timesheet_entries` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `timesheet_reminders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `timesheets` required. This step will fail if there are existing NULL values in that column.
  - Made the column `agency_id` on table `workflow_triggers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "insurance_types_name_key";

-- DropIndex
DROP INDEX "permission_groups_name_key";

-- DropIndex
DROP INDEX "services_code_key";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "admin_event_seen" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "admin_files" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "admin_folders" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "authorization_documents" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "authorizations" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "availability_requests" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "bulk_edit_batches" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "certification_uploads" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "client_activities" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "client_care_team" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "client_documents" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "client_notes" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employee_availability" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employee_certifications" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employee_schedule_links" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employee_tasks" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "hospital_visits" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "insurance_types" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "onboarding_tokens" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "pay_receipts" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_profiles" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_runs" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_visits" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "permanent_links" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "permission_groups" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "push_subscriptions" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "schedule_notifications" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "signing_tokens" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "task_reminders" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "time_off_requests" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "timesheet_entries" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "timesheet_reminders" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "timesheets" ALTER COLUMN "agency_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "workflow_triggers" ALTER COLUMN "agency_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "insurance_types_agency_id_name_key" ON "insurance_types"("agency_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_groups_agency_id_name_key" ON "permission_groups"("agency_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "services_agency_id_code_key" ON "services"("agency_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_agency_id_email_key" ON "users"("agency_id", "email");

-- Superadmins (agency_id IS NULL) must have platform-unique emails.
CREATE UNIQUE INDEX "users_superadmin_email_key" ON "users" ("email") WHERE agency_id IS NULL;
