@echo off
REM Smart Study Hub - Docker Run Script for Windows

echo 🚀 Starting Smart Study Hub with Docker...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker first.
    pause
    exit /b 1
)

REM Check if Docker Compose is available
docker-compose --version >nul 2>&1
if %errorlevel% equ 0 (
    set COMPOSE_CMD=docker-compose
) else (
    docker compose version >nul 2>&1
    if %errorlevel% equ 0 (
        set COMPOSE_CMD=docker compose
    ) else (
        echo ❌ Docker Compose is not available. Please install Docker Compose.
        pause
        exit /b 1
    )
)

REM Build and start services
echo 📦 Building and starting services...
%COMPOSE_CMD% up --build -d

echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check if backend is running
curl -f http://localhost:8000/docs >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend is running at http://localhost:8000
    echo ✅ API docs available at http://localhost:8000/docs
) else (
    echo ❌ Backend failed to start
    pause
    exit /b 1
)

REM Check if Ollama is running
curl -f http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Ollama is running at http://localhost:11434
) else (
    echo ⚠️  Ollama is starting... (may take a few minutes for first model download)
)

echo.
echo 🎉 Smart Study Hub is running!
echo 🌐 Frontend: http://localhost:8000 (served by backend)
echo 📚 API Docs: http://localhost:8000/docs
echo.
echo To stop: %COMPOSE_CMD% down
echo To view logs: %COMPOSE_CMD% logs -f
echo.
pause