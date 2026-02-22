-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_authorizations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "service_category" TEXT NOT NULL DEFAULT '',
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL DEFAULT '',
    "authorized_units" INTEGER NOT NULL DEFAULT 0,
    "authorization_start_date" DATETIME,
    "authorization_end_date" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_authorizations" ("authorization_end_date", "client_id", "created_at", "id", "service_code", "updated_at") SELECT "authorization_end_date", "client_id", "created_at", "id", "service_code", "updated_at" FROM "authorizations";
DROP TABLE "authorizations";
ALTER TABLE "new_authorizations" RENAME TO "authorizations";
CREATE INDEX "authorizations_client_id_idx" ON "authorizations"("client_id");
CREATE TABLE "new_clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_name" TEXT NOT NULL,
    "medicaid_id" TEXT NOT NULL DEFAULT '',
    "insurance_type" TEXT NOT NULL DEFAULT 'MEDICAID',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_clients" ("client_name", "created_at", "id", "updated_at") SELECT "client_name", "created_at", "id", "updated_at" FROM "clients";
DROP TABLE "clients";
ALTER TABLE "new_clients" RENAME TO "clients";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
