# Monday.com Certification Import

One-time script to import employee certifications from the Monday board into the app.

## Setup
1. Generate a read-only Monday API token: Monday → Admin → Developers → My Access Tokens.
2. Export it: `export MONDAY_API_TOKEN=<token>`
3. (Optional) `export MONDAY_BOARD_ID=13357748` (default already set).
4. Ensure DB + storage env vars are set exactly as the server uses them
   (`DATABASE_URL`, and `RAILWAY_OBJECT_STORAGE_*` / `RAILWAY_BUCKET_NAME` for prod;
   local runs write to `server/uploads/admin-files/certs/...`).

## Run
- Probe the board shape:   `node scripts/import-monday-certs.js --probe`
- Dry-run (default):       `node scripts/import-monday-certs.js`
- Dry-run a few:           `node scripts/import-monday-certs.js --limit 5`
- Execute (writes):        `node scripts/import-monday-certs.js --execute`

## Behavior
- Matches employees by name, then email. Unmatched are reported and skipped.
- Per cert type: newest file (by Monday upload date) becomes the Active cert with the
  Monday "Act Due" expiration date; older files are archived as History attachments.
- Skips any employee+certType already present in the app (safe to re-run).
- NPPES/NPI → 'other'. Mixed training column split into Cultural Competency / Infection
  Control by filename; unclassifiable → 'other'. Non-PDF/image files stored as-is.
- Every created active cert is written to the audit log (source: monday_import).
