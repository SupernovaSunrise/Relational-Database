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

## Option 3: Standalone .exe Installer (Recommended for single-computer use)

### Download

Download `DME-Checkout-Setup.exe` from the [GitHub Releases](https://github.com/SupernovaSunrise/Relational-Database/releases) page or from the Actions artifacts of a successful build.

### Windows SmartScreen Warning

When you first run the installer or the `.exe`, Windows may display a **SmartScreen warning**:

> Windows protected your PC
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

This is normal for applications that are not yet code-signed. It does **not** mean the application is unsafe. The warning appears because the application has not yet accumulated enough download history for Microsoft to establish a reputation.

**To proceed:**

1. Click **"More info"**
2. Click **"Run anyway"**

If you downloaded from a trusted source (GitHub Releases from the NW Montana Veterans Stand Down and Food Pantry organization), it is safe to proceed.

### Install

Run `DME-Checkout-Setup.exe`. The installer will:
- Install to `C:\Users\<you>\AppData\Local\DME Checkout\` (no admin required)
- Create a Start Menu shortcut
- Optionally create a Desktop shortcut
- Launch the application after installation

### Run

After installation, launch from:
- **Start Menu** > DME Checkout
- **Desktop shortcut** (if selected during install)

The app automatically opens your browser to `http://localhost:5000`. No Python or Docker required on the target machine.

### Create Fresh Database

```bash
DME-Checkout.exe --blank
```

### Shut Down

Click **Settings** in the nav bar, then click the **Shutdown** button. This cleanly stops the application. The Shutdown button only appears when running as the standalone .exe.

### Portable Version

You can also download the `DME-Checkout` folder artifact (a zip of `dist/DME-Checkout/`). Extract it anywhere and run `DME-Checkout.exe` directly. No installer needed.

### Custom Icon

The build uses `icon.ico` in the project root. Replace this file with your own `.ico` to customize the executable icon.

### File Verification

Each build produces a `SHA256 checksums.txt` file. To verify your download:

```powershell
# PowerShell
(Get-FileHash -Path "DME-Checkout-Setup.exe" -Algorithm SHA256).Hash
```

Compare the output hash to the one in the checksums file.

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
| `DB_PATH` | `database.db` | Path to SQLite database file |

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

### SmartScreen Blocks the Application
See the [Windows SmartScreen Warning](#windows-smartscreen-warning) section above.

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

### Standalone .exe
The `database.db` file is created in the same directory as the executable. Copy it to a safe location:
```powershell
copy DME-Checkout\database.db DME-Checkout\database.db.backup
```

---

## Security Notes

- **Authentication**: All pages require login except the initial admin registration.
- **Admin-only actions**: Deleting customers/equipment, importing/exporting data, and shutting down the application require admin privileges.
- **Session cookies**: Set to `SameSite=Lax` for CSRF protection.
- **Brute-force protection**: After 5 failed login attempts within 5 minutes, further attempts are temporarily blocked.
- **CSRF protection**: All forms include CSRF tokens via Flask-WTF.

---

## Production Considerations

- **SQLite**: Works well for one machine. Not suitable for multi-machine concurrent access.
- **HTTPS**: Use a reverse proxy (nginx) with valid SSL certificates for internet-facing deployments.
- **Backups**: Docker environments have automated daily backups (2 AM). Local Python setups should back up `database.db` manually.
- **Updates**: Pull new code and run `docker-compose up -d --build`; existing database data is preserved in the Docker volume.
- **Data Safety**: Never run `docker-compose down -v` unless you want to delete all data.
- **Code Signing**: The .exe is currently unsigned. Consider a code signing certificate (~$80-100/yr) or Microsoft Store publishing ($19 one-time) to eliminate SmartScreen warnings for end users.
