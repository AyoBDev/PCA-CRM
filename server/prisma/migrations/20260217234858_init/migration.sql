-- CreateTable
CREATE TABLE "clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "authorizations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "client_id" INTEGER NOT NULL,
    "service_code" TEXT NOT NULL,
    "authorization_end_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "authorizations_client_id_idx" ON "authorizations"("client_id");
