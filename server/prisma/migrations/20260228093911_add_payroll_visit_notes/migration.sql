-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_payroll_visits" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "run_id" INTEGER NOT NULL,
    "client_name" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "visit_date" DATETIME NOT NULL,
    "call_in_raw" REAL NOT NULL,
    "call_out_raw" REAL NOT NULL,
    "call_hours_raw" REAL NOT NULL DEFAULT 0,
    "visit_status" TEXT NOT NULL,
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
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_visits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_payroll_visits" ("call_hours_raw", "call_in_raw", "call_in_time", "call_out_raw", "call_out_time", "client_name", "created_at", "duration_minutes", "employee_name", "final_payable_units", "id", "is_incomplete", "is_unauthorized", "overlap_id", "run_id", "service", "service_code", "units_raw", "visit_date", "visit_status", "void_flag", "void_reason") SELECT "call_hours_raw", "call_in_raw", "call_in_time", "call_out_raw", "call_out_time", "client_name", "created_at", "duration_minutes", "employee_name", "final_payable_units", "id", "is_incomplete", "is_unauthorized", "overlap_id", "run_id", "service", "service_code", "units_raw", "visit_date", "visit_status", "void_flag", "void_reason" FROM "payroll_visits";
DROP TABLE "payroll_visits";
ALTER TABLE "new_payroll_visits" RENAME TO "payroll_visits";
CREATE INDEX "payroll_visits_run_id_idx" ON "payroll_visits"("run_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
