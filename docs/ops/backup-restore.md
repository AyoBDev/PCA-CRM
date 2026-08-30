# Backup & Restore Runbook

**Scope:** how the PCA CRM data is backed up and how to restore it. Answers the
security-review question: *"Backups run automatically — and restore has been
tested."*

---

## 1. What backups exist

| Backup | Mechanism | Coverage | Frequency |
|--------|-----------|----------|-----------|
| **Railway managed PostgreSQL** | Railway platform | Full database (physical) | Automatic daily |
| **JSON export (platform)** | `GET /api/platform/backup` (superadmin) | All 57 tables, cross-tenant, camelCase JSON | On demand |
| **JSON export (per-agency)** | `GET /api/backup/export` (admin) / Dashboard "Backup" | One agency's data | On demand |

The JSON export is **schema-driven** — it lists tables from `information_schema`,
so it automatically covers new tables as the schema grows (`backupController.js`).

The Railway physical backup is the primary disaster-recovery mechanism. The JSON
export is a portable, human-readable secondary (and the one exercised by the
restore test below).

## 2. How to restore a JSON backup

Restore into an **empty** target database (a fresh restore environment — never
overwrite a live DB you haven't first snapshotted).

```bash
cd server

# 1. Point at the restore target and apply the schema.
export DATABASE_URL="postgresql://<user>@<host>:5432/<restore_db>"
npx prisma migrate deploy

# 2. Restore the data.
node prisma/import-backup.js /path/to/backup.json
```

`prisma/import-backup.js` wraps `src/lib/restoreBackup.js`, which:

- restores **every table present in the backup**, matched against the live
  schema's real columns (no hardcoded table list — the old script only knew 17 of
  57 tables and silently dropped the rest);
- coerces `timestamp`/`date` columns to dates and binds `json`/`jsonb` columns
  correctly;
- loads with foreign-key checks deferred (`session_replication_role='replica'`),
  so no hand-maintained FK order is needed and self-referencing tables load fine;
- resets each table's id sequence so new inserts don't collide;
- uses `INSERT ... ON CONFLICT DO NOTHING`, so a re-run won't duplicate rows (but
  it does **not** overwrite existing rows — restore into an empty DB).

Runs on the owner connection (`DATABASE_URL`). Tables in the backup that the
current schema no longer models are reported as "skipped", not silently ignored.

## 3. Restore from a Railway physical backup

Use Railway's own backup/restore for a full physical recovery (fastest path for a
total-loss incident): in the Railway dashboard, open the Postgres service →
Backups → restore the chosen snapshot to a new database, then point the app's
`DATABASE_URL` at it. The JSON path above is for portable/partial restores and for
the automated restore test.

## 4. Restore has been tested

`src/__integration__/backupRoundTrip.itest.js` is an automated end-to-end proof:
it exports a real platform backup, restores it into a **fresh scratch database**,
and asserts that **every table's row count matches** and that no exported table is
silently dropped. It runs as part of `npm run test:integration`.

To re-run just the restore test:

```bash
cd server && npm run test:integration -- --testPathPattern=backupRoundTrip
```

## 5. After any restore — verify

- App boots and `GET /health` returns `{"status":"ok"}`.
- Log in on an agency subdomain; spot-check clients, authorizations, timesheets.
- Confirm row counts for the largest tables (`clients`, `shifts`, `timesheets`,
  `audit_logs`) look right versus the source.
- PHI fields decrypt (open a client detail) — the restore target must have the
  same `ENCRYPTION_KEY` as the source, or encrypted PHI is unreadable.
