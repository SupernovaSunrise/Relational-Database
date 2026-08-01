# AGENTS.md

## Project Overview

DME (Durable Medical Equipment) Checkout Database — an **Electron desktop application** for the **NW Montana Veterans Stand Down and Food Pantry** (501(c)(3) nonprofit). Manages equipment checkout/return, customer records, and loan agreements for a veteran services program.

**Repository**: `https://github.com/SupernovaSunrise/Relational-Database.git`
**Default branch**: `Remote`
**Product name**: Mendure DME

The app is a full rewrite of the original Flask web application. Legacy Flask files (`web_app.py`, `db.py`, `templates/`, `desktop_app.py`, `main.py`) remain in the repo as reference/oracle but are **dead code** — do not modify them. The `db.py` schema and business logic (due dates, holidays, phones) are the behavior authority that the JS port must match.

## Tech Stack

- **Runtime**: Electron 43 (Chromium + Node 22.x), CommonJS
- **Renderer**: Vanilla HTML/CSS/JS (no framework, no bundler), strict CSP
- **IPC**: preload `contextBridge` allowlist API (`window.dme.*`), no HTTP server, no ports
- **Database**: SQLite via `node:sqlite` (`DatabaseSync`) — built into Node/Electron, no native compile
- **Security**: contextIsolation, sandbox, webSecurity, sender/payload/auth/admin gates on every channel
- **Excel import/export**: exceljs
- **Packaging**: electron-builder (NSIS installer + portable exe), GitHub Actions CI
- **Updates**: electron-updater feed configured (`latest.yml`); in-app wiring pending code signing

## Key Files

| File | Purpose |
|------|---------|
| `src/main/main.js` | Electron entry — window creation, security flags, single-instance lock |
| `src/main/ipc.js` | IPC wiring — sender/payload/auth/admin gates, all channel registration |
| `src/main/db.js` | SQLite data layer — schema, migrations, first-run legacy DB copy, query helpers |
| `src/main/auth.js` | Password hashing (werkzeug pbkdf2 + scrypt compatible), session, rate limiter, auth handlers |
| `src/main/features/*.js` | Feature handlers: customers, equipment, loans, agreements, reports, import-export |
| `src/shared/ipc-contract.js` | Channel names, payload specs (types + length caps), auth/admin gate sets |
| `src/shared/business-logic.js` | Due dates, holidays, phones, date/escape helpers (verified parity with db.py) |
| `src/preload/index.js` | contextBridge API — the only renderer→main surface, one method per channel |
| `src/renderer/index.html` | SPA shell — strict CSP meta, nav, view container |
| `src/renderer/js/app.js` | App namespace: session state, hash router, flash banners, inline-edit engine, HTML escaping |
| `src/renderer/js/views/*.js` | Views: auth, master (checkout/return), customers, equipment, reports, settings, agreement |
| `tests/*.test.js` | Jest suites: business-logic parity, auth, ipc-contract, db migration, features |
| `scripts/generate-legacy-reference.py` | Generates the parity oracle fixture from real Python `db.py` |
| `electron-builder.yml` | Packaging config (NSIS + portable, GitHub publish feed) |
| `.github/workflows/build.yml` | CI: jest → electron-builder → checksums → artifacts/release |
| `database.db` | Directory artifact only — the real DB is `userData/database.db` at runtime |
| Legacy (dead) | `web_app.py`, `db.py`, `templates/`, `desktop_app.py`, `main.py` |

## Build & Run

### Local development
```bash
npm ci
npm start
```

### Test
```bash
npm test                 # jest, all suites (already runs --runInBand)
```

### Build Windows artifacts
```bash
npm run dist            # NSIS installer + portable exe → dist/
npm run dist:portable   # portable only
# Output: dist/Mendure-DME-Setup-<version>.exe and dist/Mendure-DME-Portable-<version>.exe
```

### Build (CI)
Pushes to `Remote`, `main`, or `master` trigger GitHub Actions:
1. `npm ci` + jest (all 159 tests)
2. `npm run dist` (unsigned unless signing secrets are present)
3. Generates `SHA256 checksums.txt`
4. Uploads artifacts (installer, portable, checksums)
5. The update feed (`latest.yml` + blockmap) is uploaded/attached ONLY when code-signing secrets are present — unsigned builds must not publish a feed
6. On GitHub `release` events, attaches the executables + checksums to the release; feed files attach only when signed

## Code Conventions

- **No comments in code** unless explicitly requested
- **No new dependencies** without confirming they're needed
- **IPC contract first**: channels are declared in `src/shared/ipc-contract.js` with payload type+length specs. Payload validation is fail-closed (unknown keys, wrong types, over-length all rejected). New channels must get a PAYLOADS entry.
- **Security gates are central**: `src/main/ipc.js` enforces sender trust, payload validation, auth (`REQUIRED_AUTH` = public; everything else needs a session), and admin (`REQUIRED_ADMIN`: deletes, import/export, shutdown). Feature handlers never re-validate types but DO re-check business rules.
- **Renderer trust boundary**: renderer is sandboxed + context-isolated; it can only reach main via `window.dme.*`. All user input must be HTML-escaped before DOM injection (`App.escapeHtml`).
- **SQLite**: single-writer, WAL mode. Use `db.withDb(fn)` — opens a fresh `DatabaseSync`, closes it via try/finally. Always parameterized queries.
- **Phone numbers**: stored as `(XXX) XXX-XXXX`. Use `normalizePhone()` / `formatPhone()` from business-logic.js.
- **Equipment IDs**: format `AA-0000` (2 letters, dash, 4 digits). Validated by `EQUIPMENT_ID_PATTERN`.
- **Errors**: handlers return `{ ok: false, error: '...' }`, never throw across the bridge. The IPC wrapper converts unexpected throws to `internal error` + logs.
- **Responses**: success shapes are `{ ok: true, ... }`; lists `{ ok: true, items: [...] }`; single entities `{ ok: true, item: {...} }`; DB columns are snake_case.

## Security Model

- **Window**: contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools off when packaged, `setWindowOpenHandler` deny, `will-navigate` guard, single-instance lock
- **IPC**: every channel → trusted-sender check → payload validation (strict key allowlist, type + length caps, `MAX_PAYLOAD_BYTES` 1 MB) → session gate → admin gate
- **Auth**: werkzeug-compatible password hashes — verifies `pbkdf2:sha256:<iter>` AND `scrypt:n:r:p` (legacy Flask DBs may contain either); new hashes `pbkdf2:sha256:600000`. Brute-force: 5 failed logins / 300s keyed by webContents id. First registered user gets admin.
- **Renderer**: strict CSP (no inline scripts/styles, no eval, `connect-src 'none'`), XSS contained by escaping, no Node access
- **Data**: SQLite at `app.getPath('userData')/database.db`, unencrypted (same exposure class as legacy), WAL sidecars hold newest rows
- **Migration**: first run copies legacy `database.db` (exe-adjacent, else project root) into userData along with any `-wal`/`-shm` sidecars — never overwrites an existing target

## Important Notes

- `calculateDueDate()` accounts for weekends + 11 federal holidays; parity with Python `db.py` is enforced by tests using the generated fixture.
- The legacy pytest `tests/test_agreement_date.py` has a KNOWN BUG: it expects `2024-08-20` but real `db.py` returns `2024-08-21`. The Jest port asserts the correct `2024-08-21` (parity with real Python).
- `node:sqlite` requires Electron ≥ 35 (we pin ≥ 43). `DatabaseSync` is synchronous — keep operations short.
- Jest tests must pass an explicit temp `dbPath` to `initDb()` — never let `db.js` resolve the default path (it falls back to the repo-root `database.db` dir artifact).
- `importExport:import*` handlers ignore renderer-supplied paths; the main process always opens native `dialog` pickers.
- Legacy Flask files stay as reference only. The build ships only `src/**/*` + `package.json` + `icon.ico`.
- CI signing is wired for SSL.com eSigner via Azure Trusted Signing secrets — but ONLY runs when the secrets are present. Unsigned builds get SmartScreen warnings. Do NOT wire `electron-updater` in-app until builds are code-signed.

## Testing

Jest suites in `tests/` (`*.test.js`), 159 tests / 5 suites:
- `business-logic.test.js` — 990-case parity fixture vs real Python db.py (2020–2040 holidays/due dates), phones, dates, escape
- `auth.test.js` — werkzeug 2.3.7 pbkdf2 + 3.1.3 scrypt hash vectors, register/login/rate-limit/session/change-password
- `ipc-contract.test.js` — payload validation fail-closed, sender gate, REQUIRED_AUTH/ADMIN invariants, full handler pipeline
- `db.test.js` — schema/index/migration-column parity with db.py, legacy DB copy, migration idempotence
- `features.test.js` — end-to-end handler flows (add/search/checkout/agreement/return/cancel/reports) on temp DBs

Run: `npm test`. Python is NOT required for tests (fixture is checked in); `scripts/generate-legacy-reference.py` regenerates the oracle if db.py ever changes.
