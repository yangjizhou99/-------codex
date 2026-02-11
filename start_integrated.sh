#!/bin/bash
echo "=== Setup Check ==="
echo "Using Python: $(which python)"
python --version

echo "Installing/Verifying Python dependencies..."
# Install dependencies using the current python environment
pip install -r "python-services/habit_miner/requirements.txt"

echo "=== Starting Services ==="
echo "Stopping existing Node/Python processes..."
# Use MSYS-style path conversion for taskkill if needed, or just ignore errors
taskkill //F //IM node.exe >/dev/null 2>&1
taskkill //F //IM python.exe >/dev/null 2>&1

echo "Starting Habit Miner Service (Python on Port 8006)..."
# Start Python in background and log output
python "python-services/habit_miner/server.py" > python_service.log 2>&1 &
PYTHON_PID=$!
echo "Python service started with PID $PYTHON_PID. Logs in python_service.log"

echo "Waiting 5 seconds for Python service to initialize..."
sleep 5

echo "Starting Codex Main App (Node.js on Port 4173)..."
node server.js
