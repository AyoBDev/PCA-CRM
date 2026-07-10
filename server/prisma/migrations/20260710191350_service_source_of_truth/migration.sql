-- AlterTable
ALTER TABLE "services" ADD COLUMN     "account_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "enforce_auth_limit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "timesheet_section" TEXT NOT NULL DEFAULT '';
