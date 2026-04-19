-- AlterTable
ALTER TABLE "clients" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "insurance_types" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "services" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "archived_at" DATETIME;
