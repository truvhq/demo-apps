@echo off
REM Truv Intake Tool - double-click launcher for Windows.
REM Finds Python, checks the version, and starts setup.

cd /d "%~dp0"

echo.
echo ==============================================================
echo   Truv Intake Tool - getting started
echo ==============================================================
echo.

REM Try the py launcher first, then plain python.
set "PY="
py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=py -3"

if not defined PY (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
    if not errorlevel 1 set "PY=python"
)

if not defined PY (
    echo   PROBLEM: Python 3.8 or newer was not found on this computer.
    echo.
    echo   WHAT TO DO:
    echo     1. Go to https://www.python.org/downloads/
    echo     2. Download and install the latest Python 3.
    echo        IMPORTANT: tick "Add Python to PATH" during install.
    echo     3. Double-click this file again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('%PY% --version 2^>^&1') do echo   Using: %%v
echo.

%PY% truv_intake.py setup
set STATUS=%errorlevel%

echo.
if "%STATUS%"=="0" (
    echo   Setup finished. Next, run this to check everything:
    echo.
    echo       %PY% truv_intake.py doctor
    echo.
) else (
    echo   Setup did not finish. Scroll up for the reason.
    echo.
)

pause
