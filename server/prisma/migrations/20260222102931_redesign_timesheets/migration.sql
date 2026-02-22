/*
  Warnings:

  - You are about to drop the column `client_initials` on the `timesheet_entries` table. All the data in the column will be lost.
  - You are about to drop the column `hours` on the `timesheet_entries` table. All the data in the column will be lost.
  - You are about to drop the column `time_in` on the `timesheet_entries` table. All the data in the column will be lost.
  - You are about to drop the column `time_out` on the `timesheet_entries` table. All the data in the column will be lost.
  - You are about to drop the column `caregiver_name` on the `timesheets` table. All the data in the column will be lost.
  - You are about to drop the column `client_signature` on the `timesheets` table. All the data in the column will be lost.
  - Added the required column `pca_name` to the `timesheets` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheet_entries" ("day_of_week", "id", "timesheet_id") SELECT "day_of_week", "id", "timesheet_id" FROM "timesheet_entries";
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
    "recipient_name" TEXT NOT NULL DEFAULT '',
    "recipient_signature" TEXT NOT NULL DEFAULT '',
    "pca_signature" TEXT NOT NULL DEFAULT '',
    "supervisor_name" TEXT NOT NULL DEFAULT 'Sona Hakobyan',
    "completion_date" TEXT NOT NULL DEFAULT '',
    "submitted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheets" ("client_id", "created_at", "id", "pca_signature", "status", "submitted_at", "total_hours", "updated_at", "week_start") SELECT "client_id", "created_at", "id", "pca_signature", "status", "submitted_at", "total_hours", "updated_at", "week_start" FROM "timesheets";
DROP TABLE "timesheets";
ALTER TABLE "new_timesheets" RENAME TO "timesheets";
CREATE UNIQUE INDEX "timesheets_client_id_pca_name_week_start_key" ON "timesheets"("client_id", "pca_name", "week_start");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
