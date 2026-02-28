-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "period_start" DATETIME,
    "period_end" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_payable" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payroll_visits" (
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_visits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "payroll_visits_run_id_idx" ON "payroll_visits"("run_id");
