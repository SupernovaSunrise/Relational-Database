@echo off
echo ===================================
echo  Generate Self-Signed TLS Certificate
echo ===================================
echo.
echo This creates a self-signed certificate for local/intranet use only.
echo Browsers will show a warning - this is normal for self-signed certs.
echo.

where openssl >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: OpenSSL not found. Install from https://slproweb.com/products/Win32OpenSSL.html
    echo        or use: winget install OpenSSL
    exit /b 1
)

set /p DOMAIN="Domain or IP (e.g., localhost or 192.168.1.100): "
if "%DOMAIN%"=="" set DOMAIN=localhost

openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=%DOMAIN%"
if %errorlevel% neq 0 (
    echo ERROR: Certificate generation failed
    exit /b 1
)

echo.
echo Certificate generated:
echo   cert.pem - Certificate file
echo   key.pem  - Private key file
echo.
echo To use with DME Checkout, set these env vars:
echo   set SSL_CERTFILE=cert.pem
echo   set SSL_KEYFILE=key.pem
echo   python web_app.py
echo.
echo Or with Docker, add to docker-compose.yml:
echo   environment:
echo     - SSL_CERTFILE=/app/cert.pem
echo     - SSL_KEYFILE=/app/key.pem
echo   volumes:
echo     - ./cert.pem:/app/cert.pem
echo     - ./key.pem:/app/key.pem
echo.
pause
