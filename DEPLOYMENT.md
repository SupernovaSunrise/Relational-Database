# Local Deployment Guide

This guide covers running the DME Checkout application on a single business computer.

## Prerequisites

- Python 3.12+ installed
- This repository cloned/downloaded

## Option 1: Direct Python (Simplest)

### Setup
```bash
pip install -r requirements.txt
```

### Run
```bash
python web_app.py
```

The app starts at `http://localhost:5000`. On first run, you'll be redirected to create an admin account.

### Useful Commands
```bash
# Create a fresh blank database (deletes existing data)
python web_app.py --blank

# Run on a different port
python web_app.py --port 8080

# Enable debug mode (development only)
set FLASK_DEBUG=true
python web_app.py
```

### Auto-start on Windows
1. Right-click desktop > New > Shortcut
2. Enter: `cmd /k cd /d C:\path\to\repo && python web_app.py`
3. Name it "DME Checkout" and place in Startup folder

---

## Option 2: Docker (Isolated & Repeatable)

### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop)

### Run
```bash
docker-compose up -d --build
```

The app starts at `http://localhost:5000`. Automated daily backups run at 2 AM inside the container.

### Stop (preserves data)
```bash
docker-compose down
```

### Stop (DELETES all data)
```bash
docker-compose down -v
```

**Warning:** The `-v` flag removes the database volume. Only use this if you want to wipe everything.

---

## Option 3: Standalone .exe

### Build
1. Install Python 3.12+ and pip
2. Run: `build.bat`
3. Find the executable at `dist\DME-Checkout.exe`

### Run
```bash
dist\DME-Checkout.exe
```

The .exe creates `database.db` next to itself on first run and opens the browser to the registration page.

### Create Fresh Database
```bash
dist\DME-Checkout.exe --blank
```

---

## First-Time Setup

1. Open the app in your browser
2. You'll see the "Create Admin Account" page
3. Choose a username and strong password
4. Log in with your new credentials
5. Start adding equipment and customers

---

## TLS/HTTPS Setup

For any deployment accessible over a network, TLS is recommended.

### Generate Self-Signed Certificate
```bash
# Windows (requires OpenSSL)
generate_cert.bat

# Or manually
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### Enable TLS
```bash
set SSL_CERTFILE=cert.pem
set SSL_KEYFILE=key.pem
python web_app.py
```

The app will be available at `https://localhost:5000`.

### Docker TLS
Add to `docker-compose.yml`:
```yaml
environment:
  - SSL_CERTFILE=/app/cert.pem
  - SSL_KEYFILE=/app/key.pem
volumes:
  - ./cert.pem:/app/cert.pem
  - ./key.pem:/app/key.pem
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_SECRET_KEY` | random | Secret key for session signing |
| `FLASK_DEBUG` | `false` | Enable Flask debug mode |
| `SSL_CERTFILE` | none | TLS certificate file path |
| `SSL_KEYFILE` | none | TLS private key file path |
| `EQUIPMENT_SEARCH_API_KEY` | none | API key for equipment search |
| `ADMIN_USERNAME` | none | Auto-create admin on startup |
| `ADMIN_PASSWORD` | none | Auto-create admin on startup |

---

## Accessing the App

### Local Network
- Same computer: `http://localhost:5000`
- Other computers: `http://<your-ip>:5000`
  - Find your IP: `ipconfig` (Windows) or `ip addr` (Linux)

### Default Port
The app runs on port 5000. Change with `--port` flag or modify `docker-compose.yml`.

---

## Troubleshooting

### Port Already In Use
```bash
# Windows
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000
```

### Database Lock
SQLite allows one writer at a time. If you see lock errors:
- Only one checkout operation at a time per browser
- Refresh after returning/adding customers

### Docker Won't Start
```bash
docker-compose logs -dme-app
```

### Windows Firewall
Allow Flask through Windows Firewall when prompted, or manually allow port 5000.

---

## Backup

### Docker (Automated)
Backups run automatically at 2 AM daily inside the container, stored in the `dme-backups` volume. On startup, a backup is also created. Backups older than 7 days are pruned automatically.

To list backups:
```bash
docker exec dme-checkout-app ls -lh /app/backups/
```

To copy a backup out of the container:
```bash
docker cp dme-checkout-app:/app/backups/database_YYYYMMDD_HHMMSS.db ./restore.db
```

### Local Python
```bash
copy database.db database.db.backup
```

---

## Production Considerations

- **SQLite**: Works well for one machine. Not suitable for multi-machine concurrent access.
- **HTTPS**: Use a reverse proxy (nginx) with valid SSL certificates for internet-facing deployments.
- **Backups**: Docker environments have automated daily backups (2 AM). Local Python setups should back up `database.db` manually.
- **Updates**: Pull new code and run `docker-compose up -d --build`; existing database data is preserved in the Docker volume.
- **Data Safety**: Never run `docker-compose down -v` unless you want to delete all data.
