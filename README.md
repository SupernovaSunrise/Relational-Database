# Mendure DME

A secure desktop database system for tracking durable medical equipment and customer checkouts. Built for the NW Montana Veterans Stand Down and Food Pantry DME Loan Program.

## Features

- **Customer management**: name, phone number, zip code with deduplication
- **Equipment tracking**: ID in format `AA-0000`, item name, verification dates
- **120-day checkout periods** with digital signature agreements
- **Reports & analytics**: checkout logs, guest counts, monthly stats
- **Import/Export**: Excel (.xlsx) and CSV support
- **Inline editing**: edit cells directly in tables
- **Desktop app**: Electron, offline, no server, no browser

## Security

- Electron sandbox + context isolation, strict CSP
- IPC allowlist bridge (`window.dme.*`) with sender/payload/auth/admin gates
- Password hashing compatible with legacy werkzeug hashes (pbkdf2 + scrypt)
- Parameterized SQL queries (no SQL injection)
- Brute-force login rate limiting
- Server-side error logging (no exception details exposed)

## Quick Start

### Development

Requires Node.js 22+ and npm.

```bash
npm ci
npm start
```

On first run, you'll be prompted to create an admin account.

### Test

```bash
npm test
```

### Build Windows installer + portable exe

```bash
npm run dist
# Output: dist/Mendure-DME-Setup-<version>.exe and dist/Mendure-DME-Portable-<version>.exe
```

### Update

Installer and portable builds are published to GitHub Releases (see [.github/workflows/build.yml](.github/workflows/build.yml)). CI also runs the test suite on every push.

## CLI Options

The Electron app has no CLI flags. Data lives at `%APPDATA%\Mendure DME\database.db` (per-user).

## Data Storage

- SQLite, WAL mode, stored per-user in the app data folder
- Created automatically on first run
- First run migrates a legacy Flask `database.db` (next to the old exe) into the new location — never overwrites existing data
- Legacy database files are gitignored and must never be committed

## Notes

- Equipment IDs must follow the format `AA-0000`
- Phone numbers are validated for at least 10 digits
- Zip codes must be 5 digits
- SQLite is suitable for single-machine use

## License

MIT License - see [LICENSE](LICENSE)
