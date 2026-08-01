-- Merging origin/main's PHI-encryption/lead-attachments/care-plan batch into
-- this branch surfaced one gap: lead_documents (added by main's
-- 20260801000000_add_lead_source_and_documents, after RLS was enabled on this
-- branch) landed without an agency_id column or a tenant_isolation policy, so
-- it was completely unprotected by RLS despite belonging to a per-agency
-- feature (schema.prisma requires agencyId on LeadDocument — see the Agency
-- back-relation and the model definition). Mirrors the shape of
-- 20260724095925_shift_offer_tables_agency_id_rls.
--
-- lead_documents was created in the same merge batch, so it is expected to be
-- empty in any environment that only just picked up main's migrations — the
-- backfill-from-parent step is defensive in case rows were created between
-- that migration landing and this one.

-- AlterTable: add nullable first so any existing rows can be backfilled
ALTER TABLE "lead_documents" ADD COLUMN "agency_id" INTEGER;

-- Backfill from the parent lead, which has always been agency-scoped
UPDATE "lead_documents" ld
SET "agency_id" = l."agency_id"
FROM "leads" l
WHERE l.id = ld."lead_id";

-- Now enforce NOT NULL + FK, matching every other tenant table
ALTER TABLE "lead_documents" ALTER COLUMN "agency_id" SET NOT NULL;

ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "lead_documents_agency_id_idx" ON "lead_documents"("agency_id");

-- Enable RLS, matching the tenant_isolation policy shape from 20260709205330_enable_rls
ALTER TABLE "lead_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lead_documents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);
