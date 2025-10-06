@echo off
echo Committing AraLaro changes...

:: Check if git is available
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Git is not installed or not in PATH
    pause
    exit /b 1
)

:: Check if we're in a git repository
git status >nul 2>nul
if %errorlevel% neq 0 (
    echo Initializing git repository...
    git init
    git remote add origin https://github.com/ashvacuum/ProjectAutograde.git
)

:: Add all files
echo Adding files to git...
git add .

:: Check if there are changes to commit
git diff --cached --exit-code >nul 2>nul
if %errorlevel% equ 0 (
    echo No changes to commit.
    pause
    exit /b 0
)

:: Get commit message from user or use default
set /p commit_message="Enter commit message (or press Enter for default): "
if "%commit_message%"=="" set commit_message=AraLaro application update

:: Commit changes
echo Committing changes...
git commit -m "%commit_message%

🤖 Generated with Claude Code (https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

if %errorlevel% neq 0 (
    echo Error: Failed to commit changes
    pause
    exit /b 1
)

:: Ask user if they want to push
set /p push_choice="Push changes to remote repository? (y/N): "
if /i "%push_choice%"=="y" (
    echo Pushing to remote repository...
    git push origin main
    if %errorlevel% neq 0 (
        echo Warning: Failed to push to remote. You may need to pull first or check credentials.
        echo You can manually push later with: git push origin main
    ) else (
        echo Successfully pushed changes to remote repository!
    )
) else (
    echo Changes committed locally. You can push later with: git push origin main
)

echo.
echo Git operations completed!
pause