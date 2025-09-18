@echo off

:: Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo This script requires administrator privileges to handle symbolic links.
    echo Requesting administrator access...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Building Unity Auto-Grader with Administrator Privileges...

:: Enable Developer Mode to allow symbolic links without admin (for future runs)
echo Attempting to enable Developer Mode for symbolic links...
powershell -Command "New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -PropertyType DWORD -Force" 2>nul

:: Change to the script directory
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Clear electron-builder cache to avoid corrupted files
echo Clearing electron-builder cache...
rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
rmdir /s /q "%APPDATA%\npm-cache\_npx" 2>nul

:: Install dependencies
echo Installing dependencies...
call npm install

:: Try building with different options
echo Building Windows executable...
call npx electron-builder --win --publish=never --config.win.signingHashAlgorithms=null --config.win.signAndEditExecutable=false

if %errorlevel% neq 0 (
    echo Standard build failed, trying without code signing...
    :: Try with portable build
    call npx electron-builder --win portable --publish=never

    if %errorlevel% neq 0 (
        echo Portable build failed, creating simple package...
        call npm install electron-packager -g
        call npx electron-packager . unity-auto-grader --platform=win32 --arch=x64 --out=dist --overwrite
    )
)

echo.
echo Build process completed!
echo Check the 'dist' folder for output files.
echo.
pause