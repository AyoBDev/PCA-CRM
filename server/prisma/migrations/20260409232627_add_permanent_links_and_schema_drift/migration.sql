-- CreateTable
CREATE TABLE "permanent_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "client_id" INTEGER NOT NULL,
    "pca_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permanent_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_name" TEXT NOT NULL,
    "medicaid_id" TEXT NOT NULL DEFAULT '',
    "insurance_type" TEXT NOT NULL DEFAULT 'MEDICAID',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "gate_code" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "enabled_services" TEXT NOT NULL DEFAULT '["PAS","Homemaker"]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_clients" ("address", "client_name", "created_at", "gate_code", "id", "insurance_type", "medicaid_id", "notes", "phone", "updated_at") SELECT "address", "client_name", "created_at", "gate_code", "id", "insurance_type", "medicaid_id", "notes", "phone", "updated_at" FROM "clients";
DROP TABLE "clients";
ALTER TABLE "new_clients" RENAME TO "clients";
CREATE TABLE "new_shifts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "service_code" TEXT NOT NULL,
    "shift_date" DATETIME NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "hours" REAL NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "recurring_group_id" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "sandata_client_id" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shifts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_shifts" ("account_number", "client_id", "created_at", "employee_id", "end_time", "hours", "id", "notes", "recurring_group_id", "sandata_client_id", "service_code", "shift_date", "start_time", "status", "units", "updated_at") SELECT "account_number", "client_id", "created_at", "employee_id", "end_time", "hours", "id", "notes", "recurring_group_id", "sandata_client_id", "service_code", "shift_date", "start_time", "status", "units", "updated_at" FROM "shifts";
DROP TABLE "shifts";
ALTER TABLE "new_shifts" RENAME TO "shifts";
CREATE INDEX "shifts_client_id_idx" ON "shifts"("client_id");
CREATE INDEX "shifts_employee_id_idx" ON "shifts"("employee_id");
CREATE INDEX "shifts_shift_date_idx" ON "shifts"("shift_date");
CREATE TABLE "new_timesheet_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timesheet_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "date_of_service" TEXT NOT NULL DEFAULT '',
    "adl_activities" TEXT NOT NULL DEFAULT '{}',
    "adl_time_in" TEXT,
    "adl_time_out" TEXT,
    "adl_hours" REAL NOT NULL DEFAULT 0,
    "adl_pca_initials" TEXT NOT NULL DEFAULT '',
    "adl_client_initials" TEXT NOT NULL DEFAULT '',
    "iadl_activities" TEXT NOT NULL DEFAULT '{}',
    "iadl_time_in" TEXT,
    "iadl_time_out" TEXT,
    "iadl_hours" REAL NOT NULL DEFAULT 0,
    "iadl_pca_initials" TEXT NOT NULL DEFAULT '',
    "iadl_client_initials" TEXT NOT NULL DEFAULT '',
    "respite_activities" TEXT NOT NULL DEFAULT '{}',
    "respite_time_in" TEXT,
    "respite_time_out" TEXT,
    "respite_hours" REAL NOT NULL DEFAULT 0,
    "respite_pca_initials" TEXT NOT NULL DEFAULT '',
    "respite_client_initials" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheet_entries" ("adl_activities", "adl_client_initials", "adl_hours", "adl_pca_initials", "adl_time_in", "adl_time_out", "date_of_service", "day_of_week", "iadl_activities", "iadl_client_initials", "iadl_hours", "iadl_pca_initials", "iadl_time_in", "iadl_time_out", "id", "timesheet_id") SELECT "adl_activities", "adl_client_initials", "adl_hours", "adl_pca_initials", "adl_time_in", "adl_time_out", "date_of_service", "day_of_week", "iadl_activities", "iadl_client_initials", "iadl_hours", "iadl_pca_initials", "iadl_time_in", "iadl_time_out", "id", "timesheet_id" FROM "timesheet_entries";
DROP TABLE "timesheet_entries";
ALTER TABLE "new_timesheet_entries" RENAME TO "timesheet_entries";
CREATE TABLE "new_timesheets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "client_phone" TEXT NOT NULL DEFAULT '',
    "client_id_number" TEXT NOT NULL DEFAULT '',
    "pca_name" TEXT NOT NULL,
    "week_start" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_pas_hours" REAL NOT NULL DEFAULT 0,
    "total_hm_hours" REAL NOT NULL DEFAULT 0,
    "total_hours" REAL NOT NULL DEFAULT 0,
    "total_respite_hours" REAL NOT NULL DEFAULT 0,
    "recipient_name" TEXT NOT NULL DEFAULT '',
    "recipient_signature" TEXT NOT NULL DEFAULT '',
    "pca_signature" TEXT NOT NULL DEFAULT '',
    "pca_full_name" TEXT NOT NULL DEFAULT '',
    "supervisor_name" TEXT NOT NULL DEFAULT 'Sona Hakobyan',
    "supervisor_signature" TEXT NOT NULL DEFAULT '',
    "completion_date" TEXT NOT NULL DEFAULT '',
    "submitted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheets" ("client_id", "client_id_number", "client_phone", "completion_date", "created_at", "id", "pca_full_name", "pca_name", "pca_signature", "recipient_name", "recipient_signature", "status", "submitted_at", "supervisor_name", "supervisor_signature", "total_hm_hours", "total_hours", "total_pas_hours", "updated_at", "week_start") SELECT "client_id", "client_id_number", "client_phone", "completion_date", "created_at", "id", "pca_full_name", "pca_name", "pca_signature", "recipient_name", "recipient_signature", "status", "submitted_at", "supervisor_name", "supervisor_signature", "total_hm_hours", "total_hours", "total_pas_hours", "updated_at", "week_start" FROM "timesheets";
DROP TABLE "timesheets";
ALTER TABLE "new_timesheets" RENAME TO "timesheets";
CREATE UNIQUE INDEX "timesheets_client_id_pca_name_week_start_key" ON "timesheets"("client_id", "pca_name", "week_start");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "permanent_links_token_key" ON "permanent_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "permanent_links_client_id_pca_name_key" ON "permanent_links"("client_id", "pca_name");
