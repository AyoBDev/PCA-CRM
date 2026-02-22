-- CreateTable
CREATE TABLE "services" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");
