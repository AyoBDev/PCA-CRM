-- AlterTable
ALTER TABLE "admin_event_seen" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "admin_files" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "admin_folders" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "authorization_documents" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "authorizations" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "availability_requests" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "bulk_edit_batches" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "certification_uploads" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "client_activities" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "client_care_team" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "client_documents" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "client_notes" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "employee_availability" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "employee_certifications" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "employee_schedule_links" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "employee_tasks" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "hospital_visits" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "insurance_types" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "onboarding_tokens" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "pay_receipts" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "payroll_profiles" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "payroll_visits" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "permanent_links" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "permission_groups" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "schedule_notifications" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "signing_tokens" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "task_reminders" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "time_off_requests" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "timesheet_entries" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "timesheet_reminders" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agency_id" INTEGER;

-- AlterTable
ALTER TABLE "workflow_triggers" ADD COLUMN     "agency_id" INTEGER;

-- CreateTable
CREATE TABLE "agencies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- CreateIndex
CREATE INDEX "admin_event_seen_agency_id_idx" ON "admin_event_seen"("agency_id");

-- CreateIndex
CREATE INDEX "admin_files_agency_id_idx" ON "admin_files"("agency_id");

-- CreateIndex
CREATE INDEX "admin_folders_agency_id_idx" ON "admin_folders"("agency_id");

-- CreateIndex
CREATE INDEX "audit_logs_agency_id_idx" ON "audit_logs"("agency_id");

-- CreateIndex
CREATE INDEX "authorization_documents_agency_id_idx" ON "authorization_documents"("agency_id");

-- CreateIndex
CREATE INDEX "authorizations_agency_id_idx" ON "authorizations"("agency_id");

-- CreateIndex
CREATE INDEX "availability_requests_agency_id_idx" ON "availability_requests"("agency_id");

-- CreateIndex
CREATE INDEX "bulk_edit_batches_agency_id_idx" ON "bulk_edit_batches"("agency_id");

-- CreateIndex
CREATE INDEX "certification_uploads_agency_id_idx" ON "certification_uploads"("agency_id");

-- CreateIndex
CREATE INDEX "client_activities_agency_id_idx" ON "client_activities"("agency_id");

-- CreateIndex
CREATE INDEX "client_care_team_agency_id_idx" ON "client_care_team"("agency_id");

-- CreateIndex
CREATE INDEX "client_documents_agency_id_idx" ON "client_documents"("agency_id");

-- CreateIndex
CREATE INDEX "client_notes_agency_id_idx" ON "client_notes"("agency_id");

-- CreateIndex
CREATE INDEX "clients_agency_id_idx" ON "clients"("agency_id");

-- CreateIndex
CREATE INDEX "conversations_agency_id_idx" ON "conversations"("agency_id");

-- CreateIndex
CREATE INDEX "employee_availability_agency_id_idx" ON "employee_availability"("agency_id");

-- CreateIndex
CREATE INDEX "employee_certifications_agency_id_idx" ON "employee_certifications"("agency_id");

-- CreateIndex
CREATE INDEX "employee_schedule_links_agency_id_idx" ON "employee_schedule_links"("agency_id");

-- CreateIndex
CREATE INDEX "employee_tasks_agency_id_idx" ON "employee_tasks"("agency_id");

-- CreateIndex
CREATE INDEX "employees_agency_id_idx" ON "employees"("agency_id");

-- CreateIndex
CREATE INDEX "hospital_visits_agency_id_idx" ON "hospital_visits"("agency_id");

-- CreateIndex
CREATE INDEX "incidents_agency_id_idx" ON "incidents"("agency_id");

-- CreateIndex
CREATE INDEX "insurance_types_agency_id_idx" ON "insurance_types"("agency_id");

-- CreateIndex
CREATE INDEX "leads_agency_id_idx" ON "leads"("agency_id");

-- CreateIndex
CREATE INDEX "messages_agency_id_idx" ON "messages"("agency_id");

-- CreateIndex
CREATE INDEX "notifications_agency_id_idx" ON "notifications"("agency_id");

-- CreateIndex
CREATE INDEX "onboarding_tokens_agency_id_idx" ON "onboarding_tokens"("agency_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_agency_id_idx" ON "password_reset_tokens"("agency_id");

-- CreateIndex
CREATE INDEX "pay_receipts_agency_id_idx" ON "pay_receipts"("agency_id");

-- CreateIndex
CREATE INDEX "payroll_profiles_agency_id_idx" ON "payroll_profiles"("agency_id");

-- CreateIndex
CREATE INDEX "payroll_runs_agency_id_idx" ON "payroll_runs"("agency_id");

-- CreateIndex
CREATE INDEX "payroll_visits_agency_id_idx" ON "payroll_visits"("agency_id");

-- CreateIndex
CREATE INDEX "permanent_links_agency_id_idx" ON "permanent_links"("agency_id");

-- CreateIndex
CREATE INDEX "permission_groups_agency_id_idx" ON "permission_groups"("agency_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_agency_id_idx" ON "push_subscriptions"("agency_id");

-- CreateIndex
CREATE INDEX "schedule_notifications_agency_id_idx" ON "schedule_notifications"("agency_id");

-- CreateIndex
CREATE INDEX "services_agency_id_idx" ON "services"("agency_id");

-- CreateIndex
CREATE INDEX "shifts_agency_id_idx" ON "shifts"("agency_id");

-- CreateIndex
CREATE INDEX "signing_tokens_agency_id_idx" ON "signing_tokens"("agency_id");

-- CreateIndex
CREATE INDEX "task_reminders_agency_id_idx" ON "task_reminders"("agency_id");

-- CreateIndex
CREATE INDEX "tasks_agency_id_idx" ON "tasks"("agency_id");

-- CreateIndex
CREATE INDEX "time_off_requests_agency_id_idx" ON "time_off_requests"("agency_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_agency_id_idx" ON "timesheet_entries"("agency_id");

-- CreateIndex
CREATE INDEX "timesheet_reminders_agency_id_idx" ON "timesheet_reminders"("agency_id");

-- CreateIndex
CREATE INDEX "timesheets_agency_id_idx" ON "timesheets"("agency_id");

-- CreateIndex
CREATE INDEX "users_agency_id_idx" ON "users"("agency_id");

-- CreateIndex
CREATE INDEX "workflow_triggers_agency_id_idx" ON "workflow_triggers"("agency_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_event_seen" ADD CONSTRAINT "admin_event_seen_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tokens" ADD CONSTRAINT "onboarding_tokens_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_uploads" ADD CONSTRAINT "certification_uploads_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_links" ADD CONSTRAINT "employee_schedule_links_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_notifications" ADD CONSTRAINT "schedule_notifications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_care_team" ADD CONSTRAINT "client_care_team_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_visits" ADD CONSTRAINT "hospital_visits_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activities" ADD CONSTRAINT "client_activities_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_types" ADD CONSTRAINT "insurance_types_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_tokens" ADD CONSTRAINT "signing_tokens_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_visits" ADD CONSTRAINT "payroll_visits_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_receipts" ADD CONSTRAINT "pay_receipts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permanent_links" ADD CONSTRAINT "permanent_links_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_documents" ADD CONSTRAINT "authorization_documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_edit_batches" ADD CONSTRAINT "bulk_edit_batches_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_reminders" ADD CONSTRAINT "timesheet_reminders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_folders" ADD CONSTRAINT "admin_folders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_files" ADD CONSTRAINT "admin_files_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tasks" ADD CONSTRAINT "employee_tasks_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_groups" ADD CONSTRAINT "permission_groups_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: create the default agency and adopt all existing rows.
INSERT INTO "agencies" ("name", "slug", "status", "settings")
VALUES ('NV Best PCA', 'nvbest', 'active', '{}');

DO $$
DECLARE
  t text;
  default_agency int;
BEGIN
  SELECT id INTO default_agency FROM "agencies" WHERE slug = 'nvbest';
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('agencies', '_prisma_migrations')
  LOOP
    EXECUTE format('UPDATE %I SET agency_id = %s WHERE agency_id IS NULL', t, default_agency);
  END LOOP;
END $$;
