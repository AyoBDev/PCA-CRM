-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_payroll_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "period_start" DATETIME,
    "period_end" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_payable" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "authorization_snapshot" TEXT NOT NULL DEFAULT '{}',
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_payroll_runs" ("archived_at", "created_at", "error_message", "file_name", "id", "name", "period_end", "period_start", "status", "total_payable", "total_visits", "updated_at") SELECT "archived_at", "created_at", "error_message", "file_name", "id", "name", "period_end", "period_start", "status", "total_payable", "total_visits", "updated_at" FROM "payroll_runs";
DROP TABLE "payroll_runs";
ALTER TABLE "new_payroll_runs" RENAME TO "payroll_runs";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
