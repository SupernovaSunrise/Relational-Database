# Local Deployment Guide

This guide covers running the DME Checkout application on a single business computer.

## Option 1: Direct Python (Simplest)

No Docker required—just run the app directly on your computer.

### Setup
1. Install Python 3.12+ if not already installed
2. Clone/download this repository
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Run
```bash
python web_app.py
```
The app will start at `http://localhost:5000`. Open this in a web browser.

### Auto-start on Windows
Create a shortcut:
1. Right-click on desktop → New → Shortcut
2. Enter location: `cmd /k cd /d C:\path\to\repo && python web_app.py`
3. Name it "DME Checkout" and place in Startup folder

### Auto-start on Linux/Mac
Create a systemd service (Linux) or launchd plist (Mac) to run at startup.

---

## Option 2: Docker (Isolated & Repeatable)

Docker containerizes the app so dependencies don't conflict with your system.

### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop) (Windows/Mac)
- Or install Docker Engine (Linux)

### Run with Docker Compose (Recommended)
```bash
docker-compose up -d
```
The app starts at `http://localhost:5000` and runs in the background.

To stop:
```bash
docker-compose down
```

### Run with Docker CLI
```bash
docker build -t dme-app .
docker run -d -p 5000:5000 -v "$(pwd)/database.db:/app/database.db" --restart unless-stopped dme-app
```

### Data Persistence
- `database.db` is automatically stored on your computer (not in the container)
- Data persists across app restarts and updates

---

## Option 3: Desktop GUI (Alternative)

If you prefer a desktop application over a web interface:

### Setup
```bash
pip install -r requirements.txt
```

### Run
```bash
python desktop_app.py
```

---

## Accessing the App

### Local Network
- Same computer: `http://localhost:5000`
- Other computers on network: `http://<your-computer-ip>:5000`
  - Find your computer's IP:
    - Windows: `ipconfig` (look for IPv4 Address)
    - Linux/Mac: `ifconfig` or `ip addr`

### Default Port
The app runs on port 5000. If this port is already in use, you can change it in:
- `web_app.py`: modify `app.run(port=5000)` to a different port
- Docker: change `"5000:5000"` to `"8080:5000"` in `docker-compose.yml`

---

## Troubleshooting

### Port Already in Use
```bash
# On Windows (PowerShell)
netstat -ano | findstr :5000

# On Linux/Mac
lsof -i :5000
```

### Database Lock (Flask only)
SQLite is single-threaded. If you see database lock errors:
- Only one checkout operation at a time per browser
- Refresh the page after returning/adding customers

### Docker Container Won't Start
```bash
docker-compose logs -f dme-app
```

### Windows Firewall
Allow Flask through Windows Firewall when prompted, or manually allow port 5000.

---

## Recommended Setup for Business Use

1. **Computer Setup**: Install Docker Desktop (or run Python directly if you prefer simplicity)
2. **Startup**: Use Docker Compose or a startup script so the app auto-starts when the computer boots
3. **Access**: Share the computer IP + port (e.g., `http://192.168.1.100:5000`) with other checkout staff if needed
4. **Backup**: Regularly backup `database.db` to prevent data loss

---

## Notes

- **SQLite Database**: Works well for one machine. Not suitable for multi-machine access without additional setup (PostgreSQL, etc.)
- **HTTPS**: The app runs over HTTP locally. For production internet access, use a reverse proxy (nginx) with SSL certificates
- **Performance**: Suitable for typical DME checkout workflows (not high-frequency transactions)
