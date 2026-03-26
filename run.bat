@echo off
title Smart Study Hub Launcher

echo =========================================
echo    🚀 Starting Smart Study Hub...
echo =========================================

echo.
echo [1/2] 🐍 Starting FastAPI Backend in a new window...
start "Smart Study Hub - Backend" cmd /c "if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat) & python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] ⚛️  Starting React Frontend in a new window...
cd frontend
start "Smart Study Hub - Frontend" cmd /k "npm run dev"

echo.
echo ✅ Smart Study Hub was successfully launched!
echo ➡️  Frontend: http://localhost:5173
echo ➡️  Backend:  http://localhost:8000
echo.
echo Please close the newly opened command prompt windows to stop the servers.
pause
