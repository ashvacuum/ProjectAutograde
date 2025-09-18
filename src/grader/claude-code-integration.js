const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ClaudeCodeIntegration {
  constructor() {
    this.isAvailable = false;
    this.claudeCodePath = null;
    this.activeAnalyses = new Map();
  }

  async initialize() {
    try {
      this.claudeCodePath = await this.findClaudeCodeExecutable();
      this.isAvailable = !!this.claudeCodePath;
      return this.isAvailable;
    } catch (error) {
      console.error('Claude Code initialization failed:', error);
      this.isAvailable = false;
      return false;
    }
  }

  async findClaudeCodeExecutable() {
    const possiblePaths = [
      'claude_desktop_app',
      'claude-desktop',
      'claude',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude', 'Claude.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Claude', 'Claude.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Claude', 'Claude.exe')
    ];

    for (const cmdPath of possiblePaths) {
      try {
        const result = await this.testClaudeCodeCommand(cmdPath);
        if (result) {
          return cmdPath;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async testClaudeCodeCommand(cmdPath) {
    return new Promise((resolve) => {
      const process = spawn(cmdPath, ['--version'], {
        stdio: 'pipe',
        timeout: 5000
      });

      process.on('close', (code) => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 5000);
    });
  }

  async analyzeUnityProject(projectAnalysis, gradingCriteria) {
    if (!this.isAvailable) {
      throw new Error('Claude Code is not available. Please ensure Claude Desktop is installed and accessible.');
    }

    const analysisId = this.generateAnalysisId();
    const prompt = this.buildGradingPrompt(projectAnalysis, gradingCriteria);

    try {
      this.activeAnalyses.set(analysisId, {
        status: 'running',
        startTime: Date.now(),
        projectAnalysis,
        criteria: gradingCriteria
      });

      const result = await this.executeClaudeCodeAnalysis(prompt, projectAnalysis);

      this.activeAnalyses.set(analysisId, {
        status: 'completed',
        startTime: this.activeAnalyses.get(analysisId).startTime,
        endTime: Date.now(),
        result
      });

      return {
        analysisId,
        success: true,
        result
      };

    } catch (error) {
      this.activeAnalyses.set(analysisId, {
        status: 'failed',
        error: error.message,
        endTime: Date.now()
      });

      throw error;
    }
  }

  buildGradingPrompt(projectAnalysis, criteria) {
    const prompt = `
# Unity Game Math Assignment Grading

Please analyze this Unity C# project and provide a comprehensive grade based on the specified criteria.

## Project Overview
- Repository: ${projectAnalysis.repoUrl}
- Unity Version: ${projectAnalysis.unityFeatures.version}
- Total C# Files: ${projectAnalysis.codeAnalysis.totalFiles}
- Has Scenes: ${projectAnalysis.unityFeatures.hasScenes} (${projectAnalysis.unityFeatures.sceneCount} scenes)

## Project Structure
- Assets Folder: ${projectAnalysis.structure.hasAssetsFolder}
- Scripts Found: ${projectAnalysis.structure.hasScriptsFolder}
- MonoBehaviour Classes: ${projectAnalysis.codeAnalysis.patterns.monoBehaviours}

## Math Concepts Detected
### Vector Operations
${projectAnalysis.codeAnalysis.mathConcepts.vectorOperations.slice(0, 10).join(', ') || 'None found'}

### Quaternion Usage
${projectAnalysis.codeAnalysis.mathConcepts.quaternionUsage.slice(0, 10).join(', ') || 'None found'}

### Transform Mathematics
${projectAnalysis.codeAnalysis.mathConcepts.transformMath.slice(0, 10).join(', ') || 'None found'}

### Physics Calculations
${projectAnalysis.codeAnalysis.mathConcepts.physicsCalculations.slice(0, 10).join(', ') || 'None found'}

### Trigonometry
${projectAnalysis.codeAnalysis.mathConcepts.trigonometry.slice(0, 10).join(', ') || 'None found'}

### Interpolation
${projectAnalysis.codeAnalysis.mathConcepts.interpolation.slice(0, 10).join(', ') || 'None found'}

## Code Files Analysis
${this.buildCodeFilesSummary(projectAnalysis.codeAnalysis.files)}

## Grading Criteria
${this.formatGradingCriteria(criteria)}

## Required Output Format
Please provide your analysis in the following JSON format:

\`\`\`json
{
  "overallGrade": 85,
  "maxPoints": 100,
  "criteriaScores": {
    "criterionId1": {
      "score": 20,
      "maxScore": 25,
      "feedback": "Detailed feedback for this criterion",
      "evidenceFound": ["specific code examples or features"]
    }
  },
  "strengths": [
    "List of what the student did well"
  ],
  "improvements": [
    "List of areas for improvement"
  ],
  "detailedFeedback": "Overall assessment of the project with specific examples",
  "mathConceptsAssessment": {
    "vectorMath": "Assessment of vector usage",
    "quaternions": "Assessment of rotation handling",
    "physics": "Assessment of physics implementation",
    "codeQuality": "Assessment of code organization and quality"
  }
}
\`\`\`

Please analyze the project thoroughly and provide constructive feedback that will help the student improve their Unity math programming skills.
`;

    return prompt;
  }

  buildCodeFilesSummary(files) {
    if (files.length === 0) return 'No C# files found in the project.';

    let summary = '';
    const maxFiles = 5;

    for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
      const file = files[i];
      if (file.error) {
        summary += `\n- ${file.path}: Error reading file - ${file.error}`;
      } else {
        summary += `\n- ${file.path}: ${file.lines} lines, ${file.classes.length} classes, ${file.methods.length} methods`;
        if (file.classes.length > 0) {
          summary += `\n  Classes: ${file.classes.map(c => c.name).join(', ')}`;
        }
      }
    }

    if (files.length > maxFiles) {
      summary += `\n... and ${files.length - maxFiles} more files`;
    }

    return summary;
  }

  formatGradingCriteria(criteria) {
    if (!criteria || !criteria.items) {
      return 'No specific grading criteria provided. Use general Unity math programming assessment.';
    }

    let formatted = '';
    criteria.items.forEach((criterion, index) => {
      formatted += `\n### Criterion ${index + 1}: ${criterion.name} (${criterion.points} points)
Description: ${criterion.description}
Weight: ${criterion.weight || 'Equal'}`;
    });

    return formatted;
  }

  async executeClaudeCodeAnalysis(prompt, projectAnalysis) {
    const tempDir = path.join(__dirname, '../../temp');
    const promptFile = path.join(tempDir, `grading_prompt_${Date.now()}.md`);
    const codeContextFile = path.join(tempDir, `code_context_${Date.now()}.json`);

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(promptFile, prompt, 'utf-8');
      await fs.writeFile(codeContextFile, JSON.stringify(projectAnalysis, null, 2), 'utf-8');

      const analysisPrompt = `
Please read the grading prompt from: ${promptFile}
And the detailed project analysis from: ${codeContextFile}

Based on this Unity project analysis, provide a comprehensive grade following the JSON format specified in the prompt.

Focus particularly on:
1. Mathematical concepts implementation (vectors, quaternions, transforms)
2. Code quality and organization
3. Unity-specific best practices
4. Physics and math accuracy
5. Project structure and completeness

Provide detailed, constructive feedback that helps the student understand both strengths and areas for improvement.
`;

      return await this.callClaudeCode(analysisPrompt);

    } finally {
      try {
        await fs.unlink(promptFile);
        await fs.unlink(codeContextFile);
      } catch (error) {
        console.warn('Failed to clean up temp files:', error.message);
      }
    }
  }

  async callClaudeCode(prompt) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.claudeCodePath, [], {
        stdio: 'pipe',
        timeout: 60000
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.stdin.write(prompt);
      process.stdin.end();

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = this.parseClaudeCodeResponse(output);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Claude Code response: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Claude Code process failed with code ${code}: ${errorOutput}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to execute Claude Code: ${error.message}`));
      });

      setTimeout(() => {
        process.kill();
        reject(new Error('Claude Code analysis timed out after 60 seconds'));
      }, 60000);
    });
  }

  parseClaudeCodeResponse(response) {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (error) {
        throw new Error(`Invalid JSON in response: ${error.message}`);
      }
    }

    throw new Error('No JSON response found in Claude Code output');
  }

  async getAnalysisResult(analysisId) {
    return this.activeAnalyses.get(analysisId) || null;
  }

  generateAnalysisId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getAvailabilityStatus() {
    return {
      isAvailable: this.isAvailable,
      claudeCodePath: this.claudeCodePath,
      activeAnalyses: this.activeAnalyses.size
    };
  }
}

module.exports = ClaudeCodeIntegration;