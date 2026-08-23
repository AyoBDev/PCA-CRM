# Multi-Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-agency PCA app into a multi-tenant SaaS: an `Agency` model, `agencyId` on every tenant table, Postgres RLS enforcement through a tenant-scoped Prisma client, subdomain routing, and a super-admin platform console.

**Architecture:** Shared Postgres with `agency_id` denormalized onto every tenant table. RLS policies check `current_setting('app.agency_id')`; a Prisma `$extends` client wraps every operation in a batch transaction that calls `set_config(...)` first and auto-stamps `agencyId` on creates. The app's tenant traffic connects as a non-`BYPASSRLS` role (`app_user`); migrations/seeds/platform endpoints use the owner connection (`systemPrisma`). Requests resolve their agency from the subdomain; JWTs are bound to their agency.

**Tech Stack:** Express 4, Prisma 6 + PostgreSQL, Jest 29 + supertest (server), React 19 + Vite (client), Socket.IO 4.

**Spec:** `docs/superpowers/specs/2026-07-09-multi-tenancy-foundation-design.md`

## Global Constraints

- **Strict TDD**: every task writes its failing test first, verifies the failure, then implements. No implementation before a red test.
- **No AI attribution** in any commit message, PR, or comment (user's global rule).
- Work happens in this worktree (`worktrees/multi-tenancy-foundation`, branch `feat/multi-tenancy-foundation`). All `cd server` paths below are relative to the worktree root.
- Integration tests need local Postgres (`postgresql://mac@localhost:5432`). They use a dedicated `nvbestpca_test` database — never the dev DB.
- New env vars introduced by this plan: `BASE_DOMAIN`, `APP_DATABASE_URL`, `APP_DB_PASSWORD`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `NVBEST_AGENCY_NAME`, `NVBEST_AGENCY_SLUG`.
- Canonical name/claim spellings used everywhere: JWT claims `agencyId` (int or null) and `agencySlug`; Prisma field `agencyId` mapped to column `agency_id`; session GUC `app.agency_id`; DB role `app_user`; RLS policy name `tenant_isolation`.
- Audit logging required for all new mutations (`entityType: 'Agency'` added to HistoryPage `ENTITY_TYPES`).
- Unit tests: `cd server && npm test`. Integration tests: `cd server && npm run test:integration` (added in Task 1).
- Prisma migrations: this plan creates exactly three, in order: `add_agencies_and_agency_id`, `constrain_agency_id`, `enable_rls`.

---

### Task 1: Integration test harness (real-Postgres Jest project)

Existing tests mock `lib/prisma` — fine for units, useless for RLS. Add a separate Jest config that runs `*.itest.js` files against a real `nvbestpca_test` database with migrations applied.

**Files:**
- Create: `server/jest.integration.config.js`
- Create: `server/src/__integration__/globalSetup.js`
- Create: `server/src/__integration__/setupEnv.js`
- Create: `server/src/__integration__/harness.itest.js`
- Modify: `server/package.json` (add `test:integration` script)

**Interfaces:**
- Produces: `npm run test:integration` command; env defaults `TEST_DATABASE_URL`, `APP_DATABASE_URL`, `APP_DB_PASSWORD` available inside every `*.itest.js`; later tasks put integration tests in `server/src/__integration__/`.

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/harness.itest.js`:
```js
const { PrismaClient } = require('@prisma/client');

describe('integration harness', () => {
  test('connects to the test database with migrations applied', async () => {
    const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
    // proves migrations ran — clients table exists
    const count = await prisma.client.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npm run test:integration`
Expected: FAIL — `npm error Missing script: "test:integration"`

- [ ] **Step 3: Implement the harness**

`server/package.json` — add to `"scripts"`:
```json
"test:integration": "jest --config jest.integration.config.js --runInBand --verbose"
```

`server/jest.integration.config.js`:
```js
module.exports = {
  testMatch: ['**/*.itest.js'],
  globalSetup: '<rootDir>/src/__integration__/globalSetup.js',
  setupFiles: ['<rootDir>/src/__integration__/setupEnv.js'],
  testTimeout: 30000,
};
```

`server/src/__integration__/setupEnv.js` (runs before each test file — sets env BEFORE any lib is required):
```js
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://mac@localhost:5432/nvbestpca_test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_DB_PASSWORD = process.env.APP_DB_PASSWORD || 'app_password';
process.env.APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ||
  `postgresql://app_user:${process.env.APP_DB_PASSWORD}@localhost:5432/nvbestpca_test`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.BASE_DOMAIN = 'localhost';
process.env.NODE_ENV = 'test';
```

`server/src/__integration__/globalSetup.js`:
```js
const { execSync } = require('child_process');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://mac@localhost:5432/nvbestpca_test';
  // create the test DB if missing (ignore "already exists")
  try {
    execSync('createdb nvbestpca_test', { stdio: 'pipe' });
  } catch (err) {
    if (!String(err.stderr).includes('already exists')) throw err;
  }
  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/../..',
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm run test:integration`
Expected: PASS (1 test). Also run `npm test` and confirm the `.itest.js` file is NOT picked up by the default suite.

- [ ] **Step 5: Commit**

```bash
git add server/jest.integration.config.js server/src/__integration__ server/package.json
git commit -m "test: add integration test harness against real Postgres"
```

---

### Task 2: Migration 1 — Agency model, nullable agencyId everywhere, backfill

**Files:**
- Modify: `server/prisma/schema.prisma` (all 47 models + new Agency model)
- Create: `server/prisma/migrations/<timestamp>_add_agencies_and_agency_id/migration.sql` (generated, then edited)
- Create: `server/src/__integration__/agencySchema.itest.js`

**Interfaces:**
- Produces: `Agency` Prisma model (`prisma.agency`), fields `id`, `name`, `slug`, `status`, `settings`, `createdAt`; `agencyId Int?` + `agency` relation on every other model; table `agencies`; every existing row backfilled to agency id 1 (`slug: 'nvbest'`).

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/agencySchema.itest.js`:
```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

afterAll(() => prisma.$disconnect());

test('agencies table exists with default agency', async () => {
  const agency = await prisma.agency.findUnique({ where: { slug: 'nvbest' } });
  expect(agency).not.toBeNull();
  expect(agency.status).toBe('active');
});

test('every tenant table has an agency_id column', async () => {
  const missing = await prisma.$queryRaw`
    SELECT t.table_name FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND t.table_name NOT IN ('agencies', '_prisma_migrations')
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name
          AND c.column_name = 'agency_id'
      )`;
  expect(missing).toEqual([]);
});

test('backfill left no NULL agency_id in clients/users/timesheets', async () => {
  for (const table of ['clients', 'users', 'timesheets', 'authorizations', 'audit_logs']) {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE agency_id IS NULL`
    );
    expect({ table, n }).toEqual({ table, n: 0 });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest --config jest.integration.config.js agencySchema -t agencies`
Expected: FAIL — `prisma.agency` is undefined / table does not exist.

- [ ] **Step 3: Edit schema.prisma — Agency model + agencyId on every model**

Add at the top of the models section:
```prisma
model Agency {
  id        Int      @id @default(autoincrement())
  name      String
  slug      String   @unique
  status    String   @default("active")
  settings  Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("agencies")
}
```

Then, for **every other model in the file** (all 47 — including `User`, `AuditLog`, and child tables like `TimesheetEntry`, `Message`, `PayrollVisit`, `authorization_documents`), add these two lines inside the model body (before any `@@` block attributes):
```prisma
  agencyId Int?    @map("agency_id")
  agency   Agency? @relation(fields: [agencyId], references: [id], onDelete: Cascade)
```
And add an index attribute at the bottom of each model (alongside existing `@@` attributes):
```prisma
  @@index([agencyId])
```

**Note:** columns are nullable in this migration on purpose (backfill happens before `NOT NULL` in Task 3). The relation name on the Agency side is auto-generated in the next step.

Run: `cd server && npx prisma format` — this auto-inserts the ~47 back-relation list fields into the `Agency` model. Then run `npx prisma validate` — must report the schema is valid.

Verification: `grep -c "agencyId Int?" server/prisma/schema.prisma` must equal the number of models minus one (Agency itself). Get the model count with `grep -c "^model " server/prisma/schema.prisma` (expect 48 after adding Agency, so 47 `agencyId Int?` lines).

- [ ] **Step 4: Generate the migration and append backfill SQL**

```bash
cd server && npx prisma migrate dev --create-only --name add_agencies_and_agency_id
```

Open the generated `server/prisma/migrations/<timestamp>_add_agencies_and_agency_id/migration.sql` and append at the end:

```sql
-- Backfill: create the default agency and adopt all existing rows.
INSERT INTO "agencies" ("name", "slug", "status", "settings")
VALUES ('NV Best PCA', 'nvbest', 'active', '{}');

DO $$
DECLARE
  t text;
  default_agency int;
BEGIN
  SELECT id INTO default_agency FROM "agencies" WHERE slug = 'nvbest';
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('agencies', '_prisma_migrations')
  LOOP
    EXECUTE format('UPDATE %I SET agency_id = %s WHERE agency_id IS NULL', t, default_agency);
  END LOOP;
END $$;
```

Apply: `cd server && npx prisma migrate dev`
(Agency #1's display name is editable later via the platform console; the migration uses static values because migrations cannot read env vars.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm run test:integration`
Expected: PASS (harness + all three agencySchema tests). Then run `npm test` — the existing unit suite must still pass (nullable column + mocked prisma means no breakage).

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src/__integration__/agencySchema.itest.js
git commit -m "feat(schema): add Agency model, nullable agencyId on all tables, backfill to default agency"
```

---

### Task 3: Migration 2 — NOT NULL, composite uniques, superadmin partial index

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_constrain_agency_id/migration.sql` (generated, then edited)
- Create: `server/src/__integration__/agencyConstraints.itest.js`

**Interfaces:**
- Produces: `agencyId Int` (required) on every model except `User` and `AuditLog` (stay `Int?`); uniques `@@unique([agencyId, email])` on User, `@@unique([agencyId, name])` on InsuranceType and PermissionGroup, `@@unique([agencyId, code])` on Service; partial unique index `users_superadmin_email_key`; `role` now also allows `'superadmin'` (string column — no enum change needed).

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/agencyConstraints.itest.js`:
```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: 'constraint-test' } } });
  await prisma.agency.deleteMany({ where: { slug: { startsWith: 'ctest' } } });
  await prisma.$disconnect();
});

test('same email allowed in two different agencies', async () => {
  const a = await prisma.agency.create({ data: { name: 'CTest A', slug: 'ctest-a' } });
  const b = await prisma.agency.create({ data: { name: 'CTest B', slug: 'ctest-b' } });
  const email = 'constraint-test@example.com';
  await prisma.user.create({ data: { email, passwordHash: 'x', name: 'A', role: 'admin', agencyId: a.id } });
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'B', role: 'admin', agencyId: b.id } })
  ).resolves.toMatchObject({ email });
  // duplicate inside the SAME agency is rejected
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'A2', role: 'admin', agencyId: a.id } })
  ).rejects.toThrow();
});

test('two superadmins cannot share an email (partial index)', async () => {
  const email = 'constraint-test-super@example.com';
  await prisma.user.create({ data: { email, passwordHash: 'x', name: 'S1', role: 'superadmin' } });
  await expect(
    prisma.user.create({ data: { email, passwordHash: 'x', name: 'S2', role: 'superadmin' } })
  ).rejects.toThrow();
});

test('clients.agency_id is NOT NULL', async () => {
  const [{ is_nullable }] = await prisma.$queryRaw`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'agency_id'`;
  expect(is_nullable).toBe('NO');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest --config jest.integration.config.js agencyConstraints`
Expected: FAIL — first test's second create throws (global email unique still active), and `is_nullable` is `'YES'`.

- [ ] **Step 3: Edit schema.prisma**

1. For every model **except `User` and `AuditLog`**: change `agencyId Int?` → `agencyId Int` and `agency Agency?` → `agency Agency`.
2. `User`: remove `@unique` from `email`; add `@@unique([agencyId, email])`.
3. `InsuranceType`: remove `@unique` from `name`; add `@@unique([agencyId, name])`.
4. `Service`: remove `@unique` from `code`; add `@@unique([agencyId, code])`.
5. `PermissionGroup`: remove `@unique` from `name`; add `@@unique([agencyId, name])`.

Run `npx prisma format && npx prisma validate`.

- [ ] **Step 4: Generate migration, append partial index**

```bash
cd server && npx prisma migrate dev --create-only --name constrain_agency_id
```

Append to the generated `migration.sql`:
```sql
-- Superadmins (agency_id IS NULL) must have platform-unique emails.
CREATE UNIQUE INDEX "users_superadmin_email_key" ON "users" ("email") WHERE agency_id IS NULL;
```

Apply: `npx prisma migrate dev`

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm run test:integration` — all pass.
Run: `cd server && npm test` — unit suite still green (mocked prisma).

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src/__integration__/agencyConstraints.itest.js
git commit -m "feat(schema): require agencyId, per-agency uniques, superadmin partial email index"
```

---

### Task 4: Migration 3 — enable RLS + `app_user` role

**Files:**
- Create: `server/prisma/generate-rls-sql.js`
- Create: `server/prisma/setup-app-role.js`
- Create: `server/prisma/migrations/<timestamp>_enable_rls/migration.sql`
- Modify: `server/src/__integration__/globalSetup.js` (run setup-app-role after migrate)
- Create: `server/src/__integration__/rls.itest.js`

**Interfaces:**
- Produces: RLS enabled with policy `tenant_isolation` on every table except `agencies`/`_prisma_migrations`; login role `app_user` (password `APP_DB_PASSWORD`) with DML grants and no BYPASSRLS; `node prisma/setup-app-role.js` idempotent setup command (also added to the production start sequence in Task 12).

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/rls.itest.js`:
```js
const { PrismaClient } = require('@prisma/client');
const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const appConn = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

let agencyA, agencyB;

beforeAll(async () => {
  agencyA = await owner.agency.create({ data: { name: 'RLS A', slug: 'rls-a' } });
  agencyB = await owner.agency.create({ data: { name: 'RLS B', slug: 'rls-b' } });
  await owner.client.create({ data: { clientName: 'Alice A', agencyId: agencyA.id } });
  await owner.client.create({ data: { clientName: 'Bob B', agencyId: agencyB.id } });
});

afterAll(async () => {
  await owner.client.deleteMany({ where: { agencyId: { in: [agencyA.id, agencyB.id] } } });
  await owner.agency.deleteMany({ where: { id: { in: [agencyA.id, agencyB.id] } } });
  await owner.$disconnect();
  await appConn.$disconnect();
});

test('app_user with no tenant context sees zero rows (fails closed)', async () => {
  const rows = await appConn.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } });
  expect(rows).toEqual([]);
});

test('app_user with agency A context sees only agency A rows', async () => {
  const [, rows] = await appConn.$transaction([
    appConn.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyA.id)}, TRUE)`,
    appConn.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } }),
  ]);
  expect(rows.map((r) => r.clientName)).toEqual(['Alice A']);
});

test('app_user cannot insert a row for another agency (WITH CHECK)', async () => {
  await expect(
    appConn.$transaction([
      appConn.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyA.id)}, TRUE)`,
      appConn.client.create({ data: { clientName: 'Sneaky', agencyId: agencyB.id } }),
    ])
  ).rejects.toThrow();
});

test('owner connection bypasses RLS (backups, migrations)', async () => {
  const rows = await owner.client.findMany({ where: { clientName: { in: ['Alice A', 'Bob B'] } } });
  expect(rows).toHaveLength(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest --config jest.integration.config.js rls.itest`
Expected: FAIL — `app_user` role doesn't exist (connection error), or once role exists, "fails closed" test sees 2 rows because RLS is not enabled.

- [ ] **Step 3: Write the role setup script and SQL generator**

`server/prisma/setup-app-role.js` (idempotent; run with owner `DATABASE_URL`):
```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    console.log('APP_DB_PASSWORD not set — skipping app_user setup');
    return;
  }
  const escaped = password.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN;
      END IF;
    END $$;`);
  await prisma.$executeRawUnsafe(`ALTER ROLE app_user LOGIN PASSWORD '${escaped}' NOBYPASSRLS`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user`);
  console.log('✅ app_user role configured');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

`server/prisma/generate-rls-sql.js` (dev tool — prints the migration SQL from schema.prisma):
```js
const fs = require('fs');
const path = require('path');

const schema = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf8');
const EXCLUDED = new Set(['agencies']);
const tables = [];
let current = null;
let mapped = null;
for (const line of schema.split('\n')) {
  const start = line.match(/^model\s+(\w+)\s*\{/);
  if (start) { current = start[1]; mapped = null; continue; }
  if (!current) continue;
  const mapMatch = line.match(/@@map\("([^"]+)"\)/);
  if (mapMatch) mapped = mapMatch[1];
  if (/^\}/.test(line)) {
    const table = mapped || current;
    if (!EXCLUDED.has(table)) tables.push(table);
    current = null;
  }
}

const sql = tables
  .map(
    (t) => `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "${t}"
  USING (agency_id = current_setting('app.agency_id', true)::int)
  WITH CHECK (agency_id = current_setting('app.agency_id', true)::int);`
  )
  .join('\n\n');
process.stdout.write(sql + '\n');
```

- [ ] **Step 4: Create and apply the migration**

```bash
cd server
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_enable_rls
node prisma/generate-rls-sql.js > prisma/migrations/*_enable_rls/migration.sql
npx prisma migrate dev   # marks it applied (schema.prisma unchanged, so no extra diff)
node prisma/setup-app-role.js
```
(If `migrate dev` complains the migration is empty of schema changes, use `npx prisma migrate deploy` for this one — it is raw-SQL-only by design.)

Modify `server/src/__integration__/globalSetup.js` — after the `migrate deploy` execSync, add:
```js
  execSync('node prisma/setup-app-role.js', {
    cwd: __dirname + '/../..',
    env: { ...process.env, DATABASE_URL: url, APP_DB_PASSWORD: process.env.APP_DB_PASSWORD || 'app_password' },
    stdio: 'inherit',
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm run test:integration`
Expected: all rls.itest tests PASS, prior suites still green.

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src/__integration__
git commit -m "feat(db): enable row-level security with tenant_isolation policies and app_user role"
```

---

### Task 5: `tenantPrisma` — tenant-scoped Prisma client

**Files:**
- Create: `server/src/lib/tenantPrisma.js`
- Create: `server/src/__integration__/tenantPrisma.itest.js`

**Interfaces:**
- Produces: `const { tenantClient, tenantTransaction, basePrisma } = require('../lib/tenantPrisma')`.
  - `tenantClient(agencyId: number)` → Prisma client where every model operation and `$queryRaw`/`$executeRaw` runs with `app.agency_id` set; `create`/`createMany`/`upsert` auto-stamp `agencyId`. Throws on non-positive-integer input. Cached per agencyId.
  - `tenantTransaction(agencyId, async (tx) => {...})` → interactive transaction with the GUC set once; `tx` does **not** auto-stamp — callers pass `agencyId` explicitly in creates.
- Consumes: `APP_DATABASE_URL` env; RLS from Task 4.

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/tenantPrisma.itest.js`:
```js
const { PrismaClient } = require('@prisma/client');
const { tenantClient, tenantTransaction } = require('../lib/tenantPrisma');

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
let a, b;

beforeAll(async () => {
  a = await owner.agency.create({ data: { name: 'TP A', slug: 'tp-a' } });
  b = await owner.agency.create({ data: { name: 'TP B', slug: 'tp-b' } });
  await owner.client.create({ data: { clientName: 'TP Alice', agencyId: a.id } });
  await owner.client.create({ data: { clientName: 'TP Bob', agencyId: b.id } });
});

afterAll(async () => {
  await owner.client.deleteMany({ where: { agencyId: { in: [a.id, b.id] } } });
  await owner.agency.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await owner.$disconnect();
});

test('findMany is scoped to the tenant', async () => {
  const rows = await tenantClient(a.id).client.findMany({ where: { clientName: { startsWith: 'TP ' } } });
  expect(rows.map((r) => r.clientName)).toEqual(['TP Alice']);
});

test('cross-tenant findUnique by id returns null', async () => {
  const bob = await owner.client.findFirst({ where: { clientName: 'TP Bob' } });
  const leaked = await tenantClient(a.id).client.findUnique({ where: { id: bob.id } });
  expect(leaked).toBeNull();
});

test('create auto-stamps agencyId', async () => {
  const created = await tenantClient(a.id).client.create({ data: { clientName: 'TP Carol' } });
  expect(created.agencyId).toBe(a.id);
});

test('forged agencyId in create is rejected', async () => {
  await expect(
    tenantClient(a.id).client.create({ data: { clientName: 'TP Mallory', agencyId: b.id } })
  ).rejects.toThrow();
});

test('$queryRaw is scoped too', async () => {
  const rows = await tenantClient(a.id)
    .$queryRaw`SELECT client_name FROM clients WHERE client_name LIKE 'TP %' ORDER BY client_name`;
  expect(rows.map((r) => r.client_name)).toEqual(['TP Alice', 'TP Carol']);
});

test('tenantTransaction runs multiple ops under one context', async () => {
  const names = await tenantTransaction(a.id, async (tx) => {
    await tx.client.create({ data: { clientName: 'TP Dave', agencyId: a.id } });
    const rows = await tx.client.findMany({ where: { clientName: { startsWith: 'TP ' } } });
    return rows.map((r) => r.clientName).sort();
  });
  expect(names).toEqual(['TP Alice', 'TP Carol', 'TP Dave']);
});

test('rejects garbage agencyId', () => {
  expect(() => tenantClient(0)).toThrow();
  expect(() => tenantClient('1; DROP TABLE clients')).toThrow();
  expect(() => tenantClient(undefined)).toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest --config jest.integration.config.js tenantPrisma`
Expected: FAIL — `Cannot find module '../lib/tenantPrisma'`.

- [ ] **Step 3: Implement**

`server/src/lib/tenantPrisma.js`:
```js
const { PrismaClient } = require('@prisma/client');

// Tenant traffic connects as app_user (no BYPASSRLS). Falls back to
// DATABASE_URL so local dev works before APP_DATABASE_URL is provisioned —
// RLS is then only enforced in environments that set it.
const appUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const basePrisma = new PrismaClient({ datasourceUrl: appUrl });

// Models without an agencyId column — never stamp these.
const NO_STAMP_MODELS = new Set(['Agency']);
const clientCache = new Map();

function assertAgencyId(agencyId) {
  if (!Number.isInteger(agencyId) || agencyId <= 0) {
    throw new Error(`tenantClient requires a positive integer agencyId, got: ${agencyId}`);
  }
}

function stampCreateArgs(model, operation, args, agencyId) {
  if (NO_STAMP_MODELS.has(model)) return args;
  if (operation === 'create' || operation === 'createMany') {
    if (Array.isArray(args.data)) {
      args.data = args.data.map((d) => ({ agencyId, ...d }));
    } else if (args.data) {
      args.data = { agencyId, ...args.data };
    }
  } else if (operation === 'upsert' && args.create) {
    args.create = { agencyId, ...args.create };
  }
  return args;
}

function scoped(agencyId, promise) {
  // Batch transaction: set the GUC, then run the operation on the same
  // connection. SET ... LOCAL semantics via set_config(..., TRUE).
  return basePrisma
    .$transaction([
      basePrisma.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`,
      promise,
    ])
    .then(([, result]) => result);
}

function tenantClient(agencyId) {
  assertAgencyId(agencyId);
  if (clientCache.has(agencyId)) return clientCache.get(agencyId);
  const client = basePrisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return scoped(agencyId, query(stampCreateArgs(model, operation, args, agencyId)));
        },
      },
      $queryRaw({ args, query }) {
        return scoped(agencyId, query(args));
      },
      $executeRaw({ args, query }) {
        return scoped(agencyId, query(args));
      },
    },
  });
  clientCache.set(agencyId, client);
  return client;
}

function tenantTransaction(agencyId, fn) {
  assertAgencyId(agencyId);
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.agency_id', ${String(agencyId)}, TRUE)`;
    return fn(tx);
  });
}

module.exports = { tenantClient, tenantTransaction, basePrisma };
```

**Known limitation (document in code review, enforced by tests):** the auto-stamp does not reach *nested* relation creates (e.g. `client.create({ data: { authorizations: { create: [...] } } })`). Those need explicit `agencyId` in the nested data — the DB's `NOT NULL` + `WITH CHECK` makes misses fail loudly, and Task 8's controller sweep handles each site.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest --config jest.integration.config.js tenantPrisma`
Expected: all 7 PASS. Note: the "forged agencyId" test passes because `{ agencyId, ...d }` spread lets an explicit caller value through — and RLS `WITH CHECK` then rejects it. If it fails because the forged value was silently overwritten, change the spread order — the test is the contract.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/tenantPrisma.js server/src/__integration__/tenantPrisma.itest.js
git commit -m "feat(server): tenant-scoped Prisma client with RLS context and agencyId stamping"
```

---

### Task 6: Tenant context (AsyncLocalStorage) + audit logging carries agencyId

**Files:**
- Create: `server/src/lib/tenantContext.js`
- Modify: `server/src/services/auditService.js`
- Modify: `server/prisma/schema.prisma` — no change needed (AuditLog.agencyId added in Task 2 as nullable)
- Create: `server/src/services/__tests__/auditAgency.test.js`
- Create: `server/src/lib/__tests__/tenantContext.test.js`

**Interfaces:**
- Produces: `const { runWithTenant, getTenant, getTenantDb, getAgencyId, getImpersonatorId } = require('../lib/tenantContext')`.
  - `runWithTenant({ agencyId, db, impersonatorId? }, fn)` — runs `fn` inside the context.
  - `getTenantDb()` — returns the tenant client or **throws** `'No tenant context'`.
  - `getAgencyId()` / `getImpersonatorId()` — return value or `null` (never throw).
- `audit.logAction(...)` now writes `agencyId: getAgencyId()` on every AuditLog row and merges `{ impersonatorId }` into metadata when present. Call-site signature unchanged.

- [ ] **Step 1: Write the failing tests**

`server/src/lib/__tests__/tenantContext.test.js`:
```js
const { runWithTenant, getTenantDb, getAgencyId, getImpersonatorId } = require('../tenantContext');

test('getAgencyId returns null outside a context', () => {
  expect(getAgencyId()).toBeNull();
});

test('getTenantDb throws outside a context', () => {
  expect(() => getTenantDb()).toThrow('No tenant context');
});

test('values are visible inside runWithTenant, including across await', async () => {
  const fakeDb = { tag: 'db-7' };
  await runWithTenant({ agencyId: 7, db: fakeDb, impersonatorId: 99 }, async () => {
    await new Promise((r) => setImmediate(r));
    expect(getAgencyId()).toBe(7);
    expect(getTenantDb()).toBe(fakeDb);
    expect(getImpersonatorId()).toBe(99);
  });
  expect(getAgencyId()).toBeNull();
});
```

`server/src/services/__tests__/auditAgency.test.js`:
```js
jest.mock('../../lib/prisma', () => ({
  auditLog: { create: jest.fn().mockResolvedValue({}) },
}));
const prisma = require('../../lib/prisma');
const audit = require('../auditService');
const { runWithTenant } = require('../../lib/tenantContext');

test('logAction stamps agencyId from tenant context', async () => {
  await runWithTenant({ agencyId: 42, db: {} }, async () => {
    audit.logAction({ userId: 1, userName: 'T', userRole: 'admin', action: 'CREATE', entityType: 'Client', entityId: 5, entityName: 'X' });
  });
  await new Promise((r) => setImmediate(r)); // fire-and-forget flush
  expect(prisma.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ agencyId: 42 }) })
  );
});

test('logAction outside tenant context writes agencyId null (platform actions)', async () => {
  prisma.auditLog.create.mockClear();
  audit.logAction({ userId: 1, userName: 'S', userRole: 'superadmin', action: 'CREATE', entityType: 'Agency', entityId: 9, entityName: 'New Agency' });
  await new Promise((r) => setImmediate(r));
  expect(prisma.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ agencyId: null }) })
  );
});

test('impersonatorId lands in metadata', async () => {
  prisma.auditLog.create.mockClear();
  await runWithTenant({ agencyId: 42, db: {}, impersonatorId: 3 }, async () => {
    audit.logAction({ userId: 1, userName: 'T', userRole: 'admin', action: 'UPDATE', entityType: 'Client', entityId: 5, entityName: 'X' });
  });
  await new Promise((r) => setImmediate(r));
  const data = prisma.auditLog.create.mock.calls[0][0].data;
  expect(JSON.parse(JSON.stringify(data.metadata))).toMatchObject({ impersonatorId: 3 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest tenantContext auditAgency`
Expected: FAIL — `Cannot find module '../tenantContext'`.

- [ ] **Step 3: Implement**

`server/src/lib/tenantContext.js`:
```js
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

function runWithTenant(store, fn) {
  return als.run(store, fn);
}

function getTenant() {
  return als.getStore() || null;
}

function getTenantDb() {
  const store = als.getStore();
  if (!store || !store.db) throw new Error('No tenant context — getTenantDb() called outside a tenant request');
  return store.db;
}

function getAgencyId() {
  return als.getStore()?.agencyId ?? null;
}

function getImpersonatorId() {
  return als.getStore()?.impersonatorId ?? null;
}

module.exports = { runWithTenant, getTenant, getTenantDb, getAgencyId, getImpersonatorId };
```

`server/src/services/auditService.js` — open the file; find the spot inside `logAction` where the `data` object for `prisma.auditLog.create({ data: {...} })` is built. Add two lines to that object construction:
```js
const { getAgencyId, getImpersonatorId } = require('../lib/tenantContext'); // top of file

// inside logAction, when building the create data:
agencyId: getAgencyId(),
metadata: getImpersonatorId() != null
  ? { ...(metadata || {}), impersonatorId: getImpersonatorId() }
  : (metadata || undefined),
```
Keep the existing fire-and-forget behavior (no `await` added anywhere). Audit writes stay on `lib/prisma` (owner connection) intentionally — they must succeed even for platform-level actions, and the explicit `agencyId` column scopes tenant reads via RLS.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest tenantContext auditAgency` → PASS.
Run: `cd server && npm test` → existing suites green (the auditService change is additive).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/tenantContext.js server/src/lib/__tests__ server/src/services/auditService.js server/src/services/__tests__/auditAgency.test.js
git commit -m "feat(server): tenant AsyncLocalStorage context; audit logs carry agencyId"
```

---

### Task 7: `resolveAgency` middleware (subdomain → req.agency)

**Files:**
- Create: `server/src/middleware/resolveAgency.js`
- Create: `server/src/middleware/__tests__/resolveAgency.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Produces: `const { resolveAgency, clearAgencyCache } = require('./middleware/resolveAgency')`.
  - Sets `req.agency` = Agency row (subdomain match), or `null` (apex / www / unknown non-API host).
  - Unknown subdomain on an `/api` path → `404 { error: 'Agency not found' }`.
  - `clearAgencyCache()` for tests.
- Consumes: `BASE_DOMAIN` env (default `'localhost'`); `lib/prisma` (system client) for slug lookup; 60s in-memory TTL cache.

- [ ] **Step 1: Write the failing test**

`server/src/middleware/__tests__/resolveAgency.test.js`:
```js
jest.mock('../../lib/prisma', () => ({
  agency: { findUnique: jest.fn() },
}));
const prisma = require('../../lib/prisma');

describe('resolveAgency', () => {
  let resolveAgency, clearAgencyCache;
  beforeEach(() => {
    jest.resetModules();
    process.env.BASE_DOMAIN = 'nvbestpca.com';
    ({ resolveAgency, clearAgencyCache } = require('../resolveAgency'));
    clearAgencyCache();
    prisma.agency.findUnique.mockReset();
  });

  function run(hostname, path = '/api/clients') {
    const req = { hostname, path };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return resolveAgency(req, res, next).then(() => ({ req, res, next }));
  }

  test('subdomain resolves to agency', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 2, slug: 'acme', status: 'active' });
    const { req, next } = await run('acme.nvbestpca.com');
    expect(prisma.agency.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
    expect(req.agency).toMatchObject({ id: 2, slug: 'acme' });
    expect(next).toHaveBeenCalled();
  });

  test('apex domain sets req.agency = null', async () => {
    const { req, next } = await run('nvbestpca.com');
    expect(req.agency).toBeNull();
    expect(next).toHaveBeenCalled();
    expect(prisma.agency.findUnique).not.toHaveBeenCalled();
  });

  test('unknown subdomain on /api returns 404', async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    const { res, next } = await run('ghost.nvbestpca.com');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('unknown subdomain on non-API path passes through for the SPA', async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    const { req, next } = await run('ghost.nvbestpca.com', '/login');
    expect(req.agency).toBeNull();
    expect(req.agencyNotFound).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('lookup is cached (second call hits cache)', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 2, slug: 'acme', status: 'active' });
    await run('acme.nvbestpca.com');
    await run('acme.nvbestpca.com');
    expect(prisma.agency.findUnique).toHaveBeenCalledTimes(1);
  });

  test('nested subdomains are rejected', async () => {
    const { res } = await run('a.b.nvbestpca.com');
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest resolveAgency`
Expected: FAIL — `Cannot find module '../resolveAgency'`.

- [ ] **Step 3: Implement**

`server/src/middleware/resolveAgency.js`:
```js
const prisma = require('../lib/prisma');

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // slug -> { agency, expires }

function baseDomain() {
  return (process.env.BASE_DOMAIN || 'localhost').toLowerCase();
}

async function lookupAgency(slug) {
  const hit = cache.get(slug);
  if (hit && hit.expires > Date.now()) return hit.agency;
  const agency = await prisma.agency.findUnique({ where: { slug } });
  cache.set(slug, { agency, expires: Date.now() + CACHE_TTL_MS });
  return agency;
}

function clearAgencyCache() {
  cache.clear();
}

async function resolveAgency(req, res, next) {
  try {
    const domain = baseDomain();
    const host = (req.hostname || '').toLowerCase();
    if (host === domain || host === `www.${domain}`) {
      req.agency = null;
      return next();
    }
    if (host.endsWith(`.${domain}`)) {
      const slug = host.slice(0, -(domain.length + 1));
      if (slug && !slug.includes('.')) {
        const agency = await lookupAgency(slug);
        if (agency) {
          req.agency = agency;
          return next();
        }
      }
    }
    // Unknown subdomain or foreign host (e.g. *.up.railway.app healthcheck).
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    req.agency = null;
    req.agencyNotFound = true;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveAgency, clearAgencyCache };
```

`server/src/app.js` — after `app.use(express.json());` (line 30) add:
```js
const { resolveAgency } = require('./middleware/resolveAgency');
app.use(resolveAgency);
```
(the `require` goes with the other requires at the top of the file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest resolveAgency` → 6 PASS. `npm test` → suite green.

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/resolveAgency.js server/src/middleware/__tests__/resolveAgency.test.js server/src/app.js
git commit -m "feat(server): resolve agency from subdomain with TTL cache"
```

---

### Task 8: JWT agency binding, scoped login, `tenantMiddleware`

**Files:**
- Modify: `server/src/controllers/authController.js` (`signToken`, `login`, `employeeLogin`, `register`, `forgotPassword`)
- Create: `server/src/middleware/tenantMiddleware.js`
- Modify: `server/src/routes/api.js` (insert `router.use(tenantMiddleware)` after `router.use(authenticate)` at line 237)
- Create: `server/src/__integration__/tenantAuth.itest.js`
- Create: `server/src/__integration__/helpers.js`

**Interfaces:**
- Produces:
  - JWT payload gains `agencyId` (int | null) and `agencySlug` (string | null) — signed in `signToken(user, permissions)` from `user.agencyId` (slug is read by the caller and passed via `user._agencySlug`, see below).
  - `tenantMiddleware(req, res, next)` from `server/src/middleware/tenantMiddleware.js`: rejects superadmin JWTs on tenant APIs (403), missing/invalid `agencyId` (401), subdomain mismatch (401), suspended agency (403); otherwise sets `req.db = tenantClient(agencyId)` and calls `next` inside `runWithTenant({ agencyId, db, impersonatorId })`.
  - Test helper `server/src/__integration__/helpers.js`: `createAgencyWithAdmin(slug)` → `{ agency, admin, token }`; `cleanupAgencies(slugs)`.
- Consumes: `tenantClient` (Task 5), `runWithTenant` (Task 6), `req.agency` (Task 7).

- [ ] **Step 1: Write the test helper**

`server/src/__integration__/helpers.js`:
```js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/secrets');

const systemPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function createAgencyWithAdmin(slug) {
  const agency = await systemPrisma.agency.create({ data: { name: `Agency ${slug}`, slug } });
  const admin = await systemPrisma.user.create({
    data: {
      email: `admin@${slug}.test`,
      passwordHash: await bcrypt.hash('secret123', 4),
      name: `Admin ${slug}`,
      role: 'admin',
      agencyId: agency.id,
    },
  });
  const token = jwt.sign(
    {
      id: admin.id, email: admin.email, name: admin.name, role: admin.role,
      permissionGroupId: null, permissions: [], permissionsVersion: 1,
      agencyId: agency.id, agencySlug: slug,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { agency, admin, token };
}

async function cleanupAgencies(slugs) {
  await systemPrisma.agency.deleteMany({ where: { slug: { in: slugs } } });
}

module.exports = { systemPrisma, createAgencyWithAdmin, cleanupAgencies };
```
(Agency FK cascade deletes all tenant rows, so cleanup is one statement.)

- [ ] **Step 2: Write the failing integration test**

`server/src/__integration__/tenantAuth.itest.js`:
```js
const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B;

beforeAll(async () => {
  A = await createAgencyWithAdmin('auth-a');
  B = await createAgencyWithAdmin('auth-b');
  await systemPrisma.client.create({ data: { clientName: 'Auth Alice', agencyId: A.agency.id } });
  await systemPrisma.client.create({ data: { clientName: 'Auth Bob', agencyId: B.agency.id } });
});

afterAll(async () => {
  await cleanupAgencies(['auth-a', 'auth-b']);
  await systemPrisma.$disconnect();
});

function onAgency(slug) {
  return (r) => r.set('Host', `${slug}.localhost`);
}

test('login is scoped to the subdomain agency', async () => {
  const ok = await request(app).post('/api/auth/login')
    .set('Host', 'auth-a.localhost')
    .send({ email: A.admin.email, password: 'secret123' });
  expect(ok.status).toBe(200);
  expect(ok.body.token).toBeTruthy();

  const wrong = await request(app).post('/api/auth/login')
    .set('Host', 'auth-b.localhost')
    .send({ email: A.admin.email, password: 'secret123' });
  expect(wrong.status).toBe(401);
});

test('agency A token lists only agency A clients', async () => {
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-a.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(200);
  const names = res.body.map((c) => c.clientName).filter((n) => n.startsWith('Auth '));
  expect(names).toEqual(['Auth Alice']);
});

test('agency A token replayed on agency B subdomain is rejected', async () => {
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-b.localhost')
    .set('Authorization', `Bearer ${A.token}`);
  expect(res.status).toBe(401);
});

test('token without agencyId (pre-migration session) is rejected', async () => {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../config/secrets');
  const legacy = jwt.sign(
    { id: A.admin.id, email: A.admin.email, name: A.admin.name, role: 'admin', permissionsVersion: 1 },
    JWT_SECRET, { expiresIn: '1h' }
  );
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-a.localhost')
    .set('Authorization', `Bearer ${legacy}`);
  expect(res.status).toBe(401);
});

test('suspended agency gets 403', async () => {
  await systemPrisma.agency.update({ where: { id: B.agency.id }, data: { status: 'suspended' } });
  const { clearAgencyCache } = require('../middleware/resolveAgency');
  clearAgencyCache();
  const res = await request(app).get('/api/clients')
    .set('Host', 'auth-b.localhost')
    .set('Authorization', `Bearer ${B.token}`);
  expect(res.status).toBe(403);
  await systemPrisma.agency.update({ where: { id: B.agency.id }, data: { status: 'active' } });
  clearAgencyCache();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd server && npx jest --config jest.integration.config.js tenantAuth`
Expected: FAIL — "agency A token lists only agency A clients" sees both clients (no tenantMiddleware yet), and scoped-login test fails (login not agency-scoped).

- [ ] **Step 4: Implement tenantMiddleware**

`server/src/middleware/tenantMiddleware.js`:
```js
const prisma = require('../lib/prisma');
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');

async function tenantMiddleware(req, res, next) {
  try {
    if (req.user?.role === 'superadmin') {
      return res.status(403).json({ error: 'Platform accounts cannot access agency APIs' });
    }
    const agencyId = req.user?.agencyId;
    if (!Number.isInteger(agencyId)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (req.agency && req.agency.id !== agencyId) {
      return res.status(401).json({ error: 'Invalid session for this agency' });
    }
    const agency = req.agency || (await prisma.agency.findUnique({ where: { id: agencyId } }));
    if (!agency) {
      return res.status(401).json({ error: 'Agency not found' });
    }
    if (agency.status !== 'active') {
      return res.status(403).json({ error: 'This agency account is suspended. Please contact support.' });
    }
    req.db = tenantClient(agencyId);
    runWithTenant(
      { agencyId, db: req.db, impersonatorId: req.user.impersonatorId ?? null },
      () => next()
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantMiddleware };
```

`server/src/routes/api.js` — at line 237, directly after `router.use(authenticate);`, add:
```js
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
router.use(tenantMiddleware);
```
(the `require` goes at the top with the other imports; `/api/platform` routes are mounted BEFORE this line in Task 11).

- [ ] **Step 5: Implement JWT + login scoping in authController.js**

In `signToken` (line 10), add to the payload object:
```js
agencyId: user.agencyId ?? null,
agencySlug: user._agencySlug ?? null,
```

In `login` (line 27): replace the user lookup (line 33) with agency scoping:
```js
const agencyId = req.agency ? req.agency.id : null;
const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), agencyId },
});
```
And on the apex domain only superadmins may log in — insert right after the `user` null-check:
```js
if (!req.agency && user.role !== 'superadmin') {
    return res.status(401).json({ error: 'Invalid email or password' });
}
```
Before calling `signToken(user, permissions)` set:
```js
user._agencySlug = req.agency ? req.agency.slug : null;
```

Apply the same `findUnique({ where: { email } })` → `findFirst({ where: { email, agencyId: req.agency?.id ?? null } })` replacement in `employeeLogin` (line 367) and `forgotPassword` (line 285). In `register` (line 102), replace the duplicate-email check the same way and add `agencyId: req.user.agencyId` to the `prisma.user.create` data (line 114) — registration always creates users in the caller's agency.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npm run test:integration` → tenantAuth all PASS, earlier suites green.
Run: `cd server && npm test` → some controller unit tests may now fail if they exercise `login` with `findUnique` mocks — update those mocks from `user.findUnique` to `user.findFirst` where needed. All green before committing.

- [ ] **Step 7: Commit**

```bash
git add server/src/middleware/tenantMiddleware.js server/src/routes/api.js server/src/controllers/authController.js server/src/__integration__
git commit -m "feat(auth): agency-bound JWTs, subdomain-scoped login, tenant middleware"
```

---

### Task 9: Controller/service sweep — all tenant data access via `req.db` / `getTenantDb()`

The big mechanical task. A guard test written FIRST defines "done": no file outside an explicit allowlist may import `lib/prisma`.

**Files:**
- Create: `server/src/__tests__/prismaImportGuard.test.js`
- Modify: every controller in `server/src/controllers/` (including `employeePortal/`) and every service in `server/src/services/` not on the allowlist
- Modify: existing unit tests that mock `../../lib/prisma`

**Interfaces:**
- Consumes: `req.db` (Task 8), `getTenantDb()` (Task 6).
- Produces: controllers use `req.db.<model>...`; services use `const db = getTenantDb()` at the top of each exported function (NOT at module load). `enrichClient`-style pure functions stay untouched.

- [ ] **Step 1: Write the failing guard test**

`server/src/__tests__/prismaImportGuard.test.js`:
```js
const { execSync } = require('child_process');
const path = require('path');

// Files allowed to touch the owner-connection system client. Everything else
// must use req.db (controllers) or getTenantDb() (services).
const ALLOWLIST = new Set([
  'src/lib/prisma.js',
  'src/lib/tenantPrisma.js',
  'src/middleware/authMiddleware.js',
  'src/middleware/resolveAgency.js',
  'src/middleware/tenantMiddleware.js',
  'src/controllers/authController.js',      // login/tenant resolution (pre-JWT)
  'src/controllers/platformController.js',  // superadmin console (Task 11)
  'src/controllers/backupController.js',    // platform backup path (Task 11)
  'src/services/auditService.js',           // fire-and-forget writes w/ explicit agencyId
  'src/socket.js',                          // handshake auth (pre-context)
  // Public-token resolvers: token lookup crosses tenants by design.
  'src/controllers/pcaFormController.js',
  'src/controllers/signingController.js',
  'src/controllers/permanentLinkController.js',
  'src/controllers/scheduleNotificationController.js',
  'src/controllers/onboardingController.js',
  'src/controllers/employeeScheduleLinkController.js',
]);

test('only allowlisted files import lib/prisma', () => {
  const serverRoot = path.join(__dirname, '../..');
  let out = '';
  try {
    out = execSync(`grep -rl "lib/prisma'" src --include='*.js'`, { cwd: serverRoot }).toString();
  } catch (e) {
    out = e.stdout ? e.stdout.toString() : '';
  }
  const offenders = out.split('\n').filter(Boolean)
    .filter((f) => !f.includes('__tests__') && !f.includes('__integration__'))
    .filter((f) => !ALLOWLIST.has(f));
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest prismaImportGuard`
Expected: FAIL with a list of ~30 offending controller/service files. That list IS the work queue for this task.

- [ ] **Step 3: Sweep controllers (work through the offender list)**

For each offending **controller**, apply this transformation:
1. Delete `const prisma = require('../lib/prisma');`
2. Inside each exported handler, replace `prisma.` with `req.db.`.
3. `prisma.$transaction([...])` batch arrays become `req.db.$transaction` **only if unavailable** — the extended client does not support batch transactions of extended queries. Convert those sites to `tenantTransaction(req.user.agencyId, async (tx) => { ... })` from `../lib/tenantPrisma`, passing explicit `agencyId` in any `tx.<model>.create` data.
4. Nested relation creates (e.g. `create: { authorizations: { create: [...] } }`): add `agencyId: req.user.agencyId` to each nested create object (the DB rejects it otherwise — integration tests catch misses).

Example — `clientController.js` `listClients`:
```js
// before
const prisma = require('../lib/prisma');
async function listClients(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const clients = await prisma.client.findMany({ ... });
// after (no prisma import at top)
async function listClients(req, res, next) {
    try {
        const where = req.query.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null };
        const clients = await req.db.client.findMany({ ... });
```

For each offending **service** (e.g. `authorizationService.js`, `schedulingService.js`, `complianceService.js`, `payrollService.js`, `taskService.js`, …): delete the module-level prisma import; at the top of each exported function that queries the DB add:
```js
const { getTenantDb } = require('../lib/tenantContext'); // top of file
// first line inside each DB-touching function:
const db = getTenantDb();
```
then replace `prisma.` with `db.` within that function. Pure helpers (no DB access) are untouched.

**Cron/startup jobs** (grep for `node-cron` usage — `grep -rn "cron" src --include='*.js'`): jobs that scan all tenants must iterate agencies explicitly:
```js
const { basePrisma } = require('../lib/tenantPrisma');
const prismaSystem = require('../lib/prisma'); // NOT allowed — instead:
// iterate via tenant clients:
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');
const agencies = await require('../lib/tenantPrisma').basePrisma.agency.findMany(...); // RLS-free? NO.
```
**Correct pattern for cron jobs** — move each job body into a per-agency function and drive it from the job file, which IS allowed to import `lib/prisma` — add that job file to the ALLOWLIST in the guard test with a comment:
```js
const prisma = require('../lib/prisma'); // allowlisted: cron driver enumerates agencies
const { tenantClient } = require('../lib/tenantPrisma');
const { runWithTenant } = require('../lib/tenantContext');

const agencies = await prisma.agency.findMany({ where: { status: 'active' } });
for (const agency of agencies) {
  const db = tenantClient(agency.id);
  await runWithTenant({ agencyId: agency.id, db }, () => runJobForAgency(db));
}
```

- [ ] **Step 4: Update existing unit tests**

Existing tests mock `../../lib/prisma` and call handlers with `mockReqRes()`. Update the shared pattern: the mocked prisma object is now also passed as `req.db`:
```js
const prisma = require('../../lib/prisma'); // still the mock object
function mockReqRes(overrides = {}) {
  const req = {
    params: {}, body: {}, query: {},
    user: { id: 1, name: 'Test Admin', role: 'admin', agencyId: 1 },
    db: prisma, // same mock — handlers now read req.db
    ...overrides,
  };
  ...
}
```
For service tests, wrap calls: `runWithTenant({ agencyId: 1, db: mockPrisma }, () => serviceFn(...))`.

- [ ] **Step 5: Run tests until green**

Run repeatedly while sweeping:
```
cd server && npx jest prismaImportGuard   # offender list shrinks to []
cd server && npm test                     # unit suite green
cd server && npm run test:integration     # tenantAuth + rls suites still green
```
All three must pass.

- [ ] **Step 6: Commit**

```bash
git add server/src
git commit -m "refactor(server): route all tenant data access through req.db / getTenantDb"
```
(Commit in smaller slices per controller group if preferred — e.g. `clients+auths`, `timesheets+pcaform`, `scheduling+payroll`, `rest` — each with the three test commands green except the guard test, which only passes on the final slice.)

---

### Task 10: Public token routes verify agency + run in tenant context

**Files:**
- Create: `server/src/lib/tokenTenant.js`
- Modify: `server/src/controllers/pcaFormController.js`, `signingController.js`, `scheduleNotificationController.js` (public view/confirm), `onboardingController.js` (public token endpoints), `employeeScheduleLinkController.js` (public schedule view)
- Create: `server/src/__integration__/publicTokens.itest.js`

**Interfaces:**
- Produces: `const { enterTokenTenant } = require('../lib/tokenTenant')`:
  ```js
  // Verifies the token's agency matches the request subdomain, then runs fn
  // inside the tenant context with req.db set. Responds 404 on mismatch.
  async function enterTokenTenant(req, res, agencyId, fn)
  ```
- Consumes: `req.agency` (Task 7), `tenantClient`, `runWithTenant`.

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/publicTokens.itest.js`:
```js
const request = require('supertest');
const app = require('../app');
const { systemPrisma, createAgencyWithAdmin, cleanupAgencies } = require('./helpers');

let A, B, link;

beforeAll(async () => {
  A = await createAgencyWithAdmin('tok-a');
  B = await createAgencyWithAdmin('tok-b');
  const client = await systemPrisma.client.create({
    data: { clientName: 'Tok Alice', agencyId: A.agency.id },
  });
  link = await systemPrisma.permanentLink.create({
    data: { clientId: client.id, pcaName: 'Tok PCA', agencyId: A.agency.id },
  });
});

afterAll(async () => {
  await cleanupAgencies(['tok-a', 'tok-b']);
  await systemPrisma.$disconnect();
});

test("agency A's pca-form token works on agency A's subdomain", async () => {
  const res = await request(app).get(`/api/pca-form/${link.token}`).set('Host', 'tok-a.localhost');
  expect(res.status).toBe(200);
});

test("agency A's pca-form token is rejected on agency B's subdomain", async () => {
  const res = await request(app).get(`/api/pca-form/${link.token}`).set('Host', 'tok-b.localhost');
  expect(res.status).toBe(404);
});

test('unknown token is a plain 404 (no agency oracle)', async () => {
  const res = await request(app).get('/api/pca-form/00000000-0000-0000-0000-000000000000').set('Host', 'tok-a.localhost');
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest --config jest.integration.config.js publicTokens`
Expected: FAIL — cross-subdomain request returns 200 (no agency check yet). (If the same-subdomain test also fails on a `req.db` reference from Task 9's sweep, that confirms this task is needed — public routes have no tenantMiddleware.)

- [ ] **Step 3: Implement the helper**

`server/src/lib/tokenTenant.js`:
```js
const { tenantClient } = require('./tenantPrisma');
const { runWithTenant } = require('./tenantContext');

/**
 * Public-token endpoints resolve their row via the system client (token
 * lookup crosses tenants by design), then MUST call this before touching
 * tenant data. 404 (not 403) on mismatch — don't confirm the token exists.
 */
function enterTokenTenant(req, res, agencyId, fn) {
  if (req.agency && req.agency.id !== agencyId) {
    res.status(404).json({ error: 'Not found' });
    return Promise.resolve();
  }
  const db = tenantClient(agencyId);
  req.db = db;
  return runWithTenant({ agencyId, db }, fn);
}

module.exports = { enterTokenTenant };
```

- [ ] **Step 4: Wire into each public handler**

Pattern (example: `pcaFormController.js` `getPcaForm`) — the handler already looks up the permanent link by token via `prisma` (allowlisted). Immediately after the token row is found (and 404'd if missing), wrap the REST of the handler body:
```js
const { enterTokenTenant } = require('../lib/tokenTenant');

async function getPcaForm(req, res, next) {
    try {
        const link = await prisma.permanentLink.findUnique({ where: { token: req.params.token } });
        if (!link) return res.status(404).json({ error: 'Link not found' });
        await enterTokenTenant(req, res, link.agencyId, async () => {
            // ...entire existing handler body, using req.db for data access...
        });
    } catch (err) { next(err); }
}
```
Apply the same wrap to: `updatePcaForm`, the `/sign/:token` resolver in `signingController.js`, schedule view/confirm handlers in `scheduleNotificationController.js` + `employeeScheduleLinkController.js`, and public onboarding-token handlers in `onboardingController.js`. Password-reset token handlers in `authController.js` already run on the system client (allowlisted) — add only the agency-match check there:
```js
if (req.agency && resetToken.agencyId !== req.agency.id) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm run test:integration` → publicTokens PASS, everything else green. `npm test` green (update any public-handler unit tests to include `agencyId` on their mocked token rows).

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/tokenTenant.js server/src/controllers server/src/__integration__/publicTokens.itest.js
git commit -m "feat(server): public token routes verify agency and run in tenant context"
```

---

### Task 11: Platform console backend — agencies CRUD, seeding, impersonation, backups

**Files:**
- Create: `server/src/controllers/platformController.js`
- Create: `server/src/routes/platform.js`
- Create: `server/prisma/seedAgencyDefaults.js` (extracted from `seed.js` + `seed-services.js`)
- Modify: `server/prisma/seed.js` (superadmin + agency #1 bootstrap; delegate reference data to `seedAgencyDefaults`)
- Modify: `server/src/routes/api.js` (mount platform routes between `authenticate` and `tenantMiddleware`)
- Modify: `server/src/controllers/backupController.js` (tenant-scope existing export; add platform variant)
- Create: `server/src/__integration__/platform.itest.js`

**Interfaces:**
- Produces:
  - `POST /api/platform/agencies` `{ name, slug, adminEmail, adminName }` → creates agency + seeds defaults (`seedAgencyDefaults`) + creates first admin (random temp password; existing forgot-password flow sets the real one) → 201 `{ agency, admin: { id, email } }`
  - `GET /api/platform/agencies` → `[{ id, name, slug, status, createdAt, userCount, clientCount }]`
  - `PUT /api/platform/agencies/:id/suspend` / `PUT /api/platform/agencies/:id/reactivate`
  - `POST /api/platform/agencies/:id/impersonate` `{ userId? }` → 30-min JWT for the agency's first active admin (or given userId) with `impersonatorId` claim → `{ token, subdomainUrl }`
  - `GET /api/platform/backup` → full-DB JSON export (old behavior)
  - `GET /api/backup/export` (existing route) → now agency-scoped via `req.db`
  - `seedAgencyDefaults(prismaClient, agencyId)` — seeds insurance types, `DEFAULT_SERVICES`, workflow triggers, admin folders for one agency (explicit `agencyId` on every create; callable with the system client)
- Consumes: `requireRole('superadmin')`, audit (Task 6), signToken shape (Task 8).

- [ ] **Step 1: Write the failing test**

`server/src/__integration__/platform.itest.js`:
```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { JWT_SECRET } = require('../config/secrets');
const { systemPrisma, cleanupAgencies } = require('./helpers');

let superToken;

beforeAll(async () => {
  const superadmin = await systemPrisma.user.create({
    data: { email: 'super@platform.test', passwordHash: await bcrypt.hash('x', 4), name: 'Super', role: 'superadmin' },
  });
  superToken = jwt.sign(
    { id: superadmin.id, email: superadmin.email, name: 'Super', role: 'superadmin',
      permissions: [], permissionsVersion: 1, agencyId: null, agencySlug: null },
    JWT_SECRET, { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await cleanupAgencies(['plat-a']);
  await systemPrisma.user.deleteMany({ where: { email: { contains: 'platform.test' } } });
  await systemPrisma.$disconnect();
});

function platformReq(method, url) {
  return request(app)[method](url).set('Host', 'localhost').set('Authorization', `Bearer ${superToken}`);
}

test('superadmin creates an agency with seeded defaults and first admin', async () => {
  const res = await platformReq('post', '/api/platform/agencies')
    .send({ name: 'Platform A', slug: 'plat-a', adminEmail: 'admin@platform.test', adminName: 'PA Admin' });
  expect(res.status).toBe(201);
  const agencyId = res.body.agency.id;
  expect(await systemPrisma.service.count({ where: { agencyId } })).toBeGreaterThan(0);
  expect(await systemPrisma.insuranceType.count({ where: { agencyId } })).toBeGreaterThan(0);
  expect(await systemPrisma.adminFolder.count({ where: { agencyId } })).toBeGreaterThan(0);
  const admin = await systemPrisma.user.findFirst({ where: { agencyId, role: 'admin' } });
  expect(admin.email).toBe('admin@platform.test');
});

test('duplicate slug is rejected', async () => {
  const res = await platformReq('post', '/api/platform/agencies')
    .send({ name: 'Dup', slug: 'plat-a', adminEmail: 'x@platform.test', adminName: 'X' });
  expect(res.status).toBe(409);
});

test('non-superadmin cannot reach platform routes', async () => {
  const { createAgencyWithAdmin } = require('./helpers');
  const t = await createAgencyWithAdmin('plat-tmp');
  const res = await request(app).get('/api/platform/agencies')
    .set('Host', 'localhost').set('Authorization', `Bearer ${t.token}`);
  expect(res.status).toBe(403);
  await cleanupAgencies(['plat-tmp']);
});

test('impersonation returns a scoped 30-min token and audits it', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const res = await platformReq('post', `/api/platform/agencies/${agency.id}/impersonate`).send({});
  expect(res.status).toBe(200);
  const payload = jwt.verify(res.body.token, JWT_SECRET);
  expect(payload.agencyId).toBe(agency.id);
  expect(payload.role).toBe('admin');
  expect(payload.impersonatorId).toBeTruthy();
  // impersonated request works on the agency subdomain
  const list = await request(app).get('/api/clients')
    .set('Host', 'plat-a.localhost').set('Authorization', `Bearer ${res.body.token}`);
  expect(list.status).toBe(200);
});

test('tenant backup is scoped; platform backup is full', async () => {
  const agency = await systemPrisma.agency.findUnique({ where: { slug: 'plat-a' } });
  const admin = await systemPrisma.user.findFirst({ where: { agencyId: agency.id, role: 'admin' } });
  const adminToken = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: 'admin',
      permissions: [], permissionsVersion: 1, agencyId: agency.id, agencySlug: 'plat-a' },
    JWT_SECRET, { expiresIn: '1h' }
  );
  const scoped = await request(app).get('/api/backup/export')
    .set('Host', 'plat-a.localhost').set('Authorization', `Bearer ${adminToken}`);
  expect(scoped.status).toBe(200);
  const scopedUsers = scoped.body.users || scoped.body.data?.users || [];
  expect(scopedUsers.every((u) => u.agencyId === agency.id)).toBe(true);

  const full = await platformReq('get', '/api/platform/backup');
  expect(full.status).toBe(200);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest --config jest.integration.config.js platform.itest`
Expected: FAIL — 404 on `/api/platform/agencies` (routes don't exist).

- [ ] **Step 3: Extract `seedAgencyDefaults`**

`server/prisma/seedAgencyDefaults.js` — move the reference data out of `seed.js`/`seed-services.js`:
```js
const DEFAULT_INSURANCE_TYPES = ['MEDICAID', 'Molina', 'SilverSummit', 'CareSource', 'Aging and Disability', 'CognitiveCare', 'Private Pay', 'Other'];

const DEFAULT_SERVICES = [
  { category: 'PCS', code: 'S5120', name: 'Chore Services' },
  { category: 'PCS', code: 'S5130', name: 'Homemaker' },
  { category: 'PCS', code: 'S5125', name: 'Attendant Care' },
  { category: 'PCS', code: 'S5150', name: 'Unskilled Respite Care' },
  { category: 'SDPC', code: 'SDPC', name: 'Self-Directed Personal Care' },
  { category: 'TIMESHEETS', code: 'TIMESHEETS', name: 'Timesheet (Private)' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_PCS', name: 'Timesheet – Personal Care Services (PCS)' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_HOMEMAKER', name: 'Timesheet – Homemaker' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_RESPITE', name: 'Timesheet – Respite' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_COMPANION', name: 'Timesheet – Companion' },
  { category: 'TIMESHEETS', code: 'TIMESHEET_CHORE', name: 'Timesheet – Chore' },
  { category: 'COPE', code: 'COPE', name: 'COPE' },
  { category: 'PAS', code: 'PAS', name: 'Personal Assistance Services' },
];

const DEFAULT_TRIGGERS = [
  { name: 'Authorization Expiry Warning', type: 'auth_expiry', thresholdDays: 30, urgency: 'high' },
  { name: 'Overdue Timesheet Follow-up', type: 'timesheet_overdue', thresholdDays: 1, urgency: 'medium' },
  { name: 'Credential Expiry Warning', type: 'credential_expiry', thresholdDays: 14, urgency: 'high' },
];

async function seedAgencyDefaults(prisma, agencyId) {
  for (const name of DEFAULT_INSURANCE_TYPES) {
    await prisma.insuranceType.upsert({
      where: { agencyId_name: { agencyId, name } },
      update: {},
      create: { name, agencyId },
    });
  }
  for (const s of DEFAULT_SERVICES) {
    await prisma.service.upsert({
      where: { agencyId_code: { agencyId, code: s.code } },
      update: { category: s.category, name: s.name },
      create: { ...s, agencyId },
    });
  }
  for (const trigger of DEFAULT_TRIGGERS) {
    const existing = await prisma.workflowTrigger.findFirst({ where: { type: trigger.type, agencyId } });
    if (!existing) await prisma.workflowTrigger.create({ data: { ...trigger, agencyId } });
  }
  const folderTree = [
    { name: 'Insurance', subs: ['Medicaid', 'UnitedHealth', 'Blue Cross Blue Shield', 'Aetna'] },
    { name: 'Eligibility', subs: ['Active', 'Pending', 'Expired'] },
  ];
  for (const folder of folderTree) {
    let root = await prisma.adminFolder.findFirst({ where: { name: folder.name, parentId: null, agencyId } });
    if (!root) {
      root = await prisma.adminFolder.create({ data: { name: folder.name, path: `/${folder.name}`, parentId: null, agencyId } });
      for (const sub of folder.subs) {
        await prisma.adminFolder.create({ data: { name: sub, path: `/${folder.name}/${sub}`, parentId: root.id, agencyId } });
      }
    }
  }
}

module.exports = { seedAgencyDefaults, DEFAULT_SERVICES };
```

Rework `server/prisma/seed.js` to:
1. Ensure agency #1 exists: `let agency = await prisma.agency.findFirst({ orderBy: { id: 'asc' } });` — if null, create with `process.env.NVBEST_AGENCY_NAME || 'NV Best PCA'` / `process.env.NVBEST_AGENCY_SLUG || 'nvbest'`.
2. Superadmin bootstrap (same never-overwrite + prod-refuses-default pattern as the current admin block, using `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`, `role: 'superadmin'`, no `agencyId`, lookup via `findFirst({ where: { email, agencyId: null } })`).
3. Keep the existing `ADMIN_EMAIL` admin block but scope it: lookup `findFirst({ where: { email, agencyId: agency.id } })`, create with `agencyId: agency.id`.
4. Replace the inline insurance/trigger/folder blocks with `await seedAgencyDefaults(prisma, agency.id);` and keep `seedPermissionGroups(prisma)` — pass `agency.id` into it and add `agencyId` to its creates (same pattern).
5. Update `server/prisma/seed-services.js` to call `seedAgencyDefaults` for agency #1 (kept as a convenience script).

- [ ] **Step 4: Implement platform controller + routes**

`server/src/controllers/platformController.js`:
```js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { seedAgencyDefaults } = require('../../prisma/seedAgencyDefaults');
const audit = require('../services/auditService');
const { JWT_SECRET } = require('../config/secrets');

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'app', 'platform', 'employee']);

async function listAgencies(req, res, next) {
  try {
    const agencies = await prisma.agency.findMany({ orderBy: { createdAt: 'asc' } });
    const enriched = await Promise.all(agencies.map(async (a) => ({
      ...a,
      userCount: await prisma.user.count({ where: { agencyId: a.id } }),
      clientCount: await prisma.client.count({ where: { agencyId: a.id, archivedAt: null } }),
    })));
    res.json(enriched);
  } catch (err) { next(err); }
}

async function createAgency(req, res, next) {
  try {
    const { name, slug, adminEmail, adminName } = req.body;
    if (!name || !slug || !adminEmail || !adminName) {
      return res.status(400).json({ error: 'name, slug, adminEmail and adminName are required' });
    }
    const cleanSlug = String(slug).toLowerCase().trim();
    if (!SLUG_RE.test(cleanSlug) || RESERVED_SLUGS.has(cleanSlug)) {
      return res.status(400).json({ error: 'Invalid slug: lowercase letters, digits and hyphens only' });
    }
    const existing = await prisma.agency.findUnique({ where: { slug: cleanSlug } });
    if (existing) return res.status(409).json({ error: 'An agency with this slug already exists' });

    const agency = await prisma.agency.create({ data: { name: name.trim(), slug: cleanSlug } });
    await seedAgencyDefaults(prisma, agency.id);
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const admin = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(tempPassword, 10),
        name: adminName.trim(),
        role: 'admin',
        agencyId: agency.id,
      },
    });
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'CREATE', entityType: 'Agency', entityId: agency.id, entityName: agency.name, metadata: { slug: cleanSlug, adminEmail: admin.email } });
    res.status(201).json({ agency, admin: { id: admin.id, email: admin.email } });
  } catch (err) { next(err); }
}

function setAgencyStatus(status) {
  return async function handler(req, res, next) {
    try {
      const id = Number(req.params.id);
      const agency = await prisma.agency.findUnique({ where: { id } });
      if (!agency) return res.status(404).json({ error: 'Agency not found' });
      const updated = await prisma.agency.update({ where: { id }, data: { status } });
      const { clearAgencyCache } = require('../middleware/resolveAgency');
      clearAgencyCache();
      audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: status === 'active' ? 'RESTORE' : 'ARCHIVE', entityType: 'Agency', entityId: id, entityName: agency.name, metadata: { status } });
      res.json(updated);
    } catch (err) { next(err); }
  };
}

async function impersonate(req, res, next) {
  try {
    const agencyId = Number(req.params.id);
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    const target = req.body.userId
      ? await prisma.user.findFirst({ where: { id: Number(req.body.userId), agencyId } })
      : await prisma.user.findFirst({ where: { agencyId, role: 'admin', archivedAt: null, active: true }, orderBy: { id: 'asc' } });
    if (!target) return res.status(404).json({ error: 'No active admin found for this agency' });
    const token = jwt.sign(
      {
        id: target.id, email: target.email, name: target.name, role: target.role,
        permissionGroupId: target.permissionGroupId ?? null, permissions: [],
        permissionsVersion: target.permissionsVersion ?? 1,
        agencyId, agencySlug: agency.slug,
        impersonatorId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );
    audit.logAction({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'UPDATE', entityType: 'Agency', entityId: agencyId, entityName: agency.name, metadata: { action: 'impersonation_started', targetUserId: target.id, targetEmail: target.email } });
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    res.json({ token, subdomainUrl: `${proto}://${agency.slug}.${process.env.BASE_DOMAIN || 'localhost'}` });
  } catch (err) { next(err); }
}

module.exports = { listAgencies, createAgency, suspendAgency: setAgencyStatus('suspended'), reactivateAgency: setAgencyStatus('active'), impersonate };
```

`server/src/routes/platform.js`:
```js
const express = require('express');
const { requireRole } = require('../middleware/authMiddleware');
const { listAgencies, createAgency, suspendAgency, reactivateAgency, impersonate } = require('../controllers/platformController');
const { platformBackup } = require('../controllers/backupController');

const router = express.Router();
router.use(requireRole('superadmin'));
router.get('/agencies', listAgencies);
router.post('/agencies', createAgency);
router.put('/agencies/:id/suspend', suspendAgency);
router.put('/agencies/:id/reactivate', reactivateAgency);
router.post('/agencies/:id/impersonate', impersonate);
router.get('/backup', platformBackup);
router.use((req, res) => res.status(404).json({ error: 'Not found' }));
module.exports = router;
```

`server/src/routes/api.js` — between `router.use(authenticate);` and `router.use(tenantMiddleware);` insert:
```js
router.use('/platform', require('./platform'));
```

`server/src/controllers/backupController.js` — refactor: extract the existing "dump all tables" logic into `async function exportAll(db)` taking a Prisma client; the existing `/api/backup/export` handler calls `exportAll(req.db)` (tenant-scoped by RLS automatically); add and export `platformBackup(req, res, next)` calling `exportAll(prisma)` (owner client, full DB). Keep the existing API-key auth path on the tenant route working — it must resolve `req.db` itself when `req.db` is unset: look up the agency from `req.agency` and use `tenantClient(req.agency.id)`, returning 404 if the request is on the apex domain.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm run test:integration` — platform.itest all PASS; full suite green; `npm test` green. Reseed check: `cd server && npm run db:seed` against the dev DB completes without error.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/platformController.js server/src/routes server/src/controllers/backupController.js server/prisma
git add server/src/__integration__/platform.itest.js
git commit -m "feat(platform): agency CRUD, per-agency seeding, audited impersonation, scoped backups"
```

---

### Task 12: Socket.IO agency scoping + CORS validator + start command

**Files:**
- Modify: `server/src/socket.js`
- Modify: `server/src/app.js` (CORS origin function)
- Modify: root `package.json` / Railway start command docs (add `node prisma/setup-app-role.js` after `migrate deploy`)
- Create: `server/src/__tests__/socketScoping.test.js`

**Interfaces:**
- Produces: socket rooms named `agency:{agencyId}:employee:{employeeId}` and `agency:{agencyId}:office`; exported pure helpers `employeeRoom(agencyId, employeeId)` and `officeRoom(agencyId)` from `socket.js`; CORS accepts any `https://<slug>.<BASE_DOMAIN>` origin.
- Consumes: JWT `agencyId` claim (Task 8), `tenantClient` (Task 5), `runWithTenant` (Task 6).

- [ ] **Step 1: Write the failing test**

`server/src/__tests__/socketScoping.test.js`:
```js
const { employeeRoom, officeRoom } = require('../socket');
const { corsOrigin } = require('../app');

test('room names are agency-prefixed', () => {
  expect(employeeRoom(3, 17)).toBe('agency:3:employee:17');
  expect(officeRoom(3)).toBe('agency:3:office');
});

describe('corsOrigin', () => {
  beforeAll(() => { process.env.BASE_DOMAIN = 'nvbestpca.com'; });
  function check(origin) {
    return new Promise((resolve) => corsOrigin(origin, (err, ok) => resolve(!err && !!ok)));
  }
  test('allows agency subdomains', async () => {
    expect(await check('https://acme.nvbestpca.com')).toBe(true);
    expect(await check('https://nvbestpca.com')).toBe(true);
  });
  test('allows localhost dev origins', async () => {
    expect(await check('http://acme.localhost:5173')).toBe(true);
    expect(await check('http://localhost:5173')).toBe(true);
  });
  test('rejects foreign origins', async () => {
    expect(await check('https://evil.com')).toBe(false);
    expect(await check('https://nvbestpca.com.evil.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest socketScoping`
Expected: FAIL — `employeeRoom` / `corsOrigin` are not exported.

- [ ] **Step 3: Implement**

`server/src/socket.js`:
1. Add pure helpers + exports:
```js
function employeeRoom(agencyId, employeeId) { return `agency:${agencyId}:employee:${employeeId}`; }
function officeRoom(agencyId) { return `agency:${agencyId}:office`; }
```
2. In the `io.use` auth middleware: after `jwt.verify`, reject sockets without a valid agency — `if (!Number.isInteger(payload.agencyId)) return next(new Error('Authentication required'));` — and store `socket.agencyId = payload.agencyId`. Replace the `prisma.employee.findUnique` lookup with `tenantClient(payload.agencyId).employee.findUnique(...)`.
3. In the connection handler: `socket.join(employeeRoom(socket.agencyId, socket.employeeId))` / `socket.join(officeRoom(socket.agencyId))`; every `io.to(...)`/`socket.to(...)` emit in `socket.js`, `chatController.js`, and `adminChatController.js` uses the helpers (those controllers get the agencyId from `getAgencyId()` or their `req.user.agencyId`).
4. Wrap each socket event handler body:
```js
const { tenantClient } = require('./lib/tenantPrisma');
const { runWithTenant } = require('./lib/tenantContext');
socket.on('chat:message', (data) =>
  runWithTenant({ agencyId: socket.agencyId, db: tenantClient(socket.agencyId) }, async () => {
    // existing handler body, prisma.* → getTenantDb().* (or a local `db` const)
  })
);
```
5. Export: `module.exports = { initSocket, getIo, employeeRoom, officeRoom };` (keep existing exports).

`server/src/app.js` — replace the static CORS origin array with a validator and export it:
```js
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true); // same-origin / curl
  const domain = (process.env.BASE_DOMAIN || 'localhost').toLowerCase();
  let host;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return callback(null, false); }
  const allowed =
    host === domain ||
    host.endsWith(`.${domain}`) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    [process.env.EMPLOYEE_APP_ORIGIN, process.env.ADMIN_APP_ORIGIN]
      .filter(Boolean)
      .some((o) => { try { return new URL(o).hostname.toLowerCase() === host; } catch { return false; } });
  callback(null, allowed);
}
app.use(cors({ origin: corsOrigin, credentials: true }));
// bottom of file:
module.exports = app;
module.exports.corsOrigin = corsOrigin;
```
(Change the export to `module.exports = app; module.exports.corsOrigin = corsOrigin;` — `require('../app')` call sites keep working because `app` is a function object.)

Socket.IO server CORS in `socket.js` uses the same validator: `cors: { origin: require('./app').corsOrigin, methods: ['GET', 'POST'] }` — or import the function via a small shared module if that creates a require cycle: create `server/src/lib/corsOrigin.js` holding the function and import it from both `app.js` and `socket.js` (preferred; do this if `require('./app')` inside socket.js is cyclic — it is, since index.js requires both. Use the shared module).

**Start command:** update the deploy start sequence (root `package.json` `start` script or Railway settings doc line in CLAUDE.md) from `prisma migrate deploy && node prisma/seed.js && node src/index.js` to `prisma migrate deploy && node prisma/setup-app-role.js && node prisma/seed.js && node src/index.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest socketScoping` → PASS. `npm test` and `npm run test:integration` → green.

- [ ] **Step 5: Commit**

```bash
git add server/src/socket.js server/src/app.js server/src/lib/corsOrigin.js server/src/__tests__/socketScoping.test.js package.json
git commit -m "feat(server): agency-scoped socket rooms and wildcard-subdomain CORS"
```

---

### Task 13: Storage key prefixes + import script `--agency` flag

**Files:**
- Modify: `server/src/services/storageService.js` (add + use `tenantKey`)
- Modify: `server/prisma/import-xlsx.js` (require `--agency <slug>`)
- Create: `server/src/services/__tests__/storageTenantKey.test.js`

**Interfaces:**
- Produces: `tenantKey(key)` exported from `storageService.js` — returns `agency/{agencyId}/{key}` inside a tenant context, `key` unchanged outside one. All NEW upload key generation in `storageService.js`/file controllers wraps keys with `tenantKey`; existing stored keys are untouched (DB row RLS is the access control).
- `node prisma/import-xlsx.js --agency <slug>` — refuses to run without the flag; stamps `agencyId` on every created client/authorization.

- [ ] **Step 1: Write the failing test**

`server/src/services/__tests__/storageTenantKey.test.js`:
```js
const { tenantKey } = require('../storageService');
const { runWithTenant } = require('../../lib/tenantContext');

test('prefixes with agency id inside tenant context', async () => {
  await runWithTenant({ agencyId: 5, db: {} }, async () => {
    expect(tenantKey('admin-files/report.pdf')).toBe('agency/5/admin-files/report.pdf');
  });
});

test('returns key unchanged outside tenant context (platform/legacy)', () => {
  expect(tenantKey('admin-files/report.pdf')).toBe('admin-files/report.pdf');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx jest storageTenantKey`
Expected: FAIL — `tenantKey` is not exported.

- [ ] **Step 3: Implement**

In `server/src/services/storageService.js`, add and export:
```js
const { getAgencyId } = require('../lib/tenantContext');

function tenantKey(key) {
  const agencyId = getAgencyId();
  return agencyId ? `agency/${agencyId}/${key}` : key;
}
```
Find every place a NEW storage key is generated for upload (grep: `grep -n "storageKey\|uploads/" server/src/services/storageService.js server/src/controllers/fileManagerController.js server/src/controllers/documentController.js server/src/controllers/authDocumentController.js server/src/controllers/employeeCertController.js`) and wrap the generated key: `storageKey: tenantKey(generatedKey)`. Reads/deletes use the stored `storageKey` from the DB row unchanged — no migration of old keys.

In `server/prisma/import-xlsx.js`, at the top of `main()`:
```js
const slugIdx = process.argv.indexOf('--agency');
const slug = slugIdx > -1 ? process.argv[slugIdx + 1] : null;
if (!slug) {
  console.error('Usage: node prisma/import-xlsx.js --agency <slug>');
  process.exit(1);
}
const agency = await prisma.agency.findUnique({ where: { slug } });
if (!agency) {
  console.error(`Agency not found: ${slug}`);
  process.exit(1);
}
```
then add `agencyId: agency.id` to every `create` data object in the script.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest storageTenantKey` → PASS. `npm test` green. Manual check: `node prisma/import-xlsx.js` (no flag) exits 1 with usage text.

- [ ] **Step 5: Commit**

```bash
git add server/src/services server/prisma/import-xlsx.js
git commit -m "feat(files): agency-prefixed storage keys; import script requires --agency"
```

---

### Task 14: Frontend — platform console page, agency-not-found screen, HistoryPage entity

**Files:**
- Create: `client/vitest.config.js`, `client/src/test/setup.js`
- Create: `client/src/pages/PlatformPage.jsx`
- Create: `client/src/pages/__tests__/PlatformPage.test.jsx`
- Modify: `client/src/api.js` (platform endpoints + `getAgencyInfo`)
- Modify: `client/src/App.jsx` or router file (add `/platform` route, superadmin gate)
- Modify: `client/src/pages/LoginPage.jsx` (agency-not-found handling)
- Modify: `client/src/pages/HistoryPage.jsx` (`ENTITY_TYPES` + `'Agency'`)
- Modify: `server/src/routes/api.js` + `server/src/controllers/platformController.js` (tiny public `GET /api/agency-info`)
- Modify: `client/package.json` (vitest deps + `test` script)

**Interfaces:**
- Consumes: Task 11 API (`GET/POST /api/platform/agencies`, suspend/reactivate, impersonate).
- Produces: `api.js` exports `listPlatformAgencies()`, `createPlatformAgency(payload)`, `suspendAgency(id)`, `reactivateAgency(id)`, `impersonateAgency(id)`, `getAgencyInfo()`; public server route `GET /api/agency-info` → `{ name, slug }` for the current subdomain (404 on apex/unknown); `/platform` React route.

- [ ] **Step 1: Set up Vitest and write the failing test**

```bash
cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`client/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'], globals: true },
});
```
`client/src/test/setup.js`:
```js
import '@testing-library/jest-dom/vitest';
```
`client/package.json` scripts: add `"test": "vitest run"`.

`client/src/pages/__tests__/PlatformPage.test.jsx`:
```jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../api', () => ({
  listPlatformAgencies: vi.fn().mockResolvedValue([
    { id: 1, name: 'NV Best PCA', slug: 'nvbest', status: 'active', userCount: 4, clientCount: 12, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'Acme Care', slug: 'acme', status: 'suspended', userCount: 1, clientCount: 0, createdAt: '2026-06-01T00:00:00Z' },
  ]),
  createPlatformAgency: vi.fn().mockResolvedValue({ agency: { id: 3 } }),
  suspendAgency: vi.fn(),
  reactivateAgency: vi.fn(),
  impersonateAgency: vi.fn().mockResolvedValue({ token: 't', subdomainUrl: 'http://acme.localhost' }),
}));

import * as api from '../../api';
import PlatformPage from '../PlatformPage';

function renderPage() {
  return render(<MemoryRouter><PlatformPage /></MemoryRouter>);
}

test('lists agencies with status and counts', async () => {
  renderPage();
  expect(await screen.findByText('NV Best PCA')).toBeInTheDocument();
  expect(screen.getByText('Acme Care')).toBeInTheDocument();
  expect(screen.getByText(/suspended/i)).toBeInTheDocument();
});

test('create agency form submits name, slug and admin details', async () => {
  renderPage();
  await screen.findByText('NV Best PCA');
  fireEvent.click(screen.getByRole('button', { name: /new agency/i }));
  fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: 'Beta Care' } });
  fireEvent.change(screen.getByLabelText(/subdomain/i), { target: { value: 'beta' } });
  fireEvent.change(screen.getByLabelText(/admin email/i), { target: { value: 'a@beta.test' } });
  fireEvent.change(screen.getByLabelText(/admin name/i), { target: { value: 'Beta Admin' } });
  fireEvent.click(screen.getByRole('button', { name: /create agency/i }));
  await waitFor(() =>
    expect(api.createPlatformAgency).toHaveBeenCalledWith({
      name: 'Beta Care', slug: 'beta', adminEmail: 'a@beta.test', adminName: 'Beta Admin',
    })
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npm test`
Expected: FAIL — `Cannot find module '../PlatformPage'` (and missing api exports).

- [ ] **Step 3: Implement**

`client/src/api.js` — add (follow the existing helper pattern in the file for auth headers/error handling):
```js
export const listPlatformAgencies = () => request('/platform/agencies');
export const createPlatformAgency = (payload) => request('/platform/agencies', { method: 'POST', body: payload });
export const suspendAgency = (id) => request(`/platform/agencies/${id}/suspend`, { method: 'PUT' });
export const reactivateAgency = (id) => request(`/platform/agencies/${id}/reactivate`, { method: 'PUT' });
export const impersonateAgency = (id) => request(`/platform/agencies/${id}/impersonate`, { method: 'POST', body: {} });
export const getAgencyInfo = () => request('/agency-info');
```
(match the file's actual `request`/fetch helper names — one named export per endpoint, exactly like neighboring exports.)

`client/src/pages/PlatformPage.jsx` — follow the mandatory page pattern (read `docs/superpowers/specs/2026-06-01-design-system-design.md` first): `GlobalToolbar` (title "Platform", `activityEntity="Agency"`, `undoState` from `useUndoStack` wired to suspend/reactivate mutations), `ContextBar` with search left and "New Agency" button right, `.data-table--sheet` table with columns Name / Subdomain / Status / Users / Clients / Created / Actions. Actions per row: Suspend or Reactivate (with `ConfirmModal`), Impersonate (calls `impersonateAgency`, then `window.open(subdomainUrl + '?impersonate=' + token)`). "New Agency" opens a `Modal` with labeled inputs (Agency Name, Subdomain, Admin Email, Admin Name — `<label htmlFor>` so the tests' `getByLabelText` works) submitting via `createPlatformAgency`, toast on success, list refresh. All mutations already audit server-side.

Routing: add `/platform` route rendering `PlatformPage`, gated on `authUser.role === 'superadmin'` (redirect to `/dashboard` otherwise); superadmins logging in land on `/platform`. Sidebar: show only the Platform link for superadmins.

`GET /api/agency-info`: in `platformController.js` add
```js
async function agencyInfo(req, res) {
  if (!req.agency) return res.status(404).json({ error: 'Agency not found' });
  res.json({ name: req.agency.name, slug: req.agency.slug });
}
```
and register it in `routes/api.js` ABOVE `router.use(authenticate)` (public): `router.get('/agency-info', agencyInfo);`.

`LoginPage.jsx`: on mount call `getAgencyInfo()`; on 404 render the "agency not found" screen (`No agency exists at this address. Check the web address or contact support.`) instead of the login form — except when the hostname equals the apex domain (no subdomain part), where the form renders as the platform login. Show the agency name above the form when resolved.

`HistoryPage.jsx`: add `'Agency'` to the `ENTITY_TYPES` array.

- [ ] **Step 4: Run tests + build**

Run: `cd client && npm test` → PASS. `cd client && npm run build` → builds clean. `cd server && npm test && npm run test:integration` → green (agency-info route is additive).

- [ ] **Step 5: Commit**

```bash
git add client server/src/routes/api.js server/src/controllers/platformController.js
git commit -m "feat(client): platform console page, agency-not-found screen, vitest setup"
```

---

### Task 15: Full-system verification, docs, CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-09-multi-tenancy-foundation-design.md` (record the two accepted deviations)

- [ ] **Step 1: Run everything**

```bash
cd server && npm test && npm run test:integration
cd ../client && npm test && npm run build
```
All green, build clean. Fix anything that isn't before proceeding.

- [ ] **Step 2: Manual smoke test**

```bash
cd server && npm run dev
```
Then verify in a browser: `http://nvbest.localhost:4000` shows the agency login and existing admin can log in; `http://localhost:4000` shows platform login (superadmin from seed); `http://ghost.localhost:4000` shows "agency not found"; create a second agency from `/platform`, log into it on its subdomain, confirm its Clients page is empty and creating a client there never appears under `nvbest`.

- [ ] **Step 3: Update docs**

`CLAUDE.md`:
- Auth section: roles are now `superadmin` / `admin` / `user` / `pca`; JWTs carry `agencyId` + `agencySlug` and only work on their agency's subdomain.
- Architecture: document `lib/tenantPrisma.js` (tenantClient/tenantTransaction), `lib/tenantContext.js` (getTenantDb), `middleware/resolveAgency.js` + `middleware/tenantMiddleware.js`, and the rule: **controllers use `req.db`, services use `getTenantDb()`; `lib/prisma` is allowlist-only (see `src/__tests__/prismaImportGuard.test.js`)**.
- Key commands: `npm run test:integration`; `node prisma/import-xlsx.js --agency <slug>`; start sequence now includes `node prisma/setup-app-role.js`.
- Deployment env vars: add `BASE_DOMAIN`, `APP_DATABASE_URL`, `APP_DB_PASSWORD`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`; note the Railway wildcard-domain requirement (`*.BASE_DOMAIN` + wildcard CNAME) and the per-agency-domain fallback.
- Data model section: add Agency; note every tenant table carries `agency_id` under RLS.

Spec deviations to record at the bottom of the spec file:
1. Agency #1 is created inside migration 1 with static values (`'NV Best PCA'`/`'nvbest'`) because migrations can't read env vars; `NVBEST_AGENCY_NAME`/`NVBEST_AGENCY_SLUG` apply only on a fresh DB via seed, and the name is editable from the platform console.
2. The lint guard is a Jest test (`prismaImportGuard.test.js`) rather than an ESLint rule — the server has no ESLint config, and a failing test blocks CI the same way.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: multi-tenancy architecture, env vars, and tenant data-access rules"
```

---

## Post-plan follow-ups (separate specs, do NOT do here)

- Server-side pagination + indexes (next workstream).
- Redis Socket.IO adapter for multi-node.
- Railway wildcard domain verification happens at deploy time (Task 15 documents it; actual DNS work is ops, not code).
