# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainers directly with details of the vulnerability
3. Include steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Threat Model

Mendure DME is a local, single-machine Electron application. There is no server, no
network listener, and no web-accessible surface. The app is never exposed to the
internet; a compromise requires local access to the machine or a malicious file
tricked into running on it.

## Security Measures

### Renderer Isolation
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- Strict CSP meta tag: no inline scripts or styles, no `eval`, `connect-src 'none'`
- `setWindowOpenHandler` denies all new windows; `will-navigate` blocks navigation away from the app
- devTools disabled when packaged

### IPC Bridge
- The renderer reaches main only through a `contextBridge` allowlist API (`window.dme.*`)
- Every channel is gated in order: trusted sender (single known webContents id) → strict payload
  validation (key allowlist, type + length caps, 1 MB total) → session → admin (for deletes,
  import/export, shutdown)
- Payload validation is fail-closed: unknown keys, wrong types, and over-length values are rejected
- Feature handlers never re-validate types but re-check business rules

### Authentication & Authorization
- Password hashing compatible with legacy werkzeug hashes: verifies `pbkdf2:sha256:<iter>`
  and `scrypt:n:r:p`; new hashes use `pbkdf2:sha256:600000`
- Session held only in main-process memory; never exposed to the renderer
- First registered user becomes admin
- Brute-force protection: 5 failed logins per 300 s keyed by webContents id

### Data Protection
- All SQL queries use parameterized statements (no SQL injection)
- SQLite at `app.getPath('userData')/database.db`, WAL mode, single-writer
- Database is unencrypted at rest (same exposure class as the legacy Flask app) — do not
  rely on the app for protection of data at rest; use OS disk encryption
- Database and WAL sidecars are gitignored and must never be committed
- First-run migration copies a legacy `database.db` (including `-wal`/`-shm` sidecars so no
  rows are lost) into userData and never overwrites an existing target

### Input Validation
- Phone numbers: minimum 10 digits, normalized to `(XXX) XXX-XXXX`
- Zip codes: exactly 5 digits
- Equipment IDs: regex pattern `^[A-Z]{2}-\d{4}$`
- LIKE wildcard characters escaped in search queries
- All user data is HTML-escaped before DOM injection (XSS containment)

### Print / Temp Files
- Print documents are generated in per-run temp directories with `script-src 'none'`
- Temp HTML/PDF files are removed on failure and shortly after successful open

### Error Handling
- Main-process exception logging; generic `internal error` returned across the bridge
- Handlers return `{ ok: false, error: ... }` and never leak stack traces

## Best Practices for Deployment

1. Run the app from an account with least privilege (do not run as Administrator)
2. Enable OS disk encryption (BitLocker) to protect PHI/PII at rest
3. Back up `%APPDATA%\Mendure DME\database.db` (app closed) on a schedule
4. Only install builds published from the official repository / GitHub Releases
5. Prefer code-signed builds to avoid SmartScreen warnings and unsigned-artifact risks
6. Keep the app updated by installing new releases
