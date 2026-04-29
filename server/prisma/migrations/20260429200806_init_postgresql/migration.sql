-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'pca',
    "phone" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_links" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_schedule_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_notifications" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmation_token" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "client_name" TEXT NOT NULL,
    "medicaid_id" TEXT NOT NULL DEFAULT '',
    "insurance_type" TEXT NOT NULL DEFAULT 'MEDICAID',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "gate_code" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "enabled_services" TEXT NOT NULL DEFAULT '["PAS","Homemaker"]',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorizations" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "service_category" TEXT NOT NULL DEFAULT '',
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL DEFAULT '',
    "authorized_units" INTEGER NOT NULL DEFAULT 0,
    "authorization_start_date" TIMESTAMP(3),
    "authorization_end_date" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#9E9E9E',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "client_phone" TEXT NOT NULL DEFAULT '',
    "client_id_number" TEXT NOT NULL DEFAULT '',
    "pca_name" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_pas_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_hm_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_respite_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipient_name" TEXT NOT NULL DEFAULT '',
    "recipient_signature" TEXT NOT NULL DEFAULT '',
    "pca_signature" TEXT NOT NULL DEFAULT '',
    "pca_full_name" TEXT NOT NULL DEFAULT '',
    "supervisor_name" TEXT NOT NULL DEFAULT 'Sona Hakobyan',
    "supervisor_signature" TEXT NOT NULL DEFAULT '',
    "completion_date" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" SERIAL NOT NULL,
    "timesheet_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "date_of_service" TEXT NOT NULL DEFAULT '',
    "adl_activities" TEXT NOT NULL DEFAULT '{}',
    "adl_time_in" TEXT,
    "adl_time_out" TEXT,
    "adl_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adl_pca_initials" TEXT NOT NULL DEFAULT '',
    "adl_client_initials" TEXT NOT NULL DEFAULT '',
    "adl_time_blocks" TEXT NOT NULL DEFAULT '[]',
    "iadl_activities" TEXT NOT NULL DEFAULT '{}',
    "iadl_time_in" TEXT,
    "iadl_time_out" TEXT,
    "iadl_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iadl_pca_initials" TEXT NOT NULL DEFAULT '',
    "iadl_client_initials" TEXT NOT NULL DEFAULT '',
    "iadl_time_blocks" TEXT NOT NULL DEFAULT '[]',
    "respite_activities" TEXT NOT NULL DEFAULT '{}',
    "respite_time_in" TEXT,
    "respite_time_out" TEXT,
    "respite_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "respite_pca_initials" TEXT NOT NULL DEFAULT '',
    "respite_client_initials" TEXT NOT NULL DEFAULT '',
    "respite_time_blocks" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "timesheet_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signing_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'processing',
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_payable" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "authorization_snapshot" TEXT NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_visits" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "client_name" TEXT NOT NULL DEFAULT '',
    "employee_name" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL DEFAULT '',
    "visit_date" TIMESTAMP(3),
    "call_in_raw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "call_out_raw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "call_hours_raw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visit_status" TEXT NOT NULL DEFAULT '',
    "units_raw" INTEGER NOT NULL DEFAULT 0,
    "service_code" TEXT NOT NULL DEFAULT '',
    "call_in_time" TEXT NOT NULL DEFAULT '',
    "call_out_time" TEXT NOT NULL DEFAULT '',
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "final_payable_units" INTEGER NOT NULL DEFAULT 0,
    "void_flag" BOOLEAN NOT NULL DEFAULT false,
    "void_reason" TEXT NOT NULL DEFAULT '',
    "overlap_id" TEXT NOT NULL DEFAULT '',
    "is_incomplete" BOOLEAN NOT NULL DEFAULT false,
    "is_unauthorized" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "merged_into" INTEGER,
    "early_call_in" BOOLEAN NOT NULL DEFAULT false,
    "late_call_out" BOOLEAN NOT NULL DEFAULT false,
    "next_day_call_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "service_code" TEXT NOT NULL,
    "shift_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "recurring_group_id" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "sandata_client_id" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "entity_name" TEXT NOT NULL DEFAULT '',
    "changes" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permanent_links" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "pca_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permanent_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_links_token_key" ON "employee_schedule_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_links_employee_id_key" ON "employee_schedule_links"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_notifications_confirmation_token_key" ON "schedule_notifications"("confirmation_token");

-- CreateIndex
CREATE INDEX "schedule_notifications_employee_id_idx" ON "schedule_notifications"("employee_id");

-- CreateIndex
CREATE INDEX "schedule_notifications_week_start_idx" ON "schedule_notifications"("week_start");

-- CreateIndex
CREATE INDEX "authorizations_client_id_idx" ON "authorizations"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_types_name_key" ON "insurance_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_client_id_pca_name_week_start_key" ON "timesheets"("client_id", "pca_name", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "signing_tokens_token_key" ON "signing_tokens"("token");

-- CreateIndex
CREATE INDEX "payroll_visits_run_id_idx" ON "payroll_visits"("run_id");

-- CreateIndex
CREATE INDEX "shifts_client_id_idx" ON "shifts"("client_id");

-- CreateIndex
CREATE INDEX "shifts_employee_id_idx" ON "shifts"("employee_id");

-- CreateIndex
CREATE INDEX "shifts_shift_date_idx" ON "shifts"("shift_date");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_created_at_idx" ON "audit_logs"("entity_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permanent_links_token_key" ON "permanent_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "permanent_links_client_id_pca_name_key" ON "permanent_links"("client_id", "pca_name");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_links" ADD CONSTRAINT "employee_schedule_links_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_notifications" ADD CONSTRAINT "schedule_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_tokens" ADD CONSTRAINT "signing_tokens_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_visits" ADD CONSTRAINT "payroll_visits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permanent_links" ADD CONSTRAINT "permanent_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
