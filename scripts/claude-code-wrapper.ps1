# Claude Code Wrapper Script for AraLaro
# PowerShell version with better JSON handling

param(
    [Parameter(Mandatory=$true)]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$InputFile,

    [Parameter(Mandatory=$false)]
    [string]$OutputFile
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$TempDir = Join-Path $ProjectRoot "temp"

# Ensure temp directory exists
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

function Find-ClaudeCodeExecutable {
    Write-Host "Searching for Claude Code executable..."

    $possiblePaths = @(
        "claude-code",
        "claude",
        "npx claude-code",
        "$env:USERPROFILE\.npm-global\claude-code.cmd",
        "$env:APPDATA\npm\claude-code.cmd",
        "$env:PROGRAMFILES\nodejs\claude-code.cmd"
    )

    foreach ($path in $possiblePaths) {
        Write-Host "  Testing: $path"

        try {
            if ($path.StartsWith("npx")) {
                $result = Start-Process -FilePath "npx" -ArgumentList "claude-code", "--help" -WindowStyle Hidden -PassThru -Wait
            } else {
                $result = Start-Process -FilePath $path -ArgumentList "--help" -WindowStyle Hidden -PassThru -Wait
            }

            if ($result.ExitCode -eq 0) {
                Write-Host "Found Claude Code at: $path"
                return $path
            }
        }
        catch {
            continue
        }
    }

    throw "Claude Code executable not found. Please install: npm install -g claude-code"
}

function Invoke-ClaudeCode {
    param(
        [string]$ClaudeExec,
        [string]$PromptText
    )

    $tempPromptFile = Join-Path $TempDir "prompt_$(Get-Random).txt"
    $tempOutputFile = Join-Path $TempDir "output_$(Get-Random).txt"

    try {
        # Write prompt to temporary file
        $PromptText | Out-File -FilePath $tempPromptFile -Encoding UTF8

        # Execute Claude Code
        if ($ClaudeExec.StartsWith("npx")) {
            $process = Start-Process -FilePath "npx" -ArgumentList "claude-code" -RedirectStandardInput $tempPromptFile -RedirectStandardOutput $tempOutputFile -WindowStyle Hidden -PassThru -Wait
        } else {
            $process = Start-Process -FilePath $ClaudeExec -RedirectStandardInput $tempPromptFile -RedirectStandardOutput $tempOutputFile -WindowStyle Hidden -PassThru -Wait
        }

        if (Test-Path $tempOutputFile) {
            return Get-Content $tempOutputFile -Raw
        } else {
            throw "No output received from Claude Code"
        }
    }
    finally {
        # Cleanup
        if (Test-Path $tempPromptFile) { Remove-Item $tempPromptFile -Force }
        if (Test-Path $tempOutputFile) { Remove-Item $tempOutputFile -Force }
    }
}

function Extract-JsonFromResponse {
    param([string]$Response)

    # Look for JSON content between ```json and ```
    $jsonPattern = '(?s)```json\s*(.*?)\s*```'
    $match = [regex]::Match($Response, $jsonPattern)

    if ($match.Success) {
        return $match.Groups[1].Value.Trim()
    }

    # If no markdown code block, try to find JSON-like content
    $jsonStart = $Response.IndexOf('{')
    $jsonEnd = $Response.LastIndexOf('}')

    if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
        return $Response.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
    }

    return $null
}

# Main execution
try {
    $claudeExecutable = Find-ClaudeCodeExecutable

    switch ($Action.ToLower()) {
        "check" {
            Write-Host "Claude Code is available and working"
            Write-Host "Path: $claudeExecutable"
            exit 0
        }

        "analyze" {
            if (-not $InputFile -or -not (Test-Path $InputFile)) {
                throw "Input file required and must exist for analyze action"
            }

            Write-Host "Analyzing Unity project with Claude Code..."
            Write-Host "Input: $InputFile"

            $contextData = Get-Content $InputFile -Raw | ConvertFrom-Json

            $prompt = @"
Please analyze this Unity C# project for educational assessment.

Focus on:
1. Mathematical concepts implementation (vectors, quaternions, transforms)
2. Code quality and organization
3. Unity-specific best practices
4. Physics and math accuracy
5. Project structure and completeness

Project Analysis Data:
$((Get-Content $InputFile -Raw))

Please provide detailed feedback on the code quality, mathematical accuracy,
and suggestions for improvement. Be constructive and educational.
"@

            $response = Invoke-ClaudeCode -ClaudeExec $claudeExecutable -PromptText $prompt
            Write-Host $response
        }

        "grade" {
            if (-not $InputFile -or -not (Test-Path $InputFile)) {
                throw "Input file required and must exist for grade action"
            }

            if (-not $OutputFile) {
                $OutputFile = Join-Path $TempDir "grading_result_$(Get-Random).json"
            }

            Write-Host "Grading Unity project with Claude Code..."
            Write-Host "Input: $InputFile"
            Write-Host "Output: $OutputFile"

            $prompt = @"
Please grade this Unity C# project and provide a comprehensive assessment.

Project analysis data:
$((Get-Content $InputFile -Raw))

Provide your response in the following JSON format:
```json
{
  "overallGrade": 85,
  "maxPoints": 100,
  "criteriaScores": {
    "vectorMath": {
      "score": 20,
      "maxScore": 25,
      "feedback": "Good use of Vector3 operations",
      "evidenceFound": ["Vector3.Dot usage in PlayerController.cs"]
    },
    "codeQuality": {
      "score": 18,
      "maxScore": 25,
      "feedback": "Clean code structure with room for improvement",
      "evidenceFound": ["Well-organized classes", "Consistent naming"]
    },
    "transformMath": {
      "score": 22,
      "maxScore": 25,
      "feedback": "Excellent transform manipulations",
      "evidenceFound": ["Smooth rotation animations", "Proper position updates"]
    },
    "physicsImplementation": {
      "score": 15,
      "maxScore": 25,
      "feedback": "Basic physics implementation, could be enhanced",
      "evidenceFound": ["Rigidbody usage", "Simple collision detection"]
    }
  },
  "strengths": [
    "Strong mathematical implementation",
    "Good code organization",
    "Proper Unity patterns"
  ],
  "improvements": [
    "Add more comments explaining math concepts",
    "Optimize physics calculations in Update loops",
    "Implement more advanced vector operations"
  ],
  "detailedFeedback": "Overall well-implemented Unity project with solid math concepts. The student demonstrates understanding of basic vector operations and transform manipulations. Code is well-organized and follows Unity conventions. Areas for improvement include performance optimization and more advanced mathematical concepts.",
  "mathConceptsAssessment": {
    "vectorMath": "Good understanding of basic vector operations, could benefit from more advanced techniques",
    "quaternions": "Basic rotation handling, opportunity to explore quaternion interpolation",
    "physics": "Fundamental physics implementation present, room for more complex interactions",
    "codeQuality": "Clean, readable code with good structure and naming conventions"
  }
}
```

Focus on Unity math programming concepts, code quality, and educational value.
Be specific about what was done well and what could be improved.
Provide constructive feedback that helps students learn.
"@

            $response = Invoke-ClaudeCode -ClaudeExec $claudeExecutable -PromptText $prompt

            # Extract JSON from response
            $jsonContent = Extract-JsonFromResponse -Response $response

            if ($jsonContent) {
                # Validate JSON
                try {
                    $jsonObject = $jsonContent | ConvertFrom-Json
                    $jsonContent | Out-File -FilePath $OutputFile -Encoding UTF8
                    Write-Host "Grading results saved to: $OutputFile"
                } catch {
                    Write-Warning "Failed to parse JSON response, saving raw output"
                    $response | Out-File -FilePath $OutputFile -Encoding UTF8
                }
            } else {
                Write-Warning "No JSON found in response, saving raw output"
                $response | Out-File -FilePath $OutputFile -Encoding UTF8
            }

            Write-Host "Grading complete!"
        }

        default {
            Write-Host "Usage: claude-code-wrapper.ps1 -Action [action] -InputFile [file] -OutputFile [file]"
            Write-Host ""
            Write-Host "Actions:"
            Write-Host "  check       - Check if Claude Code is available"
            Write-Host "  analyze     - Analyze Unity project with provided context"
            Write-Host "  grade       - Grade Unity project with criteria"
            exit 1
        }
    }
}
catch {
    Write-Error "ERROR: $($_.Exception.Message)"
    exit 1
}