-- Merging origin/main's Employee Portal v3 (onboarding requirement ledger,
-- certifications overhaul) and visit-catalog management batches surfaced
-- seven tables added by main after RLS was enabled on this branch, none of
-- them with an agency_id column or a tenant_isolation policy:
--   document_types, cert_types, policy_documents   (20260804142607, reference catalogs)
--   employee_requirements, employee_documents, employee_policy_acks
--                                                   (20260804142607, per-employee ledger)
--   lead_contacts                                  (20260802204807, per-lead follow-up log)
-- schema.prisma requires agencyId on every one of these (see the Agency
-- back-relation additions). Mirrors the shape of
-- 20260724095925_shift_offer_tables_agency_id_rls / 20260801010000_merge_main_tenancy.

-- ── lead_contacts: backfill from the parent lead, which has always been agency-scoped ──
ALTER TABLE "lead_contacts" ADD COLUMN "agency_id" INTEGER;

UPDATE "lead_contacts" lc
SET "agency_id" = l."agency_id"
FROM "leads" l
WHERE l.id = lc."lead_id";

ALTER TABLE "lead_contacts" ALTER COLUMN "agency_id" SET NOT NULL;

ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "lead_contacts_agency_id_idx" ON "lead_contacts"("agency_id");

ALTER TABLE "lead_contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lead_contacts"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

-- ── employee_requirements / employee_documents / employee_policy_acks:
--    backfill from the parent employee, which has always been agency-scoped ──
ALTER TABLE "employee_requirements" ADD COLUMN "agency_id" INTEGER;
ALTER TABLE "employee_documents" ADD COLUMN "agency_id" INTEGER;
ALTER TABLE "employee_policy_acks" ADD COLUMN "agency_id" INTEGER;

UPDATE "employee_requirements" er
SET "agency_id" = e."agency_id"
FROM "employees" e
WHERE e.id = er."employee_id";

UPDATE "employee_documents" ed
SET "agency_id" = e."agency_id"
FROM "employees" e
WHERE e.id = ed."employee_id";

UPDATE "employee_policy_acks" epa
SET "agency_id" = e."agency_id"
FROM "employees" e
WHERE e.id = epa."employee_id";

ALTER TABLE "employee_requirements" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "employee_documents" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "employee_policy_acks" ALTER COLUMN "agency_id" SET NOT NULL;

ALTER TABLE "employee_requirements" ADD CONSTRAINT "employee_requirements_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_policy_acks" ADD CONSTRAINT "employee_policy_acks_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "employee_requirements_agency_id_idx" ON "employee_requirements"("agency_id");
CREATE INDEX "employee_documents_agency_id_idx" ON "employee_documents"("agency_id");
CREATE INDEX "employee_policy_acks_agency_id_idx" ON "employee_policy_acks"("agency_id");

ALTER TABLE "employee_requirements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_requirements"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_documents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "employee_policy_acks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_policy_acks"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

-- ── document_types / cert_types / policy_documents: pure reference catalogs
--    with no per-row tenant lineage (no employee_id/lead_id to backfill from).
--    They predate multi-tenancy in this codebase, so any pre-existing rows are
--    assigned to the oldest agency (agency #1, the historical single tenant);
--    every agency created from this point forward gets its own catalog rows
--    seeded by prisma/seed-requirements.js. The old global-unique `key` index
--    is replaced with an (agency_id, key) composite, matching services'
--    (agency_id, code) shape (20260724095926_drop_global_service_code_unique). ──
ALTER TABLE "document_types" ADD COLUMN "agency_id" INTEGER;
ALTER TABLE "cert_types" ADD COLUMN "agency_id" INTEGER;
ALTER TABLE "policy_documents" ADD COLUMN "agency_id" INTEGER;

UPDATE "document_types" SET "agency_id" = (SELECT id FROM "agencies" ORDER BY id ASC LIMIT 1);
UPDATE "cert_types" SET "agency_id" = (SELECT id FROM "agencies" ORDER BY id ASC LIMIT 1);
UPDATE "policy_documents" SET "agency_id" = (SELECT id FROM "agencies" ORDER BY id ASC LIMIT 1);

ALTER TABLE "document_types" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "cert_types" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "policy_documents" ALTER COLUMN "agency_id" SET NOT NULL;

ALTER TABLE "document_types" ADD CONSTRAINT "document_types_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cert_types" ADD CONSTRAINT "cert_types_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "document_types_key_key";
DROP INDEX "cert_types_key_key";
DROP INDEX "policy_documents_key_key";

CREATE UNIQUE INDEX "document_types_agency_id_key_key" ON "document_types"("agency_id", "key");
CREATE UNIQUE INDEX "cert_types_agency_id_key_key" ON "cert_types"("agency_id", "key");
CREATE UNIQUE INDEX "policy_documents_agency_id_key_key" ON "policy_documents"("agency_id", "key");

CREATE INDEX "document_types_agency_id_idx" ON "document_types"("agency_id");
CREATE INDEX "cert_types_agency_id_idx" ON "cert_types"("agency_id");
CREATE INDEX "policy_documents_agency_id_idx" ON "policy_documents"("agency_id");

ALTER TABLE "document_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_types"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "cert_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cert_types"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);

ALTER TABLE "policy_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "policy_documents"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);
