/**
 * Find (and optionally delete) stored files that no DB row references any more.
 *
 * Deletes before the storage-cleanup fix landed removed the DB row but left the
 * bytes behind, so storage still carries files nothing points at. This walks
 * every prefix the app writes to, subtracts every key still referenced by the
 * database, and reports what is left over.
 *
 * SAFETY — this permanently deletes files, so it is built to fail closed:
 *   - Dry run by default. Nothing is deleted without --execute.
 *   - Every key-holding table is read FIRST. If any of those queries fails the
 *     run aborts, rather than treating that table's live files as orphans — a
 *     partial reference set would delete data that is still in use.
 *   - Only keys under a known prefix are considered. Anything else is reported
 *     as "unrecognized" and never deleted.
 *   - Files newer than --min-age-days (default 7) are skipped, so an upload
 *     racing this scan can't be collected before its row is committed. A file
 *     whose backend reports NO last-modified time is skipped too — unknown age
 *     fails closed rather than being assumed old.
 *   - --execute writes a JSON manifest of everything it deleted.
 *
 * TWO STORAGE MODULES: admin files (the File Manager) go through
 * services/storageService.js, whose local root is uploads/admin-files, while
 * everything else goes through lib/storage.js rooted at uploads. Each owner
 * below therefore declares which module reads it — mixing them up would make
 * every File Manager file look unreferenced.
 *
 * Cross-tenant by design (it reconciles all storage), so it uses the owner
 * connection like the other maintenance scripts here.
 *
 * Usage:
 *   node scripts/reconcile-orphaned-files.js                    # dry run
 *   node scripts/reconcile-orphaned-files.js --verbose          # list every orphan
 *   node scripts/reconcile-orphaned-files.js --min-age-days=30  # more conservative
 *   node scripts/reconcile-orphaned-files.js --execute          # delete them
 */

'use strict';

const fs = require('fs');
const path = require('path');
// Load env before requiring prisma/storage — they read DATABASE_URL and the
// bucket vars at import time. Anchored to the script's own location so this
// works regardless of the directory it is invoked from.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/lib/prisma');
const libStorage = require('../src/lib/storage');
const adminStorage = require('../src/services/storageService');

// The two storage backends. Each enumerates and deletes through its own module,
// since their key namespaces differ (see the note above).
const MODULES = {
    lib: {
        listObjects: (p) => libStorage.listObjects(p),
        deleteFile: (k) => libStorage.deleteFile(k),
    },
    admin: {
        listObjects: (p) => adminStorage.listObjects(p),
        deleteFile: (k) => adminStorage.remove(k),
    },
};

// Every prefix the app writes under, the table/column that owns it, and which
// storage module reads it. A prefix missing here makes its files look like
// orphans, so a new upload location must be added to this list too.
const OWNERS = [
    // client_documents carries BOTH a legacy "documents/" prefix and the
    // current "client-documents/" one; both are still referenced.
    { label: 'client documents (legacy)', prefix: 'documents/', table: 'client_documents', column: 'file_path', module: 'lib' },
    { label: 'client documents', prefix: 'client-documents/', table: 'client_documents', column: 'file_path', module: 'lib' },
    { label: 'auth documents', prefix: 'auth-documents/', table: 'authorization_documents', column: 'file_path', module: 'lib' },
    { label: 'lead documents', prefix: 'lead-documents/', table: 'lead_documents', column: 'file_path', module: 'lib' },
    { label: 'certification uploads', prefix: 'certs/', table: 'certification_uploads', column: 'bucket_key', module: 'lib' },
    { label: 'employee documents', prefix: 'employee-docs/', table: 'employee_documents', column: 'storage_key', module: 'lib' },
    { label: 'policy documents', prefix: 'policy-documents/', table: 'policy_documents', column: 'file_key', module: 'lib' },
    { label: 'admin files', prefix: 'admin-files/', table: 'admin_files', column: 'storage_key', module: 'admin' },
];

// Some uploaders namespace keys per tenant ("agency/<id>/certs/..."), others
// store them bare ("certs/..."), so a prefix has to match either shape.
const TENANT_RE = /^agency\/\d+\//;

const stripTenant = (key) => key.replace(TENANT_RE, '');

/** True when `key` lives under `prefix`, tenant-prefixed or not. */
function matchesPrefix(key, prefix) {
    return key.startsWith(prefix) || stripTenant(key).startsWith(prefix);
}

/** The owner whose prefix this key falls under, or null if outside all of them. */
function ownerFor(key, owners = OWNERS) {
    return owners.find((o) => matchesPrefix(key, o.prefix)) || null;
}

/**
 * Partition stored keys into orphans (collectable), referenced, and
 * unrecognized (outside every known prefix — reported, never deleted).
 *
 * Pure, so classification is testable without storage or a database.
 */
function classifyKeys({ storedKeys, referenced, owners = OWNERS }) {
    const orphans = [];
    const unrecognized = [];
    let referencedCount = 0;

    for (const entry of storedKeys) {
        const { key, module, mtimeMs } = typeof entry === 'string'
            ? { key: entry, module: 'lib', mtimeMs: null }
            : entry;
        // Match on the stored shape or its tenant-stripped alias, so a bare key
        // in the DB still matches a tenant-prefixed object and vice versa.
        if (referenced.has(key) || referenced.has(stripTenant(key))) { referencedCount++; continue; }
        const owner = ownerFor(key, owners);
        if (!owner) { unrecognized.push(key); continue; }
        orphans.push({ key, owner: owner.label, module, mtimeMs: mtimeMs ?? null });
    }
    return { orphans, unrecognized, referencedCount };
}

/**
 * Collect every storage key the database still references.
 *
 * Throws if ANY table fails to read. That is deliberate: an incomplete
 * reference set makes live files look orphaned, and the caller deletes based on
 * it, so failing the whole run is the safe outcome.
 */
async function collectReferencedKeys(db = prisma, owners = OWNERS) {
    const referenced = new Set();
    const perTable = [];

    // Several owners share a table (client_documents has two prefixes), so read
    // each distinct table once.
    const seen = new Set();
    for (const owner of owners) {
        const id = `${owner.table}.${owner.column}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const rows = await db.$queryRawUnsafe(
            `SELECT "${owner.column}" AS key FROM "${owner.table}" WHERE "${owner.column}" IS NOT NULL AND "${owner.column}" <> ''`
        );
        for (const row of rows) {
            if (!row.key) continue;
            referenced.add(row.key);
            referenced.add(stripTenant(row.key));
        }
        perTable.push({ table: owner.table, count: rows.length });
    }
    return { referenced, perTable };
}

function parseArgs(argv) {
    const execute = argv.includes('--execute');
    const verbose = argv.includes('--verbose');
    const ageArg = argv.find((a) => a.startsWith('--min-age-days='));
    const minAgeDays = ageArg ? Number(ageArg.split('=')[1]) : 7;
    if (!Number.isFinite(minAgeDays) || minAgeDays < 0) {
        throw new Error(`--min-age-days must be a non-negative number (got "${ageArg}")`);
    }
    return { execute, verbose, minAgeDays };
}

/**
 * Split orphans into what is safe to collect, what is too recent, and what has
 * no known age.
 *
 * FAIL-CLOSED: an unknown mtime (null) is never collectable. Object storage
 * does not always report a last-modified time, and treating "unknown" as "old
 * enough" would let this delete a file uploaded seconds ago whose DB row has
 * not committed yet. Unknown-age files are reported so an operator can decide.
 */
function partitionByAge(orphans, minAgeDays, now = Date.now()) {
    const cutoff = now - minAgeDays * 86400000;
    const collectable = [];
    const tooNew = [];
    const unknownAge = [];

    for (const o of orphans) {
        if (o.mtimeMs === null || o.mtimeMs === undefined || !Number.isFinite(o.mtimeMs)) {
            unknownAge.push(o);
        } else if (o.mtimeMs > cutoff) {
            tooNew.push(o);
        } else {
            collectable.push(o);
        }
    }
    return { collectable, tooNew, unknownAge };
}

/** Tenant-scoped variants of a prefix, since some uploaders namespace per agency. */
async function tenantPrefixes(prefix) {
    try {
        const agencies = await prisma.agency.findMany({ select: { id: true } });
        return agencies.map((a) => `agency/${a.id}/${prefix}`);
    } catch {
        return [];
    }
}

async function main() {
    const { execute, verbose, minAgeDays } = parseArgs(process.argv.slice(2));

    console.log(execute
        ? '=== EXECUTE — orphaned files will be PERMANENTLY DELETED ==='
        : '=== DRY RUN — nothing will be deleted (pass --execute to delete) ===');
    console.log(`Skipping files modified in the last ${minAgeDays} day(s).\n`);

    // 1. Reference set first. If this throws we never reach the delete step.
    let referenced, perTable;
    try {
        ({ referenced, perTable } = await collectReferencedKeys());
    } catch (err) {
        console.error('ABORT — could not read every key-holding table, so orphans cannot be');
        console.error('determined safely. No files were touched.');
        console.error(`Reason: ${err.message}`);
        process.exitCode = 1;
        return;
    }

    console.log('Referenced keys in the database:');
    for (const t of perTable) console.log(`  ${String(t.count).padStart(6)}  ${t.table}`);
    console.log(`  ${String(referenced.size).padStart(6)}  distinct (incl. tenant-stripped aliases)\n`);

    // 2. Everything currently stored, scanned per module so admin files are read
    //    through the module whose root they actually live under.
    const storedKeys = [];
    const scanFailures = [];
    for (const owner of OWNERS) {
        const mod = MODULES[owner.module];
        for (const p of [owner.prefix, ...(await tenantPrefixes(owner.prefix))]) {
            try {
                for (const obj of await mod.listObjects(p)) {
                    storedKeys.push({ key: obj.key, module: owner.module, mtimeMs: obj.mtimeMs });
                }
            } catch (err) {
                scanFailures.push(`${owner.module}:${p} — ${err.message}`);
            }
        }
    }

    // A prefix we couldn't scan is unknown territory, not proof of absence.
    // Report it, and refuse to delete anything on this run.
    if (scanFailures.length) {
        console.error('ABORT — could not list every storage prefix, so orphans cannot be');
        console.error('determined safely. No files were touched.');
        for (const f of scanFailures) console.error(`  ! ${f}`);
        process.exitCode = 1;
        return;
    }

    // Dedupe on module+key (tenant and bare prefixes can both match a file).
    const uniqueStored = [...new Map(storedKeys.map((e) => [`${e.module}:${e.key}`, e])).values()];
    console.log(`Stored objects found: ${uniqueStored.length}\n`);

    // 3. Classify.
    const { orphans, unrecognized, referencedCount } = classifyKeys({ storedKeys: uniqueStored, referenced });

    // 4. Age filter — never collect a file young enough to belong to an
    //    in-flight upload whose row hasn't been committed yet, nor one whose
    //    age the backend didn't report.
    const { collectable, tooNew, unknownAge } = partitionByAge(orphans, minAgeDays);

    const byOwner = {};
    for (const o of collectable) byOwner[o.owner] = (byOwner[o.owner] || 0) + 1;

    console.log('--- Summary ---');
    console.log(`  referenced (in use)     : ${referencedCount}`);
    console.log(`  orphaned, collectable   : ${collectable.length}`);
    console.log(`  orphaned, too recent    : ${tooNew.length}  (< ${minAgeDays}d old, skipped)`);
    console.log(`  orphaned, age unknown   : ${unknownAge.length}  (no mtime reported, skipped)`);
    console.log(`  unrecognized prefix     : ${unrecognized.length}  (never deleted)`);
    if (collectable.length) {
        console.log('\n  Collectable orphans by owner:');
        for (const [label, n] of Object.entries(byOwner)) {
            console.log(`    ${String(n).padStart(6)}  ${label}`);
        }
    }
    if (unknownAge.length) {
        console.log('\n  Skipped — storage reported no last-modified time, so their age');
        console.log('  cannot be confirmed. Verify these by hand before removing them:');
        for (const o of unknownAge.slice(0, 10)) console.log(`    [${o.owner}] ${o.key}`);
        if (unknownAge.length > 10) console.log(`    … and ${unknownAge.length - 10} more`);
    }
    if (unrecognized.length) {
        console.log('\n  Unrecognized keys (add a prefix to OWNERS if these are ours):');
        for (const k of unrecognized.slice(0, 10)) console.log(`    ${k}`);
        if (unrecognized.length > 10) console.log(`    … and ${unrecognized.length - 10} more`);
    }
    if (verbose && collectable.length) {
        console.log('\n  Orphans:');
        for (const o of collectable) console.log(`    [${o.owner}] ${o.key}`);
    }

    if (!collectable.length) {
        console.log('\nNothing to collect.');
        return;
    }

    if (!execute) {
        console.log(`\nDry run — re-run with --execute to delete these ${collectable.length} file(s).`);
        if (!verbose) console.log('Add --verbose to list them first.');
        return;
    }

    // 5. Delete, recording exactly what went.
    console.log(`\nDeleting ${collectable.length} orphaned file(s)…`);
    const deleted = [];
    const failed = [];
    for (const o of collectable) {
        try {
            await MODULES[o.module].deleteFile(o.key);
            deleted.push(o.key);
        } catch (err) {
            failed.push({ key: o.key, error: err.message });
        }
    }

    const manifest = path.join(__dirname, '..', 'tmp', `orphan-cleanup-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({
        ranAt: new Date().toISOString(), minAgeDays, deleted, failed,
        skippedTooNew: tooNew.length, skippedUnknownAge: unknownAge.length,
    }, null, 2));

    console.log(`  deleted : ${deleted.length}`);
    console.log(`  failed  : ${failed.length}`);
    for (const f of failed.slice(0, 10)) console.log(`    ! ${f.key}: ${f.error}`);
    console.log(`\nManifest written to ${manifest}`);
}

module.exports = { classifyKeys, collectReferencedKeys, ownerFor, stripTenant, matchesPrefix, parseArgs, partitionByAge, OWNERS, MODULES };

if (require.main === module) {
    main()
        .catch((err) => { console.error(err); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
