// Runs ONCE before any test worker starts (Jest globalSetup — separate process,
// no access to require() caches the workers will build). Provisions the
// dedicated unit-test database so `npm test` works on a cold checkout with no
// manual `createdb`/`migrate` step, mirroring the integration harness in
// src/__integration__/globalSetup.js.
//
// jest.setup.js (a `setupFiles` entry, loaded per-worker) resolves the same
// DATABASE_URL from server/.env.test (or its fallback) — that resolution is
// duplicated here on purpose since globalSetup and setupFiles run in separate
// processes and can't share module state.
const { execSync } = require('child_process');
const path = require('path');

function resolveTestDatabaseUrl() {
    require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });
    const url = process.env.DATABASE_URL;
    if (url && /_test(\?|$)/.test(url)) return url;
    return 'postgresql://mac@localhost:5432/nvbestpca_authlifecycle_test';
}

module.exports = async () => {
    const testDbUrl = resolveTestDatabaseUrl();
    const dbName = new URL(testDbUrl).pathname.replace(/^\//, '');
    const env = { ...process.env, DATABASE_URL: testDbUrl };

    // Create the test DB if missing (ignore "already exists").
    try {
        execSync(`createdb ${dbName}`, { stdio: 'pipe' });
    } catch (err) {
        if (!String(err.stderr).includes('already exists')) throw err;
    }

    const serverDir = __dirname;
    const prismaBinary = path.join(serverDir, 'node_modules/.bin/prisma');
    execSync(`${prismaBinary} migrate deploy`, {
        cwd: serverDir,
        env,
        stdio: 'inherit',
    });

    // Seed reference data (default agency #1 + an `admin`-role user). Several
    // unit suites assume these exist (e.g. permissionGroupController.test.js
    // looks up an existing role:'admin' user). prisma/seed.js is idempotent —
    // it never overwrites an existing admin/agency — so this is safe to rerun
    // on every `npm test` invocation, not just the first cold one.
    execSync('node prisma/seed.js', {
        cwd: serverDir,
        env,
        stdio: 'inherit',
    });
};
