#!/bin/bash
# Weekly backup of the NV Best PCA production database.
# Runs via launchd (com.nvbestpca.weekly-backup) every Thursday at 2:00 AM.
#
# Failure detection: the previous bare `curl` overwrote the "latest" backup even
# when the download failed or was truncated, so a broken backup silently
# replaced a good one and nobody noticed until a restore was attempted. This
# script downloads to a TEMP file, validates it is complete parseable JSON with
# a plausible row count, and only then promotes it to the dated + latest files.
# On any failure it leaves the previous good backup untouched, logs loudly, and
# raises a macOS notification.

set -uo pipefail

BACKUP_DIR="$HOME/Documents/antigravity/nvbestpca/backups"
API_URL="https://pca-crm-production.up.railway.app/api/backup/export"
API_KEY="${NVBESTPCA_BACKUP_KEY:-0bcdd739b712a102314f288c18b2b91b63aae7a57569bc0cdcaa7a6aa6cfca1f}"

# A healthy backup should be well above this. Guards against an empty or
# truncated-but-valid-looking response.
MIN_ROWS=1000

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d)"
FINAL="$BACKUP_DIR/nvbestpca-backup-$STAMP.json"
LATEST="$BACKUP_DIR/nvbestpca-backup-latest.json"
TMP="$(mktemp "$BACKUP_DIR/.backup-$STAMP.XXXXXX")"

log()  { echo "$(date '+%Y-%m-%d %H:%M:%S'): $*"; }
fail() {
    log "BACKUP FAILED: $*" >&2
    rm -f "$TMP"
    # Surface it — launchd runs headless, so a log line alone is easy to miss.
    /usr/bin/osascript -e "display notification \"$1\" with title \"NV Best PCA backup FAILED\"" >/dev/null 2>&1 || true
    exit 1
}

# 1. Download to a temp file. -f => curl fails (non-zero) on HTTP >= 400.
#    Generous timeouts: the export streams a large DB and can take a while.
if ! curl -sf --max-time 600 --retry 2 --retry-delay 30 \
        -H "x-backup-key: $API_KEY" "$API_URL" -o "$TMP"; then
    fail "curl download failed (HTTP error, timeout, or connection dropped)."
fi

# 2. Non-empty?
[ -s "$TMP" ] || fail "downloaded file is empty."

# 3. Valid, complete JSON? A dropped connection yields truncated JSON that jq
#    rejects — this is the check the old script lacked.
jq empty "$TMP" >/dev/null 2>&1 || fail "downloaded file is not valid/complete JSON (likely truncated)."

# 4. Plausible row count?
ROWS="$(jq -r '.totalRows // 0' "$TMP" 2>/dev/null)"
if ! [[ "$ROWS" =~ ^[0-9]+$ ]] || [ "$ROWS" -lt "$MIN_ROWS" ]; then
    fail "row count too low ($ROWS < $MIN_ROWS); response may be incomplete."
fi

# 5. Promote atomically: temp -> dated -> latest. Only now do we touch the good
#    files, so a bad run never clobbers the previous backup.
mv "$TMP" "$FINAL"
cp "$FINAL" "$LATEST"
# Backups contain password hashes + PHI — keep them owner-only.
chmod 600 "$FINAL" "$LATEST" 2>/dev/null || true

SIZE="$(du -h "$FINAL" | cut -f1)"
TABLES="$(jq -r '.tables | length' "$FINAL" 2>/dev/null)"
log "Backup OK: $FINAL ($SIZE, $ROWS rows, $TABLES tables)"

# Retention: keep the last 8 weekly dated backups.
ls -t "$BACKUP_DIR"/nvbestpca-backup-20*.json 2>/dev/null | tail -n +9 | xargs rm -f 2>/dev/null || true
