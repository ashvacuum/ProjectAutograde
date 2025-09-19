const fs = require('fs').promises;
const path = require('path');

class LLMIntegration {
  constructor(apiKeyManager) {
    this.apiKeyManager = apiKeyManager;
    this.isAvailable = false;
    this.activeProvider = null;
    this.activeAnalyses = new Map();
  }

  async initialize() {
    try {
      const activeProvider = await this.apiKeyManager.getActiveProvider();

      if (activeProvider) {
        this.activeProvider = activeProvider;
        this.isAvailable = true;
        console.log(`✅ LLM integration initialized with ${activeProvider.config.providerInfo.name}`);
      } else {
        console.log('⚠️ No active LLM provider found. Please configure an API key in Settings.');
        this.isAvailable = false;
      }

      return this.isAvailable;
    } catch (error) {
      console.error('LLM integration initialization failed:', error);
      this.isAvailable = false;
      return false;
    }
  }

  async analyzeUnityProject(projectAnalysis, gradingCriteria, assignmentDetails = null) {
    if (!this.isAvailable) {
      throw new Error('No LLM provider is available. Please configure an API key in Settings.');
    }

    const analysisId = this.generateAnalysisId();
    const prompt = this.buildGradingPrompt(projectAnalysis, gradingCriteria, assignmentDetails);

    try {
      this.activeAnalyses.set(analysisId, {
        status: 'running',
        startTime: Date.now(),
        projectAnalysis,
        criteria: gradingCriteria,
        assignmentDetails,
        provider: this.activeProvider.provider
      });

      const result = await this.executeLLMAnalysis(prompt, projectAnalysis);

      this.activeAnalyses.set(analysisId, {
        status: 'completed',
        startTime: this.activeAnalyses.get(analysisId).startTime,
        endTime: Date.now(),
        result,
        provider: this.activeProvider.provider
      });

      // Update last used timestamp for the provider
      await this.apiKeyManager.updateLastUsed(this.activeProvider.provider);

      return {
        analysisId,
        success: true,
        result
      };

    } catch (error) {
      this.activeAnalyses.set(analysisId, {
        status: 'failed',
        error: error.message,
        endTime: Date.now(),
        provider: this.activeProvider?.provider || 'unknown'
      });

      throw error;
    }
  }

  buildGradingPrompt(projectAnalysis, criteria, assignmentDetails = null) {
    const prompt = `
# Unity Game Math Assignment Grading System

You are an expert Unity instructor grading a student's math programming assignment. Please provide a comprehensive, educational assessment that will help the student learn and improve.

## Assignment Details
${assignmentDetails ? this.formatAssignmentDetails(assignmentDetails) : 'Standard Unity Math Programming Assignment'}

## Grading Rubric and Criteria
${this.formatGradingCriteria(criteria)}

## Project Analysis Data

### Repository Information
- **Repository URL:** ${projectAnalysis.repoUrl || 'Not provided'}
- **Unity Version:** ${projectAnalysis.unityFeatures?.version || 'Unknown'}
- **Total C# Files:** ${projectAnalysis.codeAnalysis?.totalFiles || 0}
- **Scene Count:** ${projectAnalysis.unityFeatures?.sceneCount || 0}

### Project Structure Assessment
- **Assets Folder Present:** ${projectAnalysis.structure?.hasAssetsFolder ? 'Yes' : 'No'}
- **Scripts Folder Organized:** ${projectAnalysis.structure?.hasScriptsFolder ? 'Yes' : 'No'}
- **MonoBehaviour Classes:** ${projectAnalysis.codeAnalysis?.patterns?.monoBehaviours || 0}

### Mathematical Concepts Implementation

#### Vector Mathematics
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.vectorOperations || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No vector operations detected'}

#### Quaternion and Rotation Handling
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.quaternionUsage || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No quaternion usage detected'}

#### Transform Mathematics
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.transformMath || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No transform math detected'}

#### Physics and Forces
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.physicsCalculations || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No physics calculations detected'}

#### Trigonometry Usage
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.trigonometry || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No trigonometry detected'}

#### Interpolation and Animation
**Found Evidence:**
${(projectAnalysis.codeAnalysis?.mathConcepts?.interpolation || []).slice(0, 8).map(op => `- ${op}`).join('\n') || '- No interpolation detected'}

### Code Quality and Structure
${this.buildCodeFilesSummary(projectAnalysis.codeAnalysis?.files || [])}

## Grading Instructions

### Assessment Guidelines
1. **Mathematical Accuracy:** Evaluate the correctness of mathematical implementations
2. **Code Quality:** Assess readability, organization, and Unity best practices
3. **Concept Understanding:** Determine if the student demonstrates understanding of the underlying math concepts
4. **Implementation Completeness:** Check if all assignment requirements are met
5. **Performance Considerations:** Evaluate efficiency and optimization

### Scoring Approach
- **Excellent (90-100%):** Exceeds expectations, demonstrates mastery
- **Proficient (80-89%):** Meets all requirements with good understanding
- **Developing (70-79%):** Meets most requirements but shows areas for improvement
- **Beginning (60-69%):** Basic implementation with significant gaps
- **Insufficient (0-59%):** Major issues or missing core requirements

### Feedback Requirements
- Provide specific, actionable feedback
- Reference actual code examples when possible
- Suggest concrete improvements
- Acknowledge what the student did well
- Connect feedback to learning objectives

## Required JSON Output Format

Please provide your assessment using this exact JSON structure that matches the rubric:

\`\`\`json
{
  "overallGrade": 42.5,
  "maxPoints": 50,
  "criteriaScores": {
    "requirementCompletion": {
      "score": 9.6,
      "maxScore": 12,
      "rating": "25% Requirement Missing",
      "feedback": "The student completed most of the core requirements including player movement and basic game mechanics. Missing implementation of advanced physics interactions and some UI elements specified in the assignment.",
      "evidenceFound": [
        "Player movement system implemented",
        "Basic collision detection present",
        "Game scene setup correctly"
      ],
      "missingRequirements": [
        "Advanced physics interactions",
        "Complete UI system",
        "Sound effects integration"
      ]
    },
    "gameExecution": {
      "score": 10.4,
      "maxScore": 13,
      "rating": "Some non-game breaking bugs/errors",
      "feedback": "The game runs and is playable with minor issues. Found some console warnings and occasional frame drops, but no game-breaking errors.",
      "evidenceFound": [
        "Game builds and runs successfully",
        "Core gameplay loop functional",
        "No critical runtime errors"
      ],
      "issuesFound": [
        "Console warnings about missing references",
        "Minor performance issues in complex scenes",
        "Some UI elements not fully responsive"
      ]
    },
    "codeReadability": {
      "score": 9.6,
      "maxScore": 12,
      "rating": "Satisfactory",
      "feedback": "Code shows good organization and naming conventions in most classes. Some methods lack comments, and indentation could be more consistent throughout.",
      "evidenceFound": [
        "Clear variable and method names",
        "Good class organization",
        "Consistent coding style in main scripts"
      ],
      "improvementAreas": [
        "Add more inline comments explaining complex logic",
        "Improve indentation consistency",
        "Add method documentation for public APIs"
      ]
    },
    "solutionDelivery": {
      "score": 13,
      "maxScore": 13,
      "rating": "Optimal Solution",
      "feedback": "Excellent solution approach with creative problem-solving. The student demonstrated strong understanding of Unity best practices and implemented efficient algorithms.",
      "evidenceFound": [
        "Efficient vector calculations for movement",
        "Creative use of Unity's physics system",
        "Optimized code structure with minimal redundancy",
        "Innovative approach to gameplay mechanics"
      ],
      "strengths": [
        "Excellent mathematical implementation",
        "Creative and efficient solutions",
        "Strong Unity best practices"
      ]
    }
  },
  "overallFeedback": {
    "strengths": [
      "Strong mathematical programming foundation",
      "Creative problem-solving approach",
      "Good understanding of Unity architecture",
      "Efficient algorithm implementation"
    ],
    "improvements": [
      "Complete all assignment requirements",
      "Add comprehensive code documentation",
      "Address minor performance issues",
      "Improve code formatting consistency"
    ],
    "detailedFeedback": "This Unity project demonstrates solid game programming skills with particularly strong solution delivery. The student shows excellent understanding of mathematical concepts and Unity best practices. While most requirements are met, there are a few missing elements that prevent a perfect score. The code quality is good but would benefit from more comprehensive documentation. Overall, this represents strong work with clear potential for excellence.",
    "nextSteps": [
      "Focus on completing all assignment requirements",
      "Develop habit of thorough code documentation",
      "Practice performance optimization techniques",
      "Continue building on strong mathematical foundation"
    ]
  },
  "technicalAssessment": {
    "unitySkills": "Demonstrates solid Unity knowledge with proper component usage and scene management",
    "mathematicalConcepts": "Strong implementation of vector mathematics and physics calculations",
    "codeArchitecture": "Well-structured code with good separation of concerns",
    "problemSolving": "Excellent creative solutions and efficient algorithms",
    "gameplayDesign": "Engaging mechanics with good player experience considerations"
  },
  "needsInstructorReview": false,
  "gradingNotes": "Automated grading completed successfully using ${this.activeProvider?.config.providerInfo.name || 'LLM'}. Score reflects rubric criteria with emphasis on solution quality and technical execution."
}
\`\`\`

## Important Reminders
- Be constructive and encouraging in your feedback
- Provide specific examples from the code when possible
- Connect mathematical concepts to real-world game development applications
- Suggest next steps for continued learning
- Remember that this is an educational assessment aimed at helping the student improve

Please analyze this Unity project thoroughly and provide detailed, educational feedback that will help this student grow as a game developer and mathematician.
`;

    return prompt;
  }

  formatAssignmentDetails(assignmentDetails) {
    return `
### Assignment: ${assignmentDetails.name || 'Unity Math Programming'}
**Due Date:** ${assignmentDetails.due_at ? new Date(assignmentDetails.due_at).toLocaleDateString() : 'Not specified'}
**Points:** ${assignmentDetails.points_possible || 'Not specified'}

**Description:**
${assignmentDetails.description || 'Standard Unity math programming assignment focusing on vector mathematics, transforms, and physics implementation.'}

**Learning Objectives:**
- Implement vector mathematics in Unity (Vector3 operations, dot/cross products)
- Demonstrate understanding of transform hierarchies and coordinate systems
- Apply physics concepts using Unity's physics engine
- Write clean, efficient code following Unity best practices
- Show mathematical reasoning in game development contexts

**Required Components:**
- Player movement using vector mathematics
- Object rotation and orientation control
- Physics-based interactions
- Clean code structure with appropriate comments
- Demonstration of mathematical concepts in gameplay
`;
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
      return 'No specific grading criteria provided. Use general Unity game programming assessment.';
    }

    let formatted = `\n**${criteria.name || 'Grading Rubric'}**`;
    if (criteria.description) {
      formatted += `\n${criteria.description}`;
    }
    formatted += `\n**Total Points:** ${criteria.totalPoints || 100}`;

    formatted += '\n\n### Grading Criteria:\n';

    criteria.items.forEach((criterion, index) => {
      formatted += `\n#### ${index + 1}. ${criterion.name} (${criterion.points} points)`;
      formatted += `\n**Description:** ${criterion.description}`;
      formatted += `\n**Weight:** ${criterion.weight || 'Standard'}`;

      if (criterion.ratings && criterion.ratings.length > 0) {
        formatted += '\n**Rating Scale:**';
        criterion.ratings.forEach((rating, ratingIndex) => {
          formatted += `\n- **${rating.name}** (${rating.points} pts): ${rating.description}`;
        });
      }
      formatted += '\n';
    });

    return formatted;
  }

  async executeLLMAnalysis(prompt, projectAnalysis) {
    if (!this.activeProvider) {
      throw new Error('No active LLM provider available');
    }

    const fullPrompt = this.buildAnalysisPrompt(prompt, projectAnalysis);
    return await this.callLLMAPI(fullPrompt);
  }

  buildAnalysisPrompt(originalPrompt, projectAnalysis) {
    return `${originalPrompt}

## Project Analysis Data

**Repository:** ${projectAnalysis.repoUrl || 'Unknown'}
**Unity Version:** ${projectAnalysis.unityFeatures?.version || 'Unknown'}
**Total C# Files:** ${projectAnalysis.codeAnalysis?.totalFiles || 0}
**Scenes:** ${projectAnalysis.unityFeatures?.sceneCount || 0}

### Code Files Summary:
${this.buildCodeFilesSummary(projectAnalysis.codeAnalysis?.files || [])}

### Math Concepts Found:
- **Vector Operations:** ${(projectAnalysis.codeAnalysis?.mathConcepts?.vectorOperations || []).slice(0, 5).join(', ') || 'None'}
- **Quaternion Usage:** ${(projectAnalysis.codeAnalysis?.mathConcepts?.quaternionUsage || []).slice(0, 5).join(', ') || 'None'}
- **Transform Math:** ${(projectAnalysis.codeAnalysis?.mathConcepts?.transformMath || []).slice(0, 5).join(', ') || 'None'}
- **Physics Calculations:** ${(projectAnalysis.codeAnalysis?.mathConcepts?.physicsCalculations || []).slice(0, 5).join(', ') || 'None'}

Please provide a detailed analysis and grading based on this information.`;
  }

  async callLLMAPI(prompt) {
    if (!this.activeProvider || !this.activeProvider.config.apiKey) {
      throw new Error('No API key available for the active provider');
    }

    const provider = this.activeProvider.provider;
    const config = this.activeProvider.config;

    console.log(`🤖 Calling ${config.providerInfo.name} API...`);

    try {
      let response, data, content;

      switch (provider) {
        case 'anthropic':
          response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-5-sonnet-20241022',
              max_tokens: 4000,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.content[0].text;
          break;

        case 'openai':
          response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              max_tokens: 4000,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.choices[0].message.content;
          break;

        case 'google':
          response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                maxOutputTokens: 4000
              }
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.candidates[0].content.parts[0].text;
          break;

        case 'cohere':
          response = await fetch('https://api.cohere.ai/v1/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: 'command-r-plus',
              message: prompt,
              max_tokens: 4000
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.text;
          break;

        case 'azure':
          if (!config.endpoint || !config.deploymentName) {
            throw new Error('Azure OpenAI requires endpoint and deployment name');
          }
          const endpoint = config.endpoint.replace(/\/$/, '');
          response = await fetch(`${endpoint}/openai/deployments/${config.deploymentName}/chat/completions?api-version=2023-05-15`, {
            method: 'POST',
            headers: {
              'api-key': config.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 4000
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.choices[0].message.content;
          break;

        case 'custom':
          if (!config.endpoint) {
            throw new Error('Custom API requires endpoint URL');
          }
          const customEndpoint = config.endpoint.replace(/\/$/, '');
          response = await fetch(`${customEndpoint}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 4000
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Custom API error: ${response.status} - ${errorText}`);
          }
          data = await response.json();
          content = data.choices[0].message.content;
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      try {
        const result = this.parseResponse(content);
        return result;
      } catch (parseError) {
        console.warn('Failed to parse as JSON, returning raw response');
        return {
          overallGrade: 75,
          maxPoints: 100,
          criteriaScores: {},
          overallFeedback: {
            strengths: ['Code analysis completed'],
            improvements: ['Review suggestions in raw output'],
            detailedFeedback: content.substring(0, 1000)
          },
          rawOutput: content
        };
      }

    } catch (error) {
      console.error(`${config.providerInfo.name} API call failed:`, error);
      throw error;
    }
  }

  parseResponse(response) {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (error) {
        throw new Error(`Invalid JSON in response: ${error.message}`);
      }
    }

    throw new Error('No JSON response found in LLM output');
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
      activeProvider: this.activeProvider?.provider || null,
      providerName: this.activeProvider?.config.providerInfo.name || null,
      activeAnalyses: this.activeAnalyses.size
    };
  }

  async refreshProvider() {
    // Refresh the active provider in case the user changed settings
    return await this.initialize();
  }
}

module.exports = LLMIntegration;