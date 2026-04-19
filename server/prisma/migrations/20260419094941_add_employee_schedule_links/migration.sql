-- CreateTable
CREATE TABLE "employee_schedule_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_schedule_links_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_links_token_key" ON "employee_schedule_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_links_employee_id_key" ON "employee_schedule_links"("employee_id");
