-- AddColumn: createdBy on leads table
ALTER TABLE "leads" ADD COLUMN "created_by" TEXT NOT NULL DEFAULT '';
