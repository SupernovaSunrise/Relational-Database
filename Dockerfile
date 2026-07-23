FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends cron && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY web_app.py .
COPY db.py .
COPY templates/ ./templates/
COPY backup_db.sh .
COPY entrypoint.sh .

RUN chmod +x backup_db.sh entrypoint.sh && \
    mkdir -p /app/data /app/backups && \
    echo "0 2 * * * /app/backup_db.sh >> /var/log/backup.log 2>&1" | crontab -

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/')" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["python", "web_app.py"]
