#!/bin/bash

echo "🚀 Starting Smart Study Hub..."

# Function to handle cleanup on script exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT SIGTERM

# Start Backend
echo "🐍 Starting FastAPI Backend..."
# Use virtual environment if it exists
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

echo "📦 Installing backend dependencies..."
pip install -r requirements.txt
if [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
fi

# Run the backend in the background
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start Frontend
echo "⚛️  Starting React Frontend..."
cd frontend

echo "📦 Installing frontend dependencies..."
npm install

# Run the frontend in the background
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Smart Study Hub is running!"
echo "➡️  Frontend: http://localhost:5173"
echo "➡️  Backend API: http://localhost:8000"
echo "Press Ctrl+C to stop both services."
echo ""

# Keep script running to maintain the background processes
wait $BACKEND_PID $FRONTEND_PID