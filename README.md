# Durable Medical Equipment Checkout Database

A secure database system for tracking durable medical equipment and customer checkouts. Built for the NW Montana Veterans Stand Down and Food Pantry DME Loan Program.

## Features

- **Customer management**: name, phone number, zip code with deduplication
- **Equipment tracking**: ID in format `AA-0000`, item name, verification dates
- **120-day checkout periods** with digital signature agreements
- **Reports & analytics**: checkout logs, guest counts, monthly stats
- **Import/Export**: Excel (.xlsx) and CSV support
- **Inline editing**: edit cells directly in tables

## Security

- Login-required authentication (Flask-Login)
- CSRF protection on all forms (Flask-WTF)
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Password hashing (werkzeug.security)
- Parameterized SQL queries (no SQL injection)
- TLS/HTTPS support via environment variables
- 16 MB upload size limit
- Server-side error logging (no exception details exposed)

## Quick Start

### Web Interface (Recommended)

```bash
pip install -r requirements.txt
python web_app.py
```

Open `http://localhost:5000`. On first run, you'll be prompted to create an admin account.

### Standalone .exe

1. Build: `build.bat` (requires Python + pip)
2. Run: `dist\DME-Checkout.exe`
3. On first launch, browser opens to the registration page

### Docker

```bash
docker-compose up -d
```

## CLI Options

```
python web_app.py [--blank] [--port PORT]
```

| Flag | Description |
|------|-------------|
| `--blank` | Delete existing database and create a fresh empty one |
| `--port PORT` | Change the listening port (default: 5000) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FLASK_SECRET_KEY` | Secret key for session signing (auto-generated if not set) |
| `FLASK_DEBUG` | Set to `true` for debug mode (default: `false`) |
| `SSL_CERTFILE` | Path to TLS certificate file for HTTPS |
| `SSL_KEYFILE` | Path to TLS private key file |
| `EQUIPMENT_SEARCH_API_KEY` | API key for equipment search endpoint |
| `ADMIN_USERNAME` | Auto-create admin on startup (optional) |
| `ADMIN_PASSWORD` | Auto-create admin on startup (optional) |

## Interfaces

| Interface | Command | Features |
|-----------|---------|----------|
| Web (primary) | `python web_app.py` | Full feature set: agreements, signatures, reports, import/export |
| CLI | `python main.py` | Basic checkout/return |
| Desktop | `python desktop_app.py` | Basic checkout/return (Tkinter) |

## Data Storage

- Data is stored in `database.db` in the application folder
- The database is created automatically on first run
- SQLite with WAL mode for better concurrent performance
- **Important**: `database.db` is in `.gitignore` and should never be committed to version control

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions including Docker, auto-start, network access, and TLS configuration.

## Notes

- Equipment IDs must follow the format `AA-0000`
- Phone numbers are validated for at least 10 digits
- Zip codes must be 5 digits
- SQLite is suitable for single-machine use; for multi-machine access consider PostgreSQL

## License

MIT License - see [LICENSE](LICENSE)
