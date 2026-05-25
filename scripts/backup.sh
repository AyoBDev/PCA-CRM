#!/bin/bash
# Weekly backup of NV Best PCA database
# Runs via cron every Thursday at 2:00 AM

BACKUP_DIR="$HOME/Documents/antigravity/nvbestpca/backups"
API_URL="https://pca-crm-production.up.railway.app/api/backup/export"
API_KEY="0bcdd739b712a102314f288c18b2b91b63aae7a57569bc0cdcaa7a6aa6cfca1f"

mkdir -p "$BACKUP_DIR"

FILENAME="nvbestpca-backup-$(date +%Y-%m-%d).json"

curl -sf -H "x-backup-key: $API_KEY" "$API_URL" -o "$BACKUP_DIR/$FILENAME"

if [ $? -eq 0 ] && [ -s "$BACKUP_DIR/$FILENAME" ]; then
    echo "$(date): Backup saved to $BACKUP_DIR/$FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"
    # Keep only last 8 weeks of backups
    ls -t "$BACKUP_DIR"/nvbestpca-backup-*.json 2>/dev/null | tail -n +9 | xargs rm -f 2>/dev/null
else
    echo "$(date): Backup FAILED" >&2
    rm -f "$BACKUP_DIR/$FILENAME"
    exit 1
fi
