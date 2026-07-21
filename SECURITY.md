# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainers directly with details of the vulnerability
3. Include steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Security Measures

### Authentication & Authorization
- Flask-Login session-based authentication
- Passwords hashed with werkzeug.security (pbkdf2:sha256)
- Admin account required for all data access
- First-run registration flow for initial setup

### Data Protection
- All SQL queries use parameterized statements (no SQL injection)
- CSRF tokens on all forms (Flask-WTF)
- Customer PII encrypted at rest when using TLS
- Database file excluded from version control (.gitignore)

### Web Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` restricting resource loading

### Input Validation
- Phone numbers: minimum 10 digits
- Zip codes: exactly 5 digits
- Equipment IDs: regex pattern `^[A-Z]{2}-\d{4}$`
- Upload file size limit: 16 MB
- LIKE wildcard characters escaped in search queries

### Transport Security
- TLS/HTTPS support via `SSL_CERTFILE` and `SSL_KEYFILE` environment variables
- Self-signed certificate generation script included (`generate_cert.bat`)
- For production, use a reverse proxy (nginx) with proper SSL certificates

### Error Handling
- Server-side exception logging (no details exposed to users)
- Generic error messages shown to end users
- Flask debug mode disabled by default

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Best Practices for Deployment

1. Set `FLASK_SECRET_KEY` to a strong random value
2. Enable TLS for any network-accessible deployment
3. Use a reverse proxy (nginx/Apache) for production
4. Regularly backup `database.db`
5. Keep Python and dependencies updated
6. Do not run as root/administrator
