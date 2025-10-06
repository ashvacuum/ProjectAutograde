@echo off
echo ========================================
echo AraLaro - DEBUG MODE
echo ========================================
echo.
echo This mode enables:
echo  - Verbose console logging
echo  - DevTools automatically opened
echo  - All grading steps logged
echo  - Error stack traces
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Set environment variables for maximum logging
set NODE_ENV=development
set DEBUG=*
set ELECTRON_ENABLE_LOGGING=1

echo.
echo Starting in DEBUG mode...
echo Check the console and DevTools for detailed logs.
echo.

:: Start with full logging
call npm start

pause
