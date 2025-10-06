@echo off
echo Building AraLaro for Windows...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH
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

:: Create dist directory if it doesn't exist
if not exist "dist" mkdir dist

:: Build the Windows executable using electron-packager
echo Building Windows executable...
call npm run package-win
if %errorlevel% neq 0 (
    echo Error: Build failed, trying alternative method...
    call npx electron-packager . aralaro --platform=win32 --arch=x64 --out=dist --overwrite --prune=true
    if %errorlevel% neq 0 (
        echo Error: All build methods failed
        pause
        exit /b 1
    )
)

echo.
echo Build completed successfully!
echo The application can be found in: dist\aralaro-win32-x64\aralaro.exe
echo.
pause