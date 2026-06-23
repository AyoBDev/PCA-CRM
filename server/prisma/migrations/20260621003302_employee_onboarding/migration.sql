/*
  Warnings:

  - You are about to drop the `admin_files` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `admin_folders` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "admin_files" DROP CONSTRAINT "admin_files_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "admin_files" DROP CONSTRAINT "admin_files_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "admin_folders" DROP CONSTRAINT "admin_folders_parent_id_fkey";

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "onboarding_status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- DropTable
DROP TABLE "admin_files";

-- DropTable
DROP TABLE "admin_folders";

-- CreateTable
CREATE TABLE "onboarding_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_availability" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "available_from" TIMESTAMP(3) NOT NULL,
    "available_until" TIMESTAMP(3),
    "weekly_schedule" JSONB NOT NULL,
    "max_hours_per_week" INTEGER NOT NULL,
    "max_concurrent_clients" INTEGER NOT NULL,
    "max_travel_distance" INTEGER NOT NULL,
    "transportation" TEXT NOT NULL,
    "holiday_availability" JSONB NOT NULL,
    "blackout_dates" JSONB NOT NULL,
    "initial_time_off" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tokens_token_key" ON "onboarding_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tokens_employee_id_key" ON "onboarding_tokens"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_availability_employee_id_key" ON "employee_availability"("employee_id");

-- AddForeignKey
ALTER TABLE "onboarding_tokens" ADD CONSTRAINT "onboarding_tokens_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
