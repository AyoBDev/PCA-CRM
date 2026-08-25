-- shift_callouts and shift_offers were added by 20260723130304_add_geocoding_and_shift_offers
-- (main) after RLS was enabled by 20260709205330_enable_rls (this branch). That migration
-- landed without an agency_id column or a tenant_isolation policy on either table, so both
-- tables were completely unprotected by RLS despite belonging to a per-agency feature
-- (schema.prisma has always required agencyId on Shift/ShiftCallout/ShiftOffer). Backfill the
-- column from the parent shift, then lock it down the same way every other tenant table is.

-- AlterTable: add nullable first so existing rows (if any) can be backfilled
ALTER TABLE "shift_callouts" ADD COLUMN "agency_id" INTEGER;
ALTER TABLE "shift_offers" ADD COLUMN "agency_id" INTEGER;

-- Backfill from the parent shift, which has always been agency-scoped
UPDATE "shift_callouts" sc
SET "agency_id" = s."agency_id"
FROM "shifts" s
WHERE s.id = sc."shift_id";

UPDATE "shift_offers" so
SET "agency_id" = s."agency_id"
FROM "shifts" s
WHERE s.id = so."shift_id";

-- Now enforce NOT NULL + FK, matching every other tenant table
ALTER TABLE "shift_callouts" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "shift_offers" ALTER COLUMN "agency_id" SET NOT NULL;

ALTER TABLE "shift_callouts" ADD CONSTRAINT "shift_callouts_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "shift_callouts_agency_id_idx" ON "shift_callouts"("agency_id");
CREATE INDEX "shift_offers_agency_id_idx" ON "shift_offers"("agency_id");

-- Enable RLS, matching the tenant_isolation policy shape from 20260709205330_enable_rls
ALTER TABLE "shift_callouts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shift_callouts"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "shift_offers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shift_offers"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);
