# Local Deployment Guide

This guide covers installing and running Mendure DME on a single business computer.

## Prerequisites

- Windows 10/11 64-bit. No Python, no Node, no Docker required on the target machine.

## Installing

### Option 1: Installer (Recommended)

Download `Mendure-DME-Setup-<version>.exe` from the [GitHub Releases](https://github.com/SupernovaSunrise/Relational-Database/releases) page.

Run it. The installer will:
- Install to `C:\Users\<you>\AppData\Local\Programs\Mendure DME\` (no admin required)
- Create a Start Menu shortcut
- Optionally create a Desktop shortcut
- Launch the application after installation

### Option 2: Portable (no install)

Download `Mendure-DME-Portable-<version>.exe`. Run it anywhere — no install needed. Data is still stored per-user in the app data folder.

### Windows SmartScreen Warning

When you first run the installer or the `.exe`, Windows may show:

> Windows protected your PC
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.

This is normal for applications that are not yet code-signed. It does **not** mean the application is unsafe.

**To proceed:**
1. Click **"More info"**
2. Click **"Run anyway"**

If you downloaded from a trusted source (the NW Montana Veterans Stand Down and Food Pantry GitHub releases), it is safe to proceed.

## First-Time Setup

1. Open the app
2. You'll see the "Create Admin Account" page
3. Choose a username and strong password (min 8 characters)
4. Log in with your new credentials
5. Start adding equipment and customers

## Migrating from the Old Flask App

The first launch looks for a legacy `database.db` next to the old exe (or in the project folder) and copies it into the new app data location. It never overwrites existing data.

- **Important**: If the old app is still running, close it first. The migration copies the SQLite `-wal`/`-shm` sidecars along with `database.db` so no uncheckpointed checkouts are lost, but copying a live database is never safe.
- After migration, verify a few recent checkouts appear in the Reports → Checkout Log tab.

## Data Storage

- Location: `%APPDATA%\Mendure DME\database.db`
- Back up by copying `database.db` (and ideally the `-wal`/`-shm` sidecars, after closing the app) to a safe location:

```powershell
copy "$env:APPDATA\Mendure DME\database.db" "$env:APPDATA\Mendure DME\database.db.backup"
```

## Shut Down

Click **Settings**, then **Shutdown**. The app quits cleanly. (Or just close the window.)

## File Verification

Each build produces a `SHA256 checksums.txt`. To verify a download:

```powershell
(Get-FileHash -Path "Mendure-DME-Setup-1.0.0.exe" -Algorithm SHA256).Hash
```

Compare to the checksums file on the Release.

## Security

- **Authentication**: All features require login except the initial admin registration.
- **Admin-only actions**: Deleting customers/equipment/report rows, importing/exporting data, and shutting down require admin privileges.
- **Brute-force protection**: After 5 failed login attempts within 5 minutes, further attempts are temporarily blocked.
- **Desktop isolation**: The app runs sandboxed with context isolation; no web server is exposed, no ports are opened, and nothing can be reached from the network.

## Updates

New releases are published to GitHub Releases. In-app auto-update is not yet enabled — it requires a code-signed build. Until then, download the new installer or portable exe from Releases. Existing data in `%APPDATA%\Mendure DME\` is preserved across versions.

## Troubleshooting

### App won't start
- Check that another instance isn't already running (single-instance lock).
- Verify the data folder is writable: `%APPDATA%\Mendure DME\`.
- If a corrupt database is suspected, move `database.db` aside and restart — a fresh one is created.

### Multiple users on one computer
Each Windows user gets their own data folder. SQLite is single-machine; the app is designed for one primary user.

### SmartScreen blocks the app
See [Windows SmartScreen Warning](#windows-smartscreen-warning) above. Code signing is planned, which removes this warning.

## Development

```bash
npm ci
npm start          # dev mode
npm test           # jest suite (159 tests)
npm run dist       # installer + portable exe → dist/
```

## Production Considerations

- **SQLite**: suitable for one machine. Not suitable for multi-machine concurrent access.
- **Backups**: copy `database.db` (app closed) to a safe location on a schedule.
- **Code Signing**: the exe is currently unsigned. An OV Microsoft Authenticode certificate (e.g., SSL.com eSigner) eliminates SmartScreen warnings and enables in-app auto-updates.
