#!/bin/bash
# Backup script for database.db
# Runs daily to create timestamped backups

BACKUP_DIR="/app/backups"
DB_FILE="/app/database.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/database_${TIMESTAMP}.db"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -name "database_*.db" -mtime +7 -delete

# Copy database to backup location
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: $BACKUP_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Database file not found: $DB_FILE"
    exit 1
fi
