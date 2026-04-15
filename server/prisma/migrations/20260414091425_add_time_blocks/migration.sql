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
    "adl_time_blocks" TEXT NOT NULL DEFAULT '[]',
    "iadl_activities" TEXT NOT NULL DEFAULT '{}',
    "iadl_time_in" TEXT,
    "iadl_time_out" TEXT,
    "iadl_hours" REAL NOT NULL DEFAULT 0,
    "iadl_pca_initials" TEXT NOT NULL DEFAULT '',
    "iadl_client_initials" TEXT NOT NULL DEFAULT '',
    "iadl_time_blocks" TEXT NOT NULL DEFAULT '[]',
    "respite_activities" TEXT NOT NULL DEFAULT '{}',
    "respite_time_in" TEXT,
    "respite_time_out" TEXT,
    "respite_hours" REAL NOT NULL DEFAULT 0,
    "respite_pca_initials" TEXT NOT NULL DEFAULT '',
    "respite_client_initials" TEXT NOT NULL DEFAULT '',
    "respite_time_blocks" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheet_entries" ("adl_activities", "adl_client_initials", "adl_hours", "adl_pca_initials", "adl_time_in", "adl_time_out", "date_of_service", "day_of_week", "iadl_activities", "iadl_client_initials", "iadl_hours", "iadl_pca_initials", "iadl_time_in", "iadl_time_out", "id", "respite_activities", "respite_client_initials", "respite_hours", "respite_pca_initials", "respite_time_in", "respite_time_out", "timesheet_id") SELECT "adl_activities", "adl_client_initials", "adl_hours", "adl_pca_initials", "adl_time_in", "adl_time_out", "date_of_service", "day_of_week", "iadl_activities", "iadl_client_initials", "iadl_hours", "iadl_pca_initials", "iadl_time_in", "iadl_time_out", "id", "respite_activities", "respite_client_initials", "respite_hours", "respite_pca_initials", "respite_time_in", "respite_time_out", "timesheet_id" FROM "timesheet_entries";
DROP TABLE "timesheet_entries";
ALTER TABLE "new_timesheet_entries" RENAME TO "timesheet_entries";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
