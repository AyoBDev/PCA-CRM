# Multi-Tenancy Foundation — Design

**Date:** 2026-07-09
**Status:** Approved (brainstorming session)
**Scope:** Agency (tenant) model, Postgres RLS enforcement, subdomain routing, platform super-admin console, data migration. This is the first of three scalability workstreams; server-side pagination and the Redis Socket.IO adapter are explicitly out of scope and get their own specs.

## Goals

- Position the app for SaaS sales to multiple PCA agencies while the schema is still cheap to change.
- Hard tenant isolation for PHI-adjacent data (Medicaid IDs, SSNs): enforced by Postgres row-level security, not just application code.
- Each agency operates on its own subdomain (`acme.<BASE_DOMAIN>`); emails unique per agency.
- A platform super-admin provisions and supports agencies in-app.
- Existing production data migrates losslessly into "agency #1" with zero behavior change for current users.

## Non-Goals (later specs)

- Server-side pagination / query indexes beyond tenancy indexes.
- Redis adapter for Socket.IO (multi-node scaling).
- Billing, plans, per-agency branding/theming.
- Users belonging to multiple agencies (one user → exactly one agency, except superadmins who belong to none).

## Decisions Made

| Question | Decision |
|---|---|
| Isolation model | Shared DB, `agency_id` column on every tenant table, **Postgres RLS from day one** |
| Enforcement mechanism | Prisma client extension wrapping every query in a transaction with `SET LOCAL app.agency_id`; RLS policies check `current_setting('app.agency_id')`. Explicit `agencyId` stamped on writes (defense in two layers). |
| Platform operator | New `superadmin` role, `agencyId = null`, apex-domain-only |
| Reference data (InsuranceTypes, Services, default folders) | Per-agency, seeded from defaults at agency creation |
| Tenant resolution | Subdomain per agency (`slug`), Host-header middleware; JWT bound to its agency's subdomain |

## 1. Data Model

### New model

```prisma
model Agency {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique          // subdomain
  status    String   @default("active") // active | suspended
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  // relations to all tenant models
  @@map("agencies")
}
```

### agencyId everywhere, denormalized

All ~45 tenant-owned models get `agencyId Int` + FK + `@@index([agencyId])` — **including child tables** (`TimesheetEntry`, `Message`, `PayrollVisit`, `authorization_documents`, etc.) that could derive it from a parent. Rationale: RLS needs a policy per table; a local column makes every policy the identical one-liner instead of a join to the parent. Drift is impossible because the tenant-scoped client stamps `agencyId` on every create and RLS `WITH CHECK` verifies it.

**Exceptions:**
- `User.agencyId Int?` — nullable; null **only** for `superadmin`.
- `Agency` itself and `_prisma_migrations` — no column.

### Unique-constraint changes

| Constraint today | Becomes |
|---|---|
| `User.email @unique` | `@@unique([agencyId, email])` + partial unique index on `email WHERE agency_id IS NULL` (superadmins) |
| `InsuranceType.name @unique` | `@@unique([agencyId, name])` |
| `Service.code @unique` | `@@unique([agencyId, code])` |
| `PermissionGroup.name @unique` | `@@unique([agencyId, name])` |
| All public tokens (`PermanentLink.token`, `SigningToken.token`, `EmployeeScheduleLink.token`, `OnboardingToken.token`, `PasswordResetToken.token`, `ScheduleNotification.confirmationToken`) | **Unchanged — globally unique.** Token lookup is how public routes discover the agency. |
| Parent-scoped uniques (`Timesheet [clientId, pcaName, weekStart]`, `AdminFolder [parentId, name]`, `AdminFile [folderId, name]`, `Conversation.employeeId`, etc.) | Unchanged — parent FK implies agency. |

### Roles

`role` gains `superadmin`. Existing `admin` / `user` / `pca` keep their meaning *within* an agency.

## 2. Enforcement — RLS + Tenant-Scoped Prisma Client

### Database side

- One migration enables `ROW LEVEL SECURITY` on every tenant table with two policies each:
  - `USING (agency_id = current_setting('app.agency_id', true)::int)` (reads)
  - same expression as `WITH CHECK` (writes)
- New Postgres role `app_user` **without** `BYPASSRLS`; the app's runtime `DATABASE_URL` uses it. Migrations, seeding, and the system client use the owner role (Railway default), which bypasses policies as table owner.
- `current_setting(..., true)` returns NULL when unset → query matches nothing → **fails closed**.

### App side — `server/src/lib/prisma.js` exports two clients

Two connection URLs: `DATABASE_URL` (owner role — migrations, seeding, system client) and `APP_DATABASE_URL` (`app_user` role — all tenant traffic).

- **`systemPrisma`** — today's singleton, owner role (`DATABASE_URL`). Allowed only in: seeding/migrations, login + tenant resolution, public-token resolvers, superadmin (`/api/platform`) endpoints. Every use is an explicit, greppable choice.
- **`tenantClient(agencyId)`** — built by `$extends` on an internal base client connected via `APP_DATABASE_URL` (never exported raw). The extension:
  1. routes every operation through `$transaction`, executing `SET LOCAL app.agency_id = <id>` first;
  2. injects `agencyId` into `create` / `createMany` / `upsert` data automatically;
  3. is cached per `agencyId` (stateless config, not a connection).

### Request flow

`authenticate()` → new `tenantMiddleware`: reads `agencyId` from the JWT, verifies the agency exists and is `active`, verifies it matches the subdomain's resolved agency, sets `req.db = tenantClient(agencyId)`. Controllers change `prisma.` → `req.db.` (mechanical sweep across all controllers/services on tenant paths).

An ESLint `no-restricted-imports` rule bans importing `lib/prisma`'s system client outside the allowlisted files.

### Interactions with existing subsystems

- **Audit logging:** `AuditLog` rows carry `agencyId`; `audit.logAction()` picks it up from the request context. Stays fire-and-forget. History page is automatically tenant-scoped via RLS.
- **Socket.IO:** handshake already verifies the JWT; it additionally validates the Origin subdomain against the token's agency and scopes rooms as `agency:{id}:employee:{eid}` / `agency:{id}:office`. DB access inside socket handlers uses `tenantClient(agencyId)`.
- **Raw SQL:** all `$queryRaw` / `$executeRaw` call sites are audited during implementation and moved onto the scoped client. `SET LOCAL` covers raw SQL in the same transaction, so RLS still applies.

### Accepted trade-off

Every tenant query runs in an interactive transaction (one extra round-trip). Negligible at current volume; escape hatch is batching reads per request if it ever matters.

## 3. Subdomains, Auth, Public Routes, Super-Admin

### Subdomain resolution

- `resolveAgency` middleware parses `Host`: `acme.<BASE_DOMAIN>` → `Agency` lookup by `slug`, cached in-memory with a short TTL (~60s, so suspensions propagate quickly). Sets `req.agency`.
- `BASE_DOMAIN` from env. Unknown subdomain → 404 JSON on `/api`, "agency not found" screen in the SPA.
- Apex/bare domain serves only superadmin login + platform console.
- **Local dev:** `*.localhost` resolves natively; `acme.localhost:5173` works with zero config. Vite proxy forwards the Host header (`changeOrigin: false` or explicit header passthrough).

### Login & JWT

- `POST /auth/login` scopes the user lookup to `req.agency.id` (via `systemPrisma` — no JWT exists yet).
- JWT payload gains `agencyId` and `slug`. `tenantMiddleware` rejects a JWT whose `agencyId` doesn't match the resolved subdomain → kills cross-tenant token replay.
- Superadmin JWTs carry `agencyId: null` and are accepted **only** on the apex domain.
- Password-reset and onboarding emails link to the owning agency's subdomain.
- Deploy note: existing sessions' JWTs lack `agencyId`; `tenantMiddleware` rejects them with 401 → one forced re-login at rollout. Acceptable.

### Public token routes

`/pca-form/:token`, `/sign/:token`, `/schedule/view/:token`, `/schedule/confirm/:token`, onboarding, password reset:
1. resolver looks up the token via `systemPrisma`;
2. reads the owning row's `agencyId`;
3. rejects if it doesn't match the request's subdomain;
4. continues on `tenantClient(agencyId)`.

Generated links (email/SMS) always use the agency's subdomain URL.

### CORS & sockets

CORS origin becomes a validator function: allow `https://*.<BASE_DOMAIN>` plus `EMPLOYEE_APP_ORIGIN`. Socket.IO handshake validates Origin subdomain against the JWT's agency.

### Platform console (minimal v1)

Superadmin-only routes under `/api/platform`, UI at the apex domain (`PlatformPage`, following GlobalToolbar/ContextBar/data-table patterns and audit-logging rules from CLAUDE.md):

- **Agency CRUD:** create (name + slug) → seeds default InsuranceTypes, Services, admin folders + creates first admin user (existing invite/reset-password email flow); suspend/reactivate; list with basic stats (client count, user count, last activity).
- **Support impersonation:** superadmin mints a short-lived (30 min) JWT for a target agency admin. Every action under it is audit-logged with `impersonatorId` in metadata — visible in the agency's History page. No silent access.
- All platform mutations audit-logged (`entityType: 'Agency'`; add to `ENTITY_TYPES` in `HistoryPage.jsx`).

### Deployment risk (verify during implementation)

Railway wildcard custom domains (`*.<BASE_DOMAIN>`) need the wildcard added to the service + wildcard CNAME at the DNS provider. If blocked on the current plan, fallback: add subdomains individually at agency creation via Railway's API. App design is identical either way.

## 4. Migration, Storage, Backup

### Three-step migration (reversible until the last)

1. **Add + backfill:** create `agencies`, add **nullable** `agency_id` to all tenant tables, insert agency #1 (name/slug from `NVBEST_AGENCY_NAME` / `NVBEST_AGENCY_SLUG` env), backfill every row.
2. **Constrain:** flip `agency_id` to `NOT NULL`, add FKs, indexes, composite uniques (and the superadmin partial email index).
3. **Enforce:** enable RLS + policies, create `app_user` role, set `APP_DATABASE_URL` for tenant traffic (owner `DATABASE_URL` stays for migrations/system client).

Rollout order: deploy code that *writes* `agencyId` before enabling RLS — a policy bug rolls back by disabling RLS with no data loss.

### Seeding

- `seed.js` becomes "create superadmin if none exists" (`SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` env vars).
- Agency #1's admin bootstrap keeps the existing `ADMIN_EMAIL` / `ADMIN_PASSWORD` path for Railway's start command.
- Agency creation seeds per-agency reference data from the defaults in `seed-services.js` (refactored into reusable `seedAgencyDefaults(agencyId)`).

### Import scripts

`prisma/import-xlsx.js` and `migrate-data.js` gain a required `--agency <slug>` argument.

### File storage

New uploads use `agency/{id}/...` S3 key prefixes (and the same path shape under local `server/uploads/`). Existing keys stay put — the RLS-protected DB row is the access-control source of truth; prefixing is hygiene, not security.

### Backup

- `GET /api/backup/export` runs through `req.db` → agency-scoped automatically. Dashboard Backup button now exports *that agency's* data.
- New `GET /api/platform/backup` (superadmin) = today's full-database export.

## 5. Error Handling

- Suspended agency → 403 with clear message on API and login.
- Unknown subdomain → 404 (API) / "agency not found" (SPA).
- JWT without `agencyId` (pre-migration tokens) → 401, forces one re-login.
- JWT agency ≠ subdomain agency → 401.
- Missing `app.agency_id` at the DB layer → RLS returns empty (fails closed by design); `tenantMiddleware` is the loud guard above it.

## 6. Testing

New `tenancy` Jest group; the isolation tests are the core deliverable:

- **Two-agency isolation:** seed agencies A and B with look-alike data. Assert every list endpoint returns only tenant rows; cross-tenant `GET /:id` → 404; cross-tenant JWT replay → 401.
- **Fails-closed:** a query on the `app_user` connection without `SET LOCAL` returns zero rows.
- **Write stamping:** creates through `tenantClient` land with the right `agencyId`; forged `agencyId` in a request body is overridden/rejected by `WITH CHECK`.
- **Public tokens:** agency A's token on agency B's subdomain → rejected; correct subdomain → works.
- **Migration:** pre-tenancy fixture → run migrations → assert backfill and constraint correctness.
- **Impersonation:** actions carry `impersonatorId` in audit metadata.
- Existing test suites updated to run against a tenant-client fixture.

## Implementation Shape (for the plan)

1. Schema + migration 1 (add/backfill) — no behavior change.
2. `tenantClient` + `tenantMiddleware` + controller sweep (`prisma.` → `req.db.`) — still one agency, RLS off.
3. Migration 2 (constraints) + migration 3 (RLS + `app_user`) + isolation tests.
4. Subdomain resolution + JWT binding + public-token checks + CORS/socket scoping.
5. Platform console (agency CRUD, seeding defaults, impersonation) + platform backup.
6. Storage prefixes, import-script flags, docs (CLAUDE.md update).

## Accepted Deviations From This Spec

1. **Agency #1 is created inside migration 1 with static values** (`'NV Best PCA'` / `'nvbest'`) rather than reading `NVBEST_AGENCY_NAME`/`NVBEST_AGENCY_SLUG` at migration time — migrations can't read env vars at the point they run in `prisma migrate deploy`. Those two env vars apply only on a fresh database via `seed.js`, and the agency's name is editable afterward from the platform console.
2. **The lint guard is a Jest test, not an ESLint rule.** `server/src/__tests__/prismaImportGuard.test.js` greps for direct `lib/prisma` imports outside an explicit allowlist and fails the test if it finds one — the server has no ESLint config, and a failing test blocks CI the same way a lint rule would.
