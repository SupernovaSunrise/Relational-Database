#!/bin/bash
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting DME Checkout application..."

# Run an on-startup backup if the database exists
/app/backup_db.sh || true

# Start cron daemon for scheduled backups
cron
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron daemon started for scheduled backups."

exec "$@"
