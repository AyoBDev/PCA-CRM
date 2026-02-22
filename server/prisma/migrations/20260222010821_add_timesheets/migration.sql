-- CreateTable
CREATE TABLE "timesheets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "caregiver_name" TEXT NOT NULL,
    "week_start" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_hours" REAL NOT NULL DEFAULT 0,
    "client_signature" TEXT NOT NULL DEFAULT '',
    "pca_signature" TEXT NOT NULL DEFAULT '',
    "submitted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timesheet_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "time_in" TEXT,
    "time_out" TEXT,
    "hours" REAL NOT NULL DEFAULT 0,
    "client_initials" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_client_id_caregiver_name_week_start_key" ON "timesheets"("client_id", "caregiver_name", "week_start");
