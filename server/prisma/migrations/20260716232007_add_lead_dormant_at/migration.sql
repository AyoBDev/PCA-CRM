-- Add dormantAt column + index to leads table for auto-dormancy feature
ALTER TABLE "leads" ADD COLUMN "dormant_at" TIMESTAMP(3);
CREATE INDEX "leads_dormant_at_idx" ON "leads"("dormant_at");
