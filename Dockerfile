# Multi-stage build for Smart Study Hub

# Backend stage
FROM python:3.12-slim as backend

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Create necessary directories
RUN mkdir -p uploads local_db

# Frontend stage
# Frontend stage
FROM node:18-alpine as frontend

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies (FĂRĂ --only=production)
RUN npm ci

# Copy frontend code
COPY frontend/ .

# Build frontend
RUN npm run build

# Final stage
FROM python:3.12-slim

# Install Ollama (for AI models)
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://ollama.ai/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built frontend
COPY --from=frontend /app/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p uploads local_db

# Expose ports
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

# Start the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]