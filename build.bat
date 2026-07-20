@echo off
echo ===================================
echo  DME Checkout - Build Script
echo ===================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python not found in PATH
    exit /b 1
)

echo Installing build dependencies...
pip install -r requirements-dev.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    exit /b 1
)

echo.
echo Building DME-Checkout.exe...
pyinstaller build.spec --clean --noconfirm
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    exit /b 1
)

echo.
echo ===================================
echo  Build complete!
echo  Output: dist\DME-Checkout.exe
echo ===================================
echo.
echo To create a blank database, run:
echo   DME-Checkout.exe --blank
echo.
pause
