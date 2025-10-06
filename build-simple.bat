@echo off
echo Building AraLaro (Simple Build)...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Install missing dependencies
echo Installing missing dependencies...
call npm install simple-git js-yaml csv-writer jspdf

:: Create dist directory if it doesn't exist
if not exist "dist" mkdir dist

:: Try building with portable option (no installer)
echo Building portable application...
call npx electron-builder --win --publish=never --config.compression=store --config.nsis=null

if %errorlevel% neq 0 (
    echo Standard build failed, trying alternative approach...

    :: Alternative: Create a simple packaged app
    echo Creating simple package...
    call npx electron-packager . aralaro --platform=win32 --arch=x64 --out=dist --overwrite --ignore="node_modules/(devtron|electron-prebuilt|electron-packager|\.bin)" --prune=true

    if %errorlevel% neq 0 (
        echo Packager also failed, trying development mode...
        echo You can run the app in development mode with: npm start
    ) else (
        echo.
        echo Portable app created successfully!
        echo Location: dist\aralaro-win32-x64\
        echo Run aralaro.exe to start the application
    )
) else (
    echo.
    echo Build completed successfully!
    echo The application can be found in the 'dist' folder.
)

echo.
pause