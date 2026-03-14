-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shifts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "employee_name" TEXT NOT NULL DEFAULT '',
    "service_code" TEXT NOT NULL,
    "shift_date" DATETIME NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "hours" REAL NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shifts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shifts" ("client_id", "created_at", "employee_id", "end_time", "hours", "id", "notes", "service_code", "shift_date", "start_time", "status", "units", "updated_at") SELECT "client_id", "created_at", "employee_id", "end_time", "hours", "id", "notes", "service_code", "shift_date", "start_time", "status", "units", "updated_at" FROM "shifts";
DROP TABLE "shifts";
ALTER TABLE "new_shifts" RENAME TO "shifts";
CREATE INDEX "shifts_client_id_idx" ON "shifts"("client_id");
CREATE INDEX "shifts_employee_id_idx" ON "shifts"("employee_id");
CREATE INDEX "shifts_shift_date_idx" ON "shifts"("shift_date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
