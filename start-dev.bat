@echo off
echo Starting Unity Auto-Grader in Development Mode...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Install missing dependencies that might be needed
echo Checking for additional dependencies...
call npm install simple-git js-yaml csv-writer jspdf --save

:: Start the application in development mode
echo Starting application...
set NODE_ENV=development
call npm start

pause