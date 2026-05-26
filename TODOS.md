# TODOS

## Design System (address before onboarding build)

### Standardize Breakpoint System
- **What:** CSS has 14 media queries using 8 different breakpoints (480, 500, 640, 700, 768, 900, 1200, 1400px). No standard set defined.
- **Why:** Each new page picks arbitrary breakpoints, making responsive behavior unpredictable and the mobile hamburger menu harder to implement consistently.
- **Fix:** Define 3-4 standard breakpoints in DESIGN.md and CSS comments (e.g., sm: 640px, md: 768px, lg: 1200px). Migrate existing queries incrementally. New queries must use standard values.
- **Blocked by:** Nothing. Should be done alongside or before the mobile hamburger menu task.

## Phase 2 Prerequisites (address during multi-tenancy build)

### IDOR / Resource Ownership
- **What:** ~30 API routes check role but not resource ownership. Any authenticated user can access any entity by ID.
- **Why:** In multi-tenant mode, Agency A's PCA could access Agency B's data by guessing integer IDs. Data breach risk.
- **Current state:** Single-tenant, all PCAs in the same agency legitimately access all clients. No user impact today.
- **Fix:** TenantId scoping via Prisma middleware (Phase 2) solves this architecturally. Per-resource ownership within a tenant is a separate, lower-priority concern.
- **Blocked by:** Phase 2 tenantId migration.

### Missing Database Indexes
- **What:** TimesheetEntry lacks index on `timesheetId`. Timesheet lacks index on `weekStart`/`status`. SigningToken lacks index on `timesheetId`.
- **Why:** Dashboard and timesheet list queries filter on these columns. Sequential scans at current scale (~100 timesheets) are invisible, but at multi-tenant scale (1000+) they'll degrade.
- **Fix:** Add composite indexes in a Prisma migration. Bundle with the Phase 2 migration that adds `tenantId` indexes.
- **Blocked by:** Nothing (can be done anytime, but efficient to bundle with Phase 2 migration).

### File Storage Architecture
- **What:** `ClientDocument.fileData` and `authorization_documents.file_data` store binary blobs directly in PostgreSQL.
- **Why:** Bloats database size, makes backups enormous, kills connection pool performance on large files. 20MB multer limit means a handful of documents push DB to gigabytes.
- **Fix:** Migrate to object storage (Railway volume, S3, or Cloudflare R2). Store file reference in DB, serve via signed URL.
- **Blocked by:** Nothing technically, but low priority until storage costs become visible.

### Permanent Link Security
- **What:** PCA Form permanent links (`/pca-form/:token`) never expire and never rotate. Anyone with a link has indefinite write access to timesheet data.
- **Why:** If a link is shared/intercepted, the attacker can overwrite timesheet data and forge signatures forever.
- **Fix:** Add optional expiry (30-day rolling), rate limiting on public endpoints, and link rotation capability for admins.
- **Blocked by:** Nothing, but current risk is low (links are shared 1:1 between admin and caregiver via direct message).
