-- Authorization lifecycle: renewal chain links, inactive close-out fields,
-- and a normalization of the retired 'pending' status to 'active'.
ALTER TABLE "authorizations"
    ADD COLUMN "renewed_from_id" INTEGER,
    ADD COLUMN "renewed_to_id" INTEGER,
    ADD COLUMN "inactive_reason" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "inactive_note" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "closed_at" TIMESTAMP(3);

-- 'pending' is retired; a pending auth is functionally active.
UPDATE "authorizations" SET "manual_status" = 'active' WHERE "manual_status" = 'pending';
