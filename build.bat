@echo off
echo ===================================
echo  DME Checkout - Build Script
echo ===================================
echo.

REM --- Check for Python ---
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python is not installed. Attempting automatic install...
    echo.

    REM Try winget first
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo Installing Python 3.12 via winget...
        winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        if %errorlevel% neq 0 (
            echo WARNING: winget install failed. Trying direct download...
            goto :download_python
        )
    ) else (
        goto :download_python
    )

    REM Refresh PATH after install
    set "PATH=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312;C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\Scripts;%PATH%"
    goto :check_python

:download_python
    echo Downloading Python 3.12 installer...
    set "INSTALLER=%TEMP%\python-3.12.10-amd64.exe"
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile '%INSTALLER%' -UseBasicParsing"
    if not exist "%INSTALLER%" (
        echo ERROR: Download failed. Please install Python 3.12+ manually from https://www.python.org
        echo        Then re-run this script.
        pause
        exit /b 1
    )
    echo Running installer (this may take a minute)...
    "%INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1
    if %errorlevel% neq 0 (
        echo ERROR: Python installation failed. Please install manually from https://www.python.org
        pause
        exit /b 1
    )
    del "%INSTALLER%" >nul 2>nul

    REM Refresh PATH
    set "PATH=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312;C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\Scripts;%PATH%"
)

:check_python
python --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python was installed but is not in PATH.
    echo        Close and reopen this terminal, then re-run build.bat.
    pause
    exit /b 1
)

echo Found: 
python --version
echo.

REM --- Install build dependencies ---
echo Installing build dependencies...
pip install -r requirements-dev.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building DME-Checkout.exe...
pyinstaller build.spec --clean --noconfirm
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
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
