FROM python:3.12-slim

WORKDIR /app

# Install cron (for automated backups)
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY web_app.py .
COPY templates/ ./templates/
COPY backup_db.sh .

# Make backup script executable
RUN chmod +x /app/backup_db.sh

# Create crontab entry for daily backups at 2 AM
RUN echo "0 2 * * * /app/backup_db.sh >> /var/log/backup.log 2>&1" | crontab -

# Create a startup script that runs both cron and Flask
RUN echo '#!/bin/bash\n\
service cron start\n\
python web_app.py' > /app/start.sh && chmod +x /app/start.sh

# Expose Flask port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/')" || exit 1

# Start both cron and Flask app
CMD ["/app/start.sh"]
