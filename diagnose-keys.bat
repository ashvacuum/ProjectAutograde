@echo off
echo ========================================
echo API Key Diagnostic
echo ========================================
echo.

echo 1. Checking .env file...
node -e "require('dotenv').config(); console.log('   ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set (***' + process.env.ANTHROPIC_API_KEY.slice(-4) + ')' : 'NOT SET'); console.log('   CANVAS_API_KEY:', process.env.CANVAS_API_KEY ? 'Set (***' + process.env.CANVAS_API_KEY.slice(-4) + ')' : 'NOT SET');"

echo.
echo 2. Checking stored keys...
if exist "%APPDATA%\aralaro\api-keys.json" (
    echo    Stored keys file EXISTS
    echo    This means the app might use OLD keys from here
    echo    instead of your .env file!
) else (
    echo    No stored keys file found (good - will use .env)
)

echo.
echo 3. Testing Anthropic API...
node test-anthropic-real.js | findstr /C:"Status:" /C:"✅" /C:"❌" /C:"API Key Preview"

echo.
echo ========================================
echo Recommendation:
echo ========================================
echo.

if exist "%APPDATA%\aralaro\api-keys.json" (
    echo The app has STORED keys that might be OLD/INVALID.
    echo.
    echo Option 1: Clear stored keys to use .env
    echo    Run: clear-stored-keys.bat
    echo.
    echo Option 2: Update key in the app
    echo    1. Start app with: start-debug.bat
    echo    2. Go to Settings
    echo    3. Delete old key
    echo    4. Add new key from .env
) else (
    echo Good! No stored keys found.
    echo The app will use your .env file.
    echo.
    echo If grading still fails, check console with:
    echo    start-debug.bat
)

echo.
pause
