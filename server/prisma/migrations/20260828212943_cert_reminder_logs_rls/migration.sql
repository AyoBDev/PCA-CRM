-- cert_reminder_logs was created by 20260828212556_cert_reminder_automation with an agency_id
-- column + FK + index, but Prisma does not manage RLS, so it landed without the
-- ENABLE ROW LEVEL SECURITY + tenant_isolation policy that every other tenant table has.
-- The app_user connection tenantClient() runs as is NOBYPASSRLS with blanket grants — the RLS
-- policy is the only thing scoping it to one agency. Without this, cert_reminder_logs is
-- cross-tenant readable/writable (same class of gap previously found on shift_offers/shift_callouts
-- in 20260724095925_shift_offer_tables_agency_id_rls).

ALTER TABLE "cert_reminder_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cert_reminder_logs"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);
