@echo off
setlocal
chcp 65001 >nul
title Smart Study Hub Launcher

cd /d "%~dp0"
if not exist ".tmp" mkdir ".tmp"
set "TMP=%CD%\.tmp"
set "TEMP=%CD%\.tmp"

echo =========================================
echo    Starting Smart Study Hub...
echo =========================================
echo.

set "PYTHON_EXE="

if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=%CD%\venv\Scripts\python.exe"
) else if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python311\python.exe"
) else if exist "C:\msys64\ucrt64\bin\python.exe" (
    set "PYTHON_EXE=C:\msys64\ucrt64\bin\python.exe"
) else (
    where py >nul 2>nul && set "PYTHON_EXE=py"
)

if not defined PYTHON_EXE (
    echo ERROR: Python was not found. Install Python 3.9+ and run this file again.
    pause
    exit /b 1
)

if not exist "venv\Scripts\python.exe" (
    echo [setup] Creating Python virtual environment...
    "%PYTHON_EXE%" -m venv venv
    if errorlevel 1 (
        echo ERROR: Could not create the Python virtual environment.
        pause
        exit /b 1
    )
    set "PYTHON_EXE=%CD%\venv\Scripts\python.exe"
)

echo [setup] Checking pip...
"%PYTHON_EXE%" -m pip --version >nul 2>nul
if errorlevel 1 (
    echo [setup] Installing pip into the virtual environment...
    "%PYTHON_EXE%" -m ensurepip --upgrade --default-pip
    if errorlevel 1 (
        echo ERROR: Could not install pip in the Python virtual environment.
        pause
        exit /b 1
    )
)

echo [setup] Checking backend dependencies...
"%PYTHON_EXE%" -c "import fastapi, uvicorn, chromadb, pypdf, ollama, requests" >nul 2>nul
if errorlevel 1 (
    echo [setup] Installing backend dependencies. This can take a few minutes...
    "%PYTHON_EXE%" -m pip install --upgrade pip
    if errorlevel 1 (
        echo ERROR: Could not upgrade pip.
        pause
        exit /b 1
    )
    "%PYTHON_EXE%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Could not install backend dependencies.
        pause
        exit /b 1
    )
)

set "NPM_CMD="
for /f "delims=" %%N in ('where npm.cmd 2^>nul') do (
    echo %%N | findstr /i "\\node_modules\\" >nul
    if errorlevel 1 (
        set "NPM_CMD=%%N"
        goto npm_found
    )
)
:npm_found
if not defined NPM_CMD (
    for /f "delims=" %%N in ('where npm 2^>nul') do (
        echo %%N | findstr /i "\\node_modules\\" >nul
        if errorlevel 1 (
            set "NPM_CMD=%%N"
            goto npm_found2
        )
    )
)
:npm_found2

if not defined NPM_CMD (
    echo ERROR: npm was not found. Install Node.js LTS and reopen your terminal.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [setup] Installing frontend dependencies...
    pushd frontend
    call "%NPM_CMD%" install
    if errorlevel 1 (
        popd
        echo ERROR: Could not install frontend dependencies.
        pause
        exit /b 1
    )
    popd
)

echo [1/2] Starting FastAPI backend in a new window...
start "Smart Study Hub - Backend" cmd /k call "%PYTHON_EXE%" -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

echo [2/2] Starting React frontend in a new window...
pushd frontend
start "Smart Study Hub - Frontend" cmd /k ""%NPM_CMD%" run dev -- --host 127.0.0.1"
popd

echo.
echo Smart Study Hub was launched.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
echo If AI actions fail, make sure Ollama is installed and running on http://localhost:11434.
echo Close the backend and frontend command windows to stop the servers.
pause
