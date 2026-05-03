#!/bin/bash

# Smart Study Hub - Docker Run Script

set -e

echo "🚀 Starting Smart Study Hub with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Build and start services
echo "📦 Building and starting services..."
if command -v docker-compose &> /dev/null; then
    docker-compose up --build -d
else
    docker compose up --build -d
fi

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if curl -f http://localhost:8000/docs &> /dev/null; then
    echo "✅ Backend is running at http://localhost:8000"
    echo "✅ API docs available at http://localhost:8000/docs"
else
    echo "❌ Backend failed to start"
    exit 1
fi

if curl -f http://localhost:11434/api/tags &> /dev/null; then
    echo "✅ Ollama is running at http://localhost:11434"
else
    echo "⚠️  Ollama is starting... (may take a few minutes for first model download)"
fi

echo ""
echo "🎉 Smart Study Hub is running!"
echo "🌐 Frontend: http://localhost:8000 (served by backend)"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""
echo "To stop: docker-compose down"
echo "To view logs: docker-compose logs -f"