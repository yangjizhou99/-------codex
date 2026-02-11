@echo off
rem Kill any existing processes (silently continue if not found)
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

echo Starting Habit Miner Service (Python on Port 8006)...
start "HabitMiner" /b python "python-services\habit_miner\server.py"

echo.
echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting Codex Main App (Node.js on Port 4173)...
node server.js
pause
