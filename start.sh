#!/bin/bash
# Start script for Sales Prompt Router

echo "🚀 Starting Sales Prompt Router..."

echo "🎨 Starting Tailwind CSS compiler in background..."
npx tailwindcss -i ./frontend/css/styles.css -o ./frontend/css/output.css -w &
TAILWIND_PID=$!

echo "🌐 Starting FastAPI backend server on port 8000..."
uv run uvicorn src.api:app --reload --port 8000 &
SERVER_PID=$!

echo "✨ Backend and Frontend running."
echo "👉 Open http://localhost:8000/frontend/index.html to view the app"
echo "Press Ctrl+C to stop both servers."

# Wait for process to exit
wait $SERVER_PID
wait $TAILWIND_PID
