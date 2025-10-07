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
      console.log('\n========================================');
      console.log('🔧 INITIALIZING LLM INTEGRATION');
      console.log('========================================');

      const activeProvider = await this.apiKeyManager.getActiveProvider();

      console.log('📦 Active Provider Result:', activeProvider ? 'Found' : 'NULL');

      if (activeProvider) {
        this.activeProvider = activeProvider;
        this.isAvailable = true;

        console.log('✅ LLM integration initialized successfully');
        console.log(`   Provider: ${activeProvider.provider}`);
        console.log(`   Provider Name: ${activeProvider.config.providerInfo?.name || 'Unknown'}`);
        console.log(`   API Key Present: ${!!activeProvider.config.apiKey}`);
        console.log(`   API Key Length: ${activeProvider.config.apiKey ? activeProvider.config.apiKey.length : 0}`);
        console.log(`   API Key Preview: ${activeProvider.config.apiKey ? '***' + activeProvider.config.apiKey.slice(-4) : 'N/A'}`);
        console.log(`   API Key First 10 chars: ${activeProvider.config.apiKey ? activeProvider.config.apiKey.substring(0, 10) + '...' : 'N/A'}`);
        console.log(`   Is Active: ${activeProvider.config.isActive}`);
        console.log(`   Created At: ${activeProvider.config.createdAt || 'Unknown'}`);
        console.log(`   Last Used: ${activeProvider.config.lastUsed || 'Never'}`);
        console.log('========================================\n');
      } else {
        console.log('⚠️ No active LLM provider found. Please configure an API key in Settings.');
        console.log('========================================\n');
        this.isAvailable = false;
      }

      return this.isAvailable;
    } catch (error) {
      console.error('❌ LLM integration initialization failed:', error);
      console.error('   Stack:', error.stack);
      console.log('========================================\n');
      this.isAvailable = false;
      return false;
    }
  }

  async analyzeUnityProject(projectAnalysis, gradingCriteria, assignmentDetails = null) {
    console.log('\n========================================');
    console.log('📊 ANALYZING UNITY PROJECT');
    console.log('========================================');

    // Refresh provider to ensure we have the latest API key
    await this.initialize();

    if (!this.isAvailable) {
      throw new Error('No LLM provider is available. Please configure an API key in Settings.');
    }

    console.log('✅ LLM provider is available');
    console.log('\n📋 GRADING CRITERIA VALIDATION:');
    console.log('   Criteria Name:', gradingCriteria?.name || 'Not specified');
    console.log('   Total Points:', gradingCriteria?.totalPoints || 'Not specified');
    console.log('   Number of Items:', gradingCriteria?.items?.length || 0);

    if (gradingCriteria?.items) {
      console.log('   Criteria Items:');
      gradingCriteria.items.forEach((item, idx) => {
        console.log(`     ${idx + 1}. ${item.name || item.id} - ${item.points} points`);
      });

      const calculatedTotal = gradingCriteria.items.reduce((sum, item) => sum + (item.points || 0), 0);
      console.log(`   Calculated Total from Items: ${calculatedTotal}`);

      if (gradingCriteria.totalPoints && calculatedTotal !== gradingCriteria.totalPoints) {
        console.warn(`⚠️ WARNING: totalPoints (${gradingCriteria.totalPoints}) doesn't match sum of items (${calculatedTotal})`);
      }
    }

    console.log('\n📝 Assignment Details:');
    console.log('   Name:', assignmentDetails?.name || 'Not specified');
    console.log('   Points Possible:', assignmentDetails?.points_possible || 'Not specified');
    console.log('   Due Date:', assignmentDetails?.due_at || 'Not specified');
    console.log('========================================\n');

    const analysisId = this.generateAnalysisId();
    const prompt = this.buildGradingPrompt(projectAnalysis, gradingCriteria, assignmentDetails);

    console.log('📤 Prompt Generated:');
    console.log(`   Length: ${prompt.length} characters`);
    console.log(`   Contains criteria: ${prompt.includes('Grading Criteria')}`);
    console.log(`   Contains max points warning: ${prompt.includes('CRITICAL')}`);

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

**CRITICAL:** You MUST follow the exact criteria structure provided above. Your response must include ALL criteria listed in the rubric, use the exact criterion IDs as keys, and respect the maximum points for each criterion and the total.

Please provide your assessment using this exact JSON structure:

\`\`\`json
{
  "overallGrade": <number between 0 and ${criteria.totalPoints || 100}>,
  "maxPoints": ${criteria.totalPoints || 100},
  "criteriaScores": {
${this.buildExampleCriteriaScores(criteria)}
  },
  "overallFeedback": {
    "strengths": [
      "List specific strengths found in the code",
      "Reference actual implementations",
      "Highlight mathematical concepts demonstrated"
    ],
    "improvements": [
      "List specific areas for improvement",
      "Provide actionable suggestions",
      "Connect to rubric criteria"
    ],
    "detailedFeedback": "Comprehensive paragraph summarizing the overall assessment, connecting code quality to learning objectives and rubric criteria.",
    "nextSteps": [
      "Concrete next steps for the student",
      "Focus on highest-impact improvements",
      "Connect to course learning goals"
    ]
  },
  "technicalAssessment": {
    "unitySkills": "Assessment of Unity knowledge and proper API usage",
    "mathematicalConcepts": "Evaluation of mathematical understanding and implementation",
    "codeArchitecture": "Analysis of code structure and organization",
    "problemSolving": "Assessment of problem-solving approach and creativity",
    "gameplayDesign": "Evaluation of gameplay mechanics and user experience"
  },
  "needsInstructorReview": false,
  "gradingNotes": "Notes about the grading process, any concerns, or highlights for instructor review"
}
\`\`\`

**IMPORTANT SCORING RULES:**
1. The sum of all criterion scores MUST NOT exceed the maxPoints (${criteria.totalPoints || 100})
2. Each criterion score MUST NOT exceed its individual maxScore
3. Use the exact criterion IDs from the rubric as keys in criteriaScores
4. Provide detailed, evidence-based feedback for each criterion
5. Be fair but thorough in your assessment

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

  buildExampleCriteriaScores(criteria) {
    if (!criteria || !criteria.items || criteria.items.length === 0) {
      return `    "example-criterion": {
      "score": 0,
      "maxScore": 100,
      "feedback": "Detailed feedback here",
      "evidenceFound": ["Evidence 1", "Evidence 2"],
      "improvementAreas": ["Area 1", "Area 2"]
    }`;
    }

    const examples = criteria.items.slice(0, 2).map((criterion, index) => {
      const exampleScore = Math.round(criterion.points * 0.8 * 10) / 10; // 80% as example
      return `    "${criterion.id}": {
      "score": ${exampleScore},
      "maxScore": ${criterion.points},
      "feedback": "Detailed assessment of ${criterion.name}. Reference specific code examples and explain how well the student met this criterion.",
      "evidenceFound": [
        "Specific code example or pattern found",
        "Another piece of evidence",
        "Third example if applicable"
      ],
      "improvementAreas": [
        "Specific suggestion for improvement",
        "Another actionable recommendation"
      ]
    }`;
    }).join(',\n');

    if (criteria.items.length > 2) {
      return examples + `,
    ... (include ALL ${criteria.items.length} criteria from the rubric with IDs: ${criteria.items.map(c => c.id).join(', ')})`;
    }

    return examples;
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

    // Calculate total points from items if not explicitly set
    const totalPoints = criteria.totalPoints || criteria.items.reduce((sum, item) => sum + (item.points || 0), 0);
    criteria.totalPoints = totalPoints; // Ensure it's set for later use

    let formatted = `\n**${criteria.name || 'Grading Rubric'}**`;
    if (criteria.description) {
      formatted += `\n${criteria.description}`;
    }
    formatted += `\n**Total Points Available: ${totalPoints}**`;
    formatted += `\n\n**⚠️ CRITICAL:** The maximum possible score is ${totalPoints} points. Individual scores must sum to AT MOST ${totalPoints}.`;

    formatted += '\n\n### Grading Criteria:\n';

    criteria.items.forEach((criterion, index) => {
      const criterionId = criterion.id || `criterion-${index + 1}`;

      if (!criterion.id) {
        console.warn(`⚠️ WARNING: Criterion "${criterion.name}" has no ID! Using generated ID: ${criterionId}`);
        criterion.id = criterionId; // Set it for later use
      }

      formatted += `\n#### ${index + 1}. ${criterion.name} - ID: "${criterionId}" (MAX: ${criterion.points} points)`;
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

    const criterionIds = criteria.items.map(c => c.id || 'undefined').join(', ');
    formatted += `\n\n**MANDATORY REQUIREMENT:** Your JSON response MUST use these exact criterion IDs as keys: ${criteria.items.map(c => `"${c.id}"`).join(', ')}`;

    console.log('📋 Criterion IDs being sent to LLM:', criterionIds);

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
    console.log('\n========================================');
    console.log('🚀 CALLING LLM API');
    console.log('========================================');

    if (!this.activeProvider || !this.activeProvider.config.apiKey) {
      console.error('❌ No API key available!');
      console.log('   activeProvider:', this.activeProvider);
      console.log('========================================\n');
      throw new Error('No API key available for the active provider');
    }

    const provider = this.activeProvider.provider;
    const config = this.activeProvider.config;
    const apiKey = config.apiKey;

    console.log(`🤖 Provider: ${config.providerInfo?.name || provider}`);
    console.log(`   Provider Type: ${provider}`);
    console.log(`   API Key Present: ${!!apiKey}`);
    console.log(`   API Key Length: ${apiKey ? apiKey.length : 0} characters`);
    console.log(`   API Key First 10: ${apiKey ? apiKey.substring(0, 10) : 'N/A'}...`);
    console.log(`   API Key Last 4: ***${apiKey ? apiKey.slice(-4) : 'N/A'}`);
    console.log(`   API Key Format Check:`);
    console.log(`     - Starts with 'sk-': ${apiKey ? apiKey.startsWith('sk-') : false}`);
    console.log(`     - Starts with 'sk-ant-': ${apiKey ? apiKey.startsWith('sk-ant-') : false}`);
    console.log(`     - Contains spaces: ${apiKey ? apiKey.includes(' ') : false}`);
    console.log(`     - Contains newlines: ${apiKey ? apiKey.includes('\n') : false}`);
    console.log(`     - Trimmed length: ${apiKey ? apiKey.trim().length : 0}`);
    console.log(`   Key Source: ${config.lastUsed ? 'Stored in app' : 'From .env file'}`);
    console.log(`   Created At: ${config.createdAt || 'Unknown'}`);
    console.log(`   Last Used: ${config.lastUsed || 'Never'}`);
    console.log('========================================');

    // Validate API key is not empty or whitespace
    if (!apiKey || apiKey.trim() === '') {
      console.error('❌ API key is empty or contains only whitespace!');
      console.log('========================================\n');
      throw new Error('API key is empty or invalid');
    }

    // Additional validation
    if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      console.warn('⚠️ Warning: Anthropic API key should start with "sk-ant-"');
      console.log(`   Current key starts with: ${apiKey.substring(0, 10)}...`);
    }

    try {
      console.log('📡 Making API request...');
      let response, data, content;

      switch (provider) {
        case 'anthropic':
          console.log('📤 Sending request to Anthropic API...');
          console.log(`   URL: https://api.anthropic.com/v1/messages`);
          console.log(`   Headers:`);
          console.log(`     Content-Type: application/json`);
          console.log(`     x-api-key: ${config.apiKey.substring(0, 10)}...${config.apiKey.slice(-4)}`);
          console.log(`     anthropic-version: 2023-06-01`);
          console.log(`   Model: claude-3-5-sonnet-20241022`);
          console.log(`   Max Tokens: 4000`);

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

          console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
          console.log(`   OK: ${response.ok}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:');
            console.error(`   Status: ${response.status}`);
            console.error(`   Status Text: ${response.statusText}`);
            console.error(`   Error Body: ${errorText}`);

            // Parse error body for more details
            let errorDetails = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorDetails = errorJson.error?.message || errorJson.message || errorText;
              console.error(`   Parsed Error: ${errorDetails}`);
            } catch (e) {
              // Error body is not JSON, use as-is
            }

            // Check for authentication issues
            if (response.status === 401) {
              console.error('   🔑 AUTHENTICATION ERROR: The API key is invalid or has expired');
              console.error('   👉 Please go to Settings and update your API key');
            }

            console.log('========================================\n');
            throw new Error(`Anthropic API error (${response.status}): ${errorDetails}`);
          }

          data = await response.json();
          content = data.content[0].text;
          console.log('✅ API call successful');
          console.log(`   Response length: ${content.length} characters`);
          console.log('========================================\n');
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
      console.error(`${config.providerInfo?.name || 'LLM'} API call failed:`, error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        code: error.code,
        cause: error.cause
      });
      console.log('========================================\n');

      // Enhance error message for common API issues
      let enhancedMessage = error.message;

      if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        enhancedMessage = 'Network error: Unable to reach the API server. Please check your internet connection.';
      } else if (error.message.includes('401') || error.message.includes('authentication') || error.message.includes('invalid_api_key')) {
        enhancedMessage = 'Authentication failed: Your API key is invalid or expired. Please update your API key in Settings.';
      } else if (error.message.includes('403') || error.message.includes('permission')) {
        enhancedMessage = 'Permission denied: Your API key does not have access to this resource.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        enhancedMessage = 'Rate limit exceeded: Too many requests. Please wait a few moments and try again.';
      } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
        enhancedMessage = `API server error: The ${config.providerInfo?.name || 'LLM'} service is currently unavailable. Please try again later.`;
      } else if (error.message.includes('timeout')) {
        enhancedMessage = 'Request timeout: The API took too long to respond. Please try again.';
      }

      const enhancedError = new Error(enhancedMessage);
      enhancedError.originalError = error;
      enhancedError.provider = provider;
      throw enhancedError;
    }
  }

  parseResponse(response) {
    console.log('\n========================================');
    console.log('🔍 PARSING LLM RESPONSE');
    console.log('========================================');
    console.log('Response length:', response.length);
    console.log('Response preview (first 500 chars):', response.substring(0, 500));

    // Try to find JSON in markdown code blocks first
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

    let jsonText = null;
    if (jsonMatch) {
      console.log('✅ Found JSON in markdown code blocks');
      jsonText = jsonMatch[1];
    } else {
      console.log('⚠️ No markdown code blocks found, trying to parse response as raw JSON');
      // Try to parse the whole response as JSON
      jsonText = response.trim();
    }

    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);

        console.log('📊 Raw LLM Response:');
        console.log(`   Overall Grade: ${parsed.overallGrade}`);
        console.log(`   Max Points: ${parsed.maxPoints}`);
        console.log(`   Criteria Count: ${parsed.criteriaScores ? Object.keys(parsed.criteriaScores).length : 0}`);

        // Validate and cap scores to prevent exceeding maximums
        if (parsed.criteriaScores) {
          console.log('\n🔧 Validating Individual Criteria Scores:');
          let hadErrors = false;

          for (const [criterionId, criterionData] of Object.entries(parsed.criteriaScores)) {
            console.log(`   ${criterionId}: ${criterionData.score}/${criterionData.maxScore}`);

            if (criterionData.score > criterionData.maxScore) {
              console.warn(`   ⚠️ CAPPING: ${criterionData.score} → ${criterionData.maxScore}`);
              criterionData.score = criterionData.maxScore;
              hadErrors = true;
            }
          }

          // Recalculate overall grade from criteria scores
          const calculatedTotal = Object.values(parsed.criteriaScores)
            .reduce((sum, criterion) => sum + (criterion.score || 0), 0);

          console.log(`\n📈 Score Validation:`);
          console.log(`   Calculated Total: ${calculatedTotal}`);
          console.log(`   LLM Overall Grade: ${parsed.overallGrade}`);
          console.log(`   Max Points Allowed: ${parsed.maxPoints}`);
          console.log(`   Difference: ${Math.abs(parsed.overallGrade - calculatedTotal)}`);

          if (parsed.overallGrade > parsed.maxPoints) {
            console.warn(`   ⚠️ CAPPING OVERALL: Overall grade (${parsed.overallGrade}) exceeds max (${parsed.maxPoints})`);
            console.warn(`   → Setting to: ${Math.min(calculatedTotal, parsed.maxPoints)}`);
            parsed.overallGrade = Math.min(calculatedTotal, parsed.maxPoints);
            hadErrors = true;
          }

          // Ensure overall grade matches sum of criteria scores (within rounding tolerance)
          if (Math.abs(parsed.overallGrade - calculatedTotal) > 0.5) {
            console.warn(`   ⚠️ MISMATCH: Overall grade (${parsed.overallGrade}) ≠ sum of criteria (${calculatedTotal})`);
            console.warn(`   → Setting to: ${Math.min(calculatedTotal, parsed.maxPoints)}`);
            parsed.overallGrade = Math.min(calculatedTotal, parsed.maxPoints);
            hadErrors = true;
          }

          if (hadErrors) {
            console.log('\n✅ Corrections Applied:');
          } else {
            console.log('\n✅ All scores valid, no corrections needed');
          }

          console.log(`   Final Overall Grade: ${parsed.overallGrade}/${parsed.maxPoints}`);
        }

        console.log('========================================\n');
        return parsed;
      } catch (error) {
        console.error('❌ JSON Parse Error:', error.message);
        console.log('========================================\n');
        throw new Error(`Invalid JSON in response: ${error.message}`);
      }
    }

    console.error('❌ No JSON found in response');
    console.log('   Response preview:', response.substring(0, 200));
    console.log('========================================\n');
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