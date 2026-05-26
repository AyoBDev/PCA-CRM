-- AlterTable
ALTER TABLE "employees" ADD COLUMN "dob" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ADD COLUMN "client_assignment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ADD COLUMN "npi" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ADD COLUMN "id_exp_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "first_assignment_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "tb_due_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "tb_type" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ADD COLUMN "cpr_due_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "training_due_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "background_check_due_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "discharge_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "employees" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ADD COLUMN "critical" BOOLEAN NOT NULL DEFAULT false;
