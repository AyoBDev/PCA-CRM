# Data Isolation Design

*The answer to the buyer question: "How is our data separated from your other
customers' data?"*

## The short version

Every customer (agency) is a **tenant** in a shared PostgreSQL database, and their
data is isolated by **PostgreSQL Row-Level Security (RLS)** keyed on `agency_id`.
Every tenant table carries a required `agency_id` column with an RLS policy that
makes a row visible **only** when it matches the agency of the current request.
The application connects for all tenant traffic as a database role that **cannot
bypass RLS**, so isolation is enforced by the database itself — not by application
code remembering to add a `WHERE agency_id = ...` clause. A missing filter fails
closed (no rows), never open (another tenant's rows).

## How it works

1. **Request → agency.** Each request's `Host` header resolves to an agency
   (`resolveAgency.js`); a JWT is bound to its agency's subdomain and is rejected on
   any other agency's host. Superadmin/platform traffic is separate (the reserved
   `admin.<BASE_DOMAIN>` host).

2. **Agency → database session.** Tenant middleware opens the request's database
   work as the `app_user` role and sets the agency for that transaction:
   `SELECT set_config('app.agency_id', <agencyId>, true)` (transaction-scoped). All
   queries in the request run through this tenant client (`tenantPrisma.js`).

3. **The database enforces it.** Every tenant table has:
   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "<table>"
     USING       (agency_id = current_setting('app.agency_id', true)::int)
     WITH CHECK  (agency_id = current_setting('app.agency_id', true)::int);
   ```
   `USING` filters reads (and the rows an UPDATE/DELETE can touch); `WITH CHECK`
   blocks writes that would create or move a row into another agency. `app_user` is
   created `NOBYPASSRLS`, so these policies apply to every tenant query with no
   exception.

## Why this is trustworthy, not just convenient

- **Fails closed by construction.** If a query forgets its tenant filter, RLS
  returns zero rows — it cannot leak another agency's data. The database is the
  backstop, so a single application bug can't cross the boundary.
- **One enforcement point.** Isolation lives in the data layer (RLS policies +
  the `app_user` connection), not re-implemented per controller. Adding a new tenant
  table means adding `agency_id` + the standard policy, not auditing every query.
- **Least-privilege connection.** Tenant traffic uses a role that literally cannot
  see across agencies. The privileged "owner" connection that *can* bypass RLS is
  **allowlist-only** — used solely for platform-level operations (auth/tenant
  middleware, the platform console, backups, audit writes, cron jobs) — and that
  allowlist is enforced by an automated test that fails the build if any other file
  imports it.

## Per-tenant export and deletion

- **Export:** a tenant's data can be exported on its own via the schema-driven
  backup export (`GET /api/backup/export`, per-agency scope), which walks that
  agency's rows table by table. Single-use bearer-token tables are excluded by
  design.
- **Deletion:** every tenant table's `agency_id` foreign key cascades, so removing
  an agency removes exactly its data and nothing else — we can hand a customer their
  data, or destroy it, without touching any other agency.

## Honest scope notes

- This is a **shared-schema, single-database** design with row-level isolation — not
  per-tenant databases. That's a deliberate choice: RLS gives a database-enforced
  guarantee with far less operational overhead than a database-per-tenant fleet, and
  a well-argued shared-schema design with row-level guarantees is what enterprise
  buyers accept. Per-tenant databases would be the next step only if a specific
  customer contractually requires physical separation.
- RLS is **not** set to `FORCE ROW LEVEL SECURITY`, because the design intentionally
  relies on a separate allowlisted owner connection (which bypasses RLS) for
  platform-level work. Tenant safety comes from *tenant traffic never using that
  connection* — enforced by the `app_user` role and the import-allowlist test — not
  from forcing RLS on the owner too.

## Where to look in the code

| Concern | File |
|---------|------|
| Host → agency resolution | `server/src/middleware/resolveAgency.js` |
| Tenant DB client + `set_config('app.agency_id')` | `server/src/lib/tenantPrisma.js` |
| Request-scoped tenant context | `server/src/lib/tenantContext.js`, `tenantMiddleware.js` |
| `app_user` role (NOBYPASSRLS) provisioning | `server/prisma/setup-app-role.js` |
| RLS policies (`tenant_isolation`) | `server/prisma/migrations/*_enable_rls/` and later tenancy migrations |
| Owner-connection allowlist guard | `server/src/__tests__/prismaImportGuard.test.js` |
| Per-tenant backup/export | `server/src/controllers/backupController.js` |
