-- Track the pipeline stage a lead was in right before conversion, so a
-- reverted conversion can restore it to where it was.
ALTER TABLE "leads"
    ADD COLUMN "pre_convert_status" TEXT NOT NULL DEFAULT '';
