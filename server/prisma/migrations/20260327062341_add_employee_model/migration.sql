-- CreateTable
CREATE TABLE "employees" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedule_notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employee_id" INTEGER NOT NULL,
    "week_start" DATETIME NOT NULL,
    "method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmation_token" TEXT NOT NULL,
    "confirmed_at" DATETIME,
    "sent_at" DATETIME,
    "failure_reason" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_notifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "recurring_group_id" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shifts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shifts" ("client_id", "created_at", "employee_id", "employee_name", "end_time", "hours", "id", "notes", "recurring_group_id", "service_code", "shift_date", "start_time", "status", "units", "updated_at") SELECT "client_id", "created_at", "employee_id", "employee_name", "end_time", "hours", "id", "notes", "recurring_group_id", "service_code", "shift_date", "start_time", "status", "units", "updated_at" FROM "shifts";
DROP TABLE "shifts";
ALTER TABLE "new_shifts" RENAME TO "shifts";
CREATE INDEX "shifts_client_id_idx" ON "shifts"("client_id");
CREATE INDEX "shifts_employee_id_idx" ON "shifts"("employee_id");
CREATE INDEX "shifts_shift_date_idx" ON "shifts"("shift_date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_notifications_confirmation_token_key" ON "schedule_notifications"("confirmation_token");

-- CreateIndex
CREATE INDEX "schedule_notifications_employee_id_idx" ON "schedule_notifications"("employee_id");

-- CreateIndex
CREATE INDEX "schedule_notifications_week_start_idx" ON "schedule_notifications"("week_start");
