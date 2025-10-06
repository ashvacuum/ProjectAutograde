@echo off
setlocal enabledelayedexpansion

:: Claude Code Wrapper Script for AraLaro
:: This script interfaces with Claude Code CLI to analyze Unity projects

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "TEMP_DIR=%PROJECT_ROOT%\temp"
set "CLAUDE_EXECUTABLE="

:: Create temp directory if it doesn't exist
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

:: Function to find Claude Code executable
:findClaudeCode
echo Searching for Claude Code executable...

:: Try common locations for Claude Code CLI
set "PATHS[0]=claude-code"
set "PATHS[1]=claude"
set "PATHS[2]=npx claude-code"
set "PATHS[3]=%USERPROFILE%\.npm-global\claude-code.cmd"
set "PATHS[4]=%APPDATA%\npm\claude-code.cmd"
set "PATHS[5]=%PROGRAMFILES%\nodejs\claude-code.cmd"

for /L %%i in (0,1,5) do (
    if defined PATHS[%%i] (
        echo Testing: !PATHS[%%i]!
        call :testClaudeCommand "!PATHS[%%i]!"
        if !errorlevel! equ 0 (
            set "CLAUDE_EXECUTABLE=!PATHS[%%i]!"
            echo Found Claude Code at: !CLAUDE_EXECUTABLE!
            goto :claudeFound
        )
    )
)

echo ERROR: Claude Code executable not found
echo Please install Claude Code CLI: npm install -g claude-code
echo Or ensure it's available in your PATH
exit /b 1

:claudeFound
echo Claude Code executable found: %CLAUDE_EXECUTABLE%
goto :main

:: Function to test Claude Code command
:testClaudeCommand
set "cmd=%~1"
echo   Testing command: %cmd%

:: Handle npx commands differently
echo %cmd% | findstr /i "npx" >nul
if !errorlevel! equ 0 (
    npx claude-code --help >nul 2>&1
) else (
    %cmd% --help >nul 2>&1
)

exit /b !errorlevel!

:main
:: Parse command line arguments
set "ACTION=%1"
set "INPUT_FILE=%2"
set "OUTPUT_FILE=%3"

if "%ACTION%"=="" (
    echo Usage: claude-code-wrapper.bat [action] [input_file] [output_file]
    echo Actions:
    echo   check       - Check if Claude Code is available
    echo   analyze     - Analyze Unity project with provided context
    echo   grade       - Grade Unity project with criteria
    goto :usage
)

if "%ACTION%"=="check" goto :checkOnly
if "%ACTION%"=="analyze" goto :analyzeProject
if "%ACTION%"=="grade" goto :gradeProject

:usage
echo.
echo Available actions:
echo   check                           - Check Claude Code availability
echo   analyze [context.json]          - Analyze project with context
echo   grade [context.json] [out.json] - Grade project and save results
echo.
exit /b 1

:checkOnly
echo Claude Code is available and working
echo Path: %CLAUDE_EXECUTABLE%
exit /b 0

:analyzeProject
if "%INPUT_FILE%"=="" (
    echo ERROR: Input file required for analyze action
    exit /b 1
)

if not exist "%INPUT_FILE%" (
    echo ERROR: Input file not found: %INPUT_FILE%
    exit /b 1
)

echo Analyzing Unity project with Claude Code...
echo Input: %INPUT_FILE%

:: Create analysis prompt
set "PROMPT_FILE=%TEMP_DIR%\analysis_prompt_%RANDOM%.txt"

echo Creating analysis prompt...
(
echo Please analyze this Unity C# project for educational assessment.
echo.
echo Focus on:
echo 1. Mathematical concepts implementation ^(vectors, quaternions, transforms^)
echo 2. Code quality and organization
echo 3. Unity-specific best practices
echo 4. Physics and math accuracy
echo 5. Project structure and completeness
echo.
echo Project analysis data is in the following file:
echo %INPUT_FILE%
echo.
echo Please provide detailed feedback on the code quality, mathematical accuracy,
echo and suggestions for improvement. Be constructive and educational.
) > "%PROMPT_FILE%"

:: Run Claude Code with the prompt
echo Running Claude Code analysis...
echo %CLAUDE_EXECUTABLE% | findstr /i "npx" >nul
if !errorlevel! equ 0 (
    npx claude-code < "%PROMPT_FILE%"
) else (
    %CLAUDE_EXECUTABLE% < "%PROMPT_FILE%"
)

:: Cleanup
del "%PROMPT_FILE%" 2>nul

exit /b 0

:gradeProject
if "%INPUT_FILE%"=="" (
    echo ERROR: Input file required for grade action
    exit /b 1
)

if "%OUTPUT_FILE%"=="" (
    set "OUTPUT_FILE=%TEMP_DIR%\grading_result_%RANDOM%.json"
)

if not exist "%INPUT_FILE%" (
    echo ERROR: Input file not found: %INPUT_FILE%
    exit /b 1
)

echo Grading Unity project with Claude Code...
echo Input: %INPUT_FILE%
echo Output: %OUTPUT_FILE%

:: Create grading prompt
set "PROMPT_FILE=%TEMP_DIR%\grading_prompt_%RANDOM%.txt"

echo Creating grading prompt...
(
echo Please grade this Unity C# project and provide a comprehensive assessment.
echo.
echo Read the project analysis from: %INPUT_FILE%
echo.
echo Provide your response in the following JSON format:
echo ```json
echo {
echo   "overallGrade": 85,
echo   "maxPoints": 100,
echo   "criteriaScores": {
echo     "vectorMath": {
echo       "score": 20,
echo       "maxScore": 25,
echo       "feedback": "Good use of Vector3 operations",
echo       "evidenceFound": ["Vector3.Dot usage in PlayerController.cs"]
echo     },
echo     "codeQuality": {
echo       "score": 18,
echo       "maxScore": 25,
echo       "feedback": "Clean code structure with room for improvement",
echo       "evidenceFound": ["Well-organized classes", "Consistent naming"]
echo     }
echo   },
echo   "strengths": [
echo     "Strong mathematical implementation",
echo     "Good code organization"
echo   ],
echo   "improvements": [
echo     "Add more comments",
echo     "Optimize physics calculations"
echo   ],
echo   "detailedFeedback": "Overall well-implemented Unity project with solid math concepts..."
echo }
echo ```
echo.
echo Focus on Unity math programming concepts, code quality, and educational value.
echo Be specific about what was done well and what could be improved.
) > "%PROMPT_FILE%"

:: Run Claude Code and capture output
echo Running Claude Code grading...
set "TEMP_OUTPUT=%TEMP_DIR%\claude_output_%RANDOM%.txt"

echo %CLAUDE_EXECUTABLE% | findstr /i "npx" >nul
if !errorlevel! equ 0 (
    npx claude-code < "%PROMPT_FILE%" > "%TEMP_OUTPUT%" 2>&1
) else (
    %CLAUDE_EXECUTABLE% < "%PROMPT_FILE%" > "%TEMP_OUTPUT%" 2>&1
)

:: Extract JSON from output and save to output file
echo Extracting grading results...
findstr /B /E "```json" "%TEMP_OUTPUT%" >nul
if !errorlevel! equ 0 (
    :: Extract JSON content between ```json and ```
    for /f "tokens=*" %%a in ('findstr /n ".*" "%TEMP_OUTPUT%"') do (
        set "line=%%a"
        echo !line! | findstr "```json" >nul
        if !errorlevel! equ 0 set "start_json=1"
        if defined start_json (
            echo !line! | findstr "```$" >nul
            if !errorlevel! equ 0 if not "!line!"=="!line:```json=!" set "start_json="
            if defined start_json (
                set "content=!line:*:=!"
                if not "!content!"=="```json" if not "!content!"=="```" echo !content! >> "%OUTPUT_FILE%"
            )
        )
    )
    echo Grading results saved to: %OUTPUT_FILE%
) else (
    echo No JSON output found, saving raw output...
    copy "%TEMP_OUTPUT%" "%OUTPUT_FILE%" >nul
)

:: Cleanup
del "%PROMPT_FILE%" 2>nul
del "%TEMP_OUTPUT%" 2>nul

echo Grading complete!
exit /b 0

:error
echo ERROR: %1
exit /b 1