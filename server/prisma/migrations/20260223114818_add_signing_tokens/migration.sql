-- CreateTable
CREATE TABLE "signing_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "timesheet_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signing_tokens_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "signing_tokens_token_key" ON "signing_tokens"("token");
