ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "admin_event_seen" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "admin_event_seen"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "password_reset_tokens"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "onboarding_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "onboarding_tokens"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_availability" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_availability"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employees"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_certifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_certifications"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "certification_uploads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "certification_uploads"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_schedule_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_schedule_links"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "schedule_notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schedule_notifications"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clients"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "client_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "client_notes"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "client_care_team" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "client_care_team"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "client_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "client_documents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "hospital_visits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "hospital_visits"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "incidents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "client_activities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "client_activities"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "authorizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "authorizations"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leads"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "insurance_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "insurance_types"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "services"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "timesheets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timesheets"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "timesheet_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timesheet_entries"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "signing_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "signing_tokens"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_runs"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "payroll_visits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_visits"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "payroll_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_profiles"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "pay_receipts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pay_receipts"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shifts"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "permanent_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "permanent_links"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "authorization_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "authorization_documents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "bulk_edit_batches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bulk_edit_batches"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "timesheet_reminders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timesheet_reminders"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tasks"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "workflow_triggers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow_triggers"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "task_reminders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "task_reminders"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "admin_folders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "admin_folders"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "admin_files" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "admin_files"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "availability_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "availability_requests"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "time_off_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "time_off_requests"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_tasks"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "push_subscriptions"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "permission_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "permission_groups"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);
