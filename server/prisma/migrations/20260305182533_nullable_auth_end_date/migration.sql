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
    "authorization_end_date" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_authorizations" ("authorization_end_date", "authorization_start_date", "authorized_units", "client_id", "created_at", "id", "notes", "service_category", "service_code", "service_name", "updated_at") SELECT "authorization_end_date", "authorization_start_date", "authorized_units", "client_id", "created_at", "id", "notes", "service_category", "service_code", "service_name", "updated_at" FROM "authorizations";
DROP TABLE "authorizations";
ALTER TABLE "new_authorizations" RENAME TO "authorizations";
CREATE INDEX "authorizations_client_id_idx" ON "authorizations"("client_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
