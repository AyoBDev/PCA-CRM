-- Add signature-binding integrity hash columns to timesheets
ALTER TABLE "timesheets" ADD COLUMN "signed_payload_hash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "timesheets" ADD COLUMN "signatures_hash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "timesheets" ADD COLUMN "hashed_at" TIMESTAMP(3);
