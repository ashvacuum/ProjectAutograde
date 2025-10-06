@echo off
echo ========================================
echo Clear Stored API Keys
echo ========================================
echo.
echo This will DELETE all stored API keys from the app.
echo After this, the app will use keys from .env file instead.
echo.
echo Location: %APPDATA%\aralaro
echo.
pause

if exist "%APPDATA%\aralaro\api-keys.json" (
    del "%APPDATA%\aralaro\api-keys.json"
    echo.
    echo ✓ Deleted api-keys.json
) else (
    echo.
    echo  No api-keys.json found
)

if exist "%APPDATA%\aralaro\config.json" (
    del "%APPDATA%\aralaro\config.json"
    echo ✓ Deleted config.json
) else (
    echo  No config.json found
)

echo.
echo ========================================
echo Done!
echo ========================================
echo.
echo The app will now use API keys from .env file.
echo Your .env file has:
echo   - ANTHROPIC_API_KEY: Set
echo   - CANVAS_API_KEY: Set
echo.
echo Start the app with: start-debug.bat
echo.
pause
