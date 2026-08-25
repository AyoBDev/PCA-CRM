// Runs once per test worker, BEFORE the test framework and BEFORE any test
// module (including Prisma) is imported. Three jobs:
//
// 1. Point tests at a dedicated, drift-free test database instead of the shared
//    dev DB. The URL comes from server/.env.test if present, otherwise a local
//    default. Set here so it wins before PrismaClient() reads process.env.
//    The database itself (schema + migrations) is provisioned by
//    jest.globalSetup.js, which runs once before any worker starts — see that
//    file for the cold-start `createdb` + `prisma migrate deploy` step.
//
// 2. Default the PHI-at-rest / signature-integrity keys so `npm test` works
//    on a cold checkout with no `.env.test` at all. Fixed dev values mirror
//    src/__integration__/setupEnv.js so unit and integration runs behave the
//    same way; override via server/.env.test (copy .env.test.example) if you
//    need different values locally.
//
// 3. Fail loudly if the process timezone is not UTC. Several date assertions
//    round-trip date-only values through `.toISOString()` (UTC); under a non-UTC
//    zone (e.g. Africa/Lagos, UTC+1) they drift by a day. TZ must be set at
//    process launch — setting process.env.TZ here is too late, Node has already
//    cached it. The `test` npm script sets `TZ=UTC`; run tests via `npm test`
//    (or prefix `TZ=UTC` on a direct `npx jest` invocation).
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.test') });

if (!process.env.DATABASE_URL || !/_test(\?|$)/.test(process.env.DATABASE_URL)) {
    // Guard: never let tests run against a non-test database. If .env.test is
    // missing or points somewhere unexpected, fall back to the known test DB.
    process.env.DATABASE_URL =
        'postgresql://mac@localhost:5432/nvbestpca_authlifecycle_test';
}

// PHI-at-rest encryption key + timesheet-signature HMAC key — required so PHI
// writes (Client.medicaidId/dob/notes/pcaNotes, Employee.dob/notes,
// HospitalVisit.*) and signed-timesheet submits don't throw under test. Fixed
// values keep unit runs deterministic across machines; same values as
// src/__integration__/setupEnv.js.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e'.repeat(64);
process.env.INTEGRITY_KEY = process.env.INTEGRITY_KEY || 'f'.repeat(64);

// Verify the effective timezone rather than trusting process.env.TZ (which Node
// only honors when set at launch). A real Date tells the truth.
const janOffset = new Date('2026-01-01T00:00:00Z').getTimezoneOffset();
if (janOffset !== 0) {
    throw new Error(
        `Tests require UTC (found offset ${janOffset} min). ` +
        `Run them with "npm test" or prefix "TZ=UTC" — date assertions drift otherwise.`
    );
}
