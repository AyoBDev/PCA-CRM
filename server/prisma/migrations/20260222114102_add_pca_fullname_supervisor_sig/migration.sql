-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "pca_full_name" TEXT NOT NULL DEFAULT '',
    "supervisor_name" TEXT NOT NULL DEFAULT 'Sona Hakobyan',
    "supervisor_signature" TEXT NOT NULL DEFAULT '',
    "completion_date" TEXT NOT NULL DEFAULT '',
    "submitted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "timesheets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_timesheets" ("client_id", "client_id_number", "client_phone", "completion_date", "created_at", "id", "pca_name", "pca_signature", "recipient_name", "recipient_signature", "status", "submitted_at", "supervisor_name", "total_hm_hours", "total_hours", "total_pas_hours", "updated_at", "week_start") SELECT "client_id", "client_id_number", "client_phone", "completion_date", "created_at", "id", "pca_name", "pca_signature", "recipient_name", "recipient_signature", "status", "submitted_at", "supervisor_name", "total_hm_hours", "total_hours", "total_pas_hours", "updated_at", "week_start" FROM "timesheets";
DROP TABLE "timesheets";
ALTER TABLE "new_timesheets" RENAME TO "timesheets";
CREATE UNIQUE INDEX "timesheets_client_id_pca_name_week_start_key" ON "timesheets"("client_id", "pca_name", "week_start");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
