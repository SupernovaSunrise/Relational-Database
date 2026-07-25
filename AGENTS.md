# AGENTS.md

## Project Overview

DME (Durable Medical Equipment) Checkout Database — a Flask web application for the **NW Montana Veterans Stand Down and Food Pantry** (501(c)(3) nonprofit). Manages equipment checkout/return, customer records, and loan agreements for a veteran services program.

**Repository**: `https://github.com/SupernovaSunrise/Relational-Database.git`
**Default branch**: `Remote`

## Tech Stack

- **Backend**: Python 3.12+, Flask, Flask-Login, Flask-WTF (CSRF), SQLite
- **Frontend**: Jinja2 templates, vanilla JS (no framework)
- **Packaging**: PyInstaller (.exe), Inno Setup (installer), GitHub Actions CI
- **Containerization**: Docker (optional, alternative to .exe)

## Key Files

| File | Purpose |
|------|---------|
| `web_app.py` | Main Flask application — all routes, auth, import/export |
| `db.py` | Database schema, connection, helpers (phone formatting, holidays, due dates) |
| `templates/base.html` | Base template with nav bar, inline editing JS, security headers |
| `templates/master.html` | Home page — checkout/return, equipment table with tabs |
| `templates/settings.html` | Account management (password, logout, shutdown) + data import/export |
| `templates/customers.html` | Customer list with inline editing |
| `templates/equipment.html` | Equipment list with inline editing |
| `templates/reports.html` | Analytics and reporting |
| `templates/customer_agreement.html` | Loan agreement with signature pad |
| `build.spec` | PyInstaller spec (must `git add -f` due to `*.spec` in .gitignore) |
| `inno_setup.iss` | Inno Setup installer script |
| `.github/workflows/build.yml` | CI: builds .exe and installer, generates checksums |
| `requirements.txt` | Runtime dependencies |
| `requirements-dev.txt` | Dev dependencies (includes pyinstaller) |

## Build & Run

### Local development
```bash
pip install -r requirements.txt
python web_app.py
```
App runs at `http://localhost:5000`. First visit prompts admin account creation.

### Build .exe (local)
```bash
build.bat
# Output: dist/DME-Checkout/DME-Checkout.exe
```

### Build .exe (CI)
Pushes to `Remote`, `main`, or `master` branches trigger GitHub Actions. The workflow:
1. Builds PyInstaller bootloader from source (for maximum Windows compatibility)
2. Builds onedir .exe via `build.spec`
3. Builds Inno Setup installer
4. Generates SHA256 checksums for both
5. Uploads 3 artifacts (folder, installer, checksums)

## Code Conventions

- **No comments in code** unless explicitly requested
- **No new dependencies** without confirming they're needed
- **Security first**: All routes use `@login_required`. Admin-only actions check `current_user.is_admin`. Forms use CSRF tokens.
- **SQLite**: Single-database, single-writer. No connection pooling needed. Always `conn.close()` after operations.
- **Templates**: Extend `base.html`. Use `url_for()` for links. Include CSRF token in all POST forms: `<input type="hidden" name="csrf_token" value="{{ csrf_token() }}">`
- **Error handling**: Use `flash()` for user-facing messages. Return `redirect(url_for(...))` after POST.
- **Phone numbers**: Stored as `(XXX) XXX-XXXX` format. Use `normalize_phone()` and `format_phone()` from db.py.
- **Equipment IDs**: Format `AA-0000` (2 letters, dash, 4 digits). Validated by `EQUIPMENT_ID_PATTERN` from db.py.

## Security Model

- **Auth**: Flask-Login with `@login_required` on all routes except `/login`, `/register`, `/static`
- **Admin gate**: `current_user.is_admin` check on delete, import/export, shutdown
- **CSRF**: Flask-WTF CSRFProtect on all forms
- **Brute-force**: 5 failed logins per IP per 5 minutes
- **Session**: `SameSite=Lax` cookies
- **Headers**: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Logout**: POST-only (not GET) to prevent CSRF logout

## Important Notes

- `db.py` has `calculate_due_date()` which accounts for weekends and 11 federal holidays
- The .exe binds to `127.0.0.1` (localhost only); dev/Docker binds to `0.0.0.0`
- `desktop_app.py` and `main.py` are **deprecated** — dead code with outdated schema. Do not modify.
- `templates/change_password.html` was deleted — password change is now in `settings.html`
- `build.spec` is force-added to git despite `*.spec` in .gitignore — always use `git add -f build.spec`
- The `database.db/` directory in the repo is an empty artifact — the actual database is `database.db` (a file)

## Testing

Tests are in `tests/test_agreement_date.py`. Run with:
```bash
pytest tests/
```
Note: Python is not installed locally on this machine. Tests run in CI via GitHub Actions.
