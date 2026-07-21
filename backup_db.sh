#!/bin/bash
# Backup script for database.db
# Runs daily via cron and on container startup

BACKUP_DIR="/app/backups"
DB_FILE="${DB_PATH:-/app/data/database.db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/database_${TIMESTAMP}.db"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p "$BACKUP_DIR"

find "$BACKUP_DIR" -name "database_*.db" -mtime +7 -delete 2>/dev/null

if [ ! -f "$DB_FILE" ]; then
    echo "$LOG_PREFIX WARN: Database file not found at $DB_FILE — skipping backup"
    exit 0
fi

if ! cp "$DB_FILE" "$BACKUP_FILE"; then
    echo "$LOG_PREFIX ERROR: Failed to copy database to $BACKUP_FILE"
    exit 1
fi

if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "$LOG_PREFIX ERROR: Backup integrity check failed for $BACKUP_FILE"
    rm -f "$BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$LOG_PREFIX Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
