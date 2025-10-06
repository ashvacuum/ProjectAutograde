# AraLaro - Complete User Manual

## Table of Contents
1. [Overview](#overview)
2. [Installation & Setup](#installation--setup)
3. [Getting Started](#getting-started)
4. [Using the Application](#using-the-application)
5. [Grading Workflow](#grading-workflow)
6. [Function Reference](#function-reference)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Features](#advanced-features)

## Overview

AraLaro is a desktop application that automates the grading of Unity game development assignments submitted through Canvas LMS. The application features:

- **Automated Repository Analysis**: Clones GitHub repositories and analyzes Unity C# code
- **Claude Code Integration**: Uses Claude Code for intelligent code assessment
- **Canvas LMS Integration**: Fetches assignments and posts grades automatically
- **Comprehensive Reporting**: Exports results in multiple formats (CSV, JSON, PDF)
- **Modern UI**: Discord-like interface with real-time progress tracking

## Installation & Setup

### Prerequisites
- **Windows 10/11** (Primary platform)
- **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/)
- **Git** - [Download from git-scm.com](https://git-scm.com/)
- **Claude Desktop App** - Required for AI grading functionality
- **Canvas LMS Access** - Admin or instructor account with API token

### Quick Installation

1. **Download the Application**
   ```bash
   git clone https://github.com/ashvacuum/ProjectAutograde.git
   cd ProjectAutograde
   ```

2. **Install Dependencies & Build**
   ```bash
   # Run the automated build script
   build-windows.bat
   ```
   This script will:
   - Install all Node.js dependencies
   - Build the Windows executable
   - Create an installer in the `dist` folder

3. **Initial Configuration**
   ```bash
   # Copy environment template
   copy .env.example .env

   # Edit .env with your settings
   notepad .env
   ```

### Manual Installation

If the automated script fails:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build for Development**
   ```bash
   npm start
   ```

3. **Build for Production**
   ```bash
   npm run build-win
   ```

## Getting Started

### First Launch Setup

1. **Launch the Application**
   - Run the installer from the `dist` folder, or
   - Use `npm start` for development mode

2. **Canvas Setup** (Required)
   - Navigate to "Canvas Setup" in the sidebar
   - Enter your Canvas API URL: `https://your-school.instructure.com/api/v1`
   - Enter your Canvas API token (see [Getting Canvas Token](#getting-canvas-token))
   - Click "Connect to Canvas"

3. **Claude Code Verification**
   - Check the Dashboard for Claude Code status
   - Ensure Claude Desktop is installed and accessible
   - If not available, some grading features will be limited

4. **Load Default Criteria**
   - Go to "Grading Criteria"
   - Click "Load Defaults" to add Unity math templates
   - Review and customize criteria as needed

### Getting Canvas Token

1. Log into your Canvas LMS
2. Go to **Account → Settings**
3. Scroll to **"Approved Integrations"**
4. Click **"+ New Access Token"**
5. Enter purpose: **"AraLaro"**
6. Copy the generated token
7. Paste into the application's Canvas Setup page

**Required Permissions:**
- Read course content
- Read and write grades
- Read user information
- Read assignment submissions

## Using the Application

### Navigation Overview

The application uses a Discord-like sidebar navigation:

- **📊 Dashboard** - System overview and status
- **🔗 Canvas Setup** - LMS connection configuration
- **📋 Grading Criteria** - Manage assessment templates
- **📚 Assignments** - View courses and assignments
- **⚡ Auto Grading** - Automated grading interface
- **📈 Results** - View and export grading results
- **⚙️ Settings** - Application configuration

### Dashboard

The Dashboard provides:
- **Connection Status** - Canvas and Claude Code availability
- **Recent Activity** - Grading history and system events
- **Quick Setup Links** - Direct access to configuration panels

### Canvas Setup

**Authentication Process:**
1. Enter Canvas API URL (format: `https://school.instructure.com/api/v1`)
2. Enter API token
3. Click "Connect to Canvas" or "Test Connection"
4. Verify connection shows user information

**Troubleshooting Connection:**
- Verify URL format (must end with `/api/v1`)
- Check token validity and permissions
- Ensure network connectivity
- Confirm Canvas instance allows API access

### Grading Criteria Management

**Default Templates:**
- **Unity Math Fundamentals** - Vector operations, quaternions, transforms
- **Code Quality Standards** - Organization, performance, naming conventions
- **Advanced Unity Concepts** - Matrices, procedural generation, optimization

**Creating Custom Criteria:**
1. Click "New Template"
2. Define criteria items with:
   - **Name** - Descriptive title
   - **Description** - Detailed explanation
   - **Points** - Maximum score
   - **Weight** - Importance level (low/medium/high)
   - **Keywords** - Detection patterns
   - **Examples** - Code samples

**Criteria Item Structure:**
```json
{
  "id": "vector-operations",
  "name": "Vector Mathematics",
  "description": "Proper use of Vector3/Vector2 operations",
  "points": 25,
  "weight": "high",
  "keywords": ["Vector3", "Vector2", "Dot", "Cross"],
  "examples": ["Vector3.Dot(a, b)", "direction.normalized"]
}
```

### Assignments Management

**Course Selection:**
1. Ensure Canvas connection is active
2. Select course from dropdown
3. View available assignments

**Assignment Filtering:**
- Only shows assignments with URL/text submission types
- Filters for assignments likely to contain GitHub links
- Displays due dates and submission counts

**Submission Review:**
- Click "View" to see submission details
- GitHub URLs are automatically extracted
- Shows submission status and timestamps

## Grading Workflow

### Automated Grading Process

The application follows this workflow for each submission:

1. **Repository Validation**
   - Validates GitHub URL format
   - Checks repository accessibility
   - **Immediate Fail**: Invalid/inaccessible repos get 0 score

2. **Repository Cloning** (Git Commands)
   - Uses native Git commands for cloning
   - Shallow clone (`--depth 1`) for efficiency
   - Automatic cleanup after analysis

3. **Unity Project Validation**
   - Checks for Assets and ProjectSettings folders
   - **Immediate Fail**: Non-Unity projects get 0 score
   - Warnings for missing scripts/scenes (continues processing)

4. **Code Analysis** (Local Processing)
   - Finds all C# scripts using Git commands
   - Analyzes code structure and patterns
   - Detects Unity-specific implementations
   - Identifies math concepts and best practices

5. **Claude Code Assessment** (AI Grading)
   - **Only if Claude Code is available**
   - Sends analysis context to Claude Code
   - Receives detailed grading and feedback
   - Fallback to basic analysis if unavailable

6. **Cleanup**
   - Deletes cloned repository
   - Preserves analysis results
   - Updates progress tracking

### Manual Grading Steps

1. **Select Assignment**
   - Navigate to "Assignments"
   - Choose course and assignment
   - Review submissions list

2. **Configure Criteria**
   - Go to "Grading Criteria"
   - Select appropriate template
   - Customize if needed

3. **Start Grading**
   - Navigate to "Auto Grading"
   - Verify Canvas connection and Claude Code status
   - Click "Start Batch Grading"

4. **Monitor Progress**
   - Watch real-time progress bar
   - See current student being processed
   - Option to cancel if needed

5. **Review Results**
   - Navigate to "Results" when complete
   - Review individual grades and feedback
   - Export results as needed

### Batch Grading Features

**Progress Tracking:**
- Real-time progress bar
- Current student indicator
- Completion percentage
- Time estimates

**Error Handling:**
- Invalid repositories: Immediate 0 score
- Network issues: Retry with timeout
- Analysis failures: Partial credit based on available data
- Claude Code unavailable: Basic analysis fallback

**Result Generation:**
- Overall grade (0-100)
- Criteria-specific scores
- Detailed feedback
- Strengths and improvement areas
- Code quality assessment

## Function Reference

### Core Classes

#### UnityGrader
**Purpose**: Main grading engine that orchestrates the analysis process

**Key Methods:**
- `analyzeProject(repoUrl, criteria)` - Main analysis function
- `createFailedAnalysis(repoUrl, error, score)` - Generates failed result
- `findCSharpFiles(projectPath)` - Locates C# scripts
- `analyzeProjectStructure(projectPath)` - Examines Unity project layout
- `analyzeCSharpCode(files)` - Analyzes code patterns and quality
- `cleanup(projectPath)` - Removes temporary files

**Workflow:**
```javascript
const grader = new UnityGrader();
const result = await grader.analyzeProject(
  'https://github.com/user/repo.git',
  criteria
);
```

#### GitCommands
**Purpose**: Handles all Git operations using native Git commands

**Key Methods:**
- `checkRepositoryExists(repoUrl)` - Validates repository before cloning
- `cloneRepository(repoUrl, options)` - Clones repository with Git commands
- `validateUnityProject(projectPath)` - Checks Unity project structure
- `findCSharpFiles(projectPath)` - Uses Git to find C# files
- `deleteDirectory(dirPath)` - Safe cleanup of temporary directories

**Usage:**
```javascript
const git = new GitCommands();
const repoCheck = await git.checkRepositoryExists(url);
if (repoCheck.exists) {
  const cloneResult = await git.cloneRepository(url);
}
```

#### CanvasAPI
**Purpose**: Integrates with Canvas LMS for fetching assignments and posting grades

**Key Methods:**
- `authenticate(apiUrl, token)` - Establishes Canvas connection
- `getCourses()` - Retrieves instructor courses
- `getAssignments(courseId)` - Gets course assignments
- `getSubmissions(courseId, assignmentId)` - Fetches student submissions
- `postGrade(courseId, assignmentId, userId, grade, comment)` - Posts grades

#### ClaudeCodeIntegration
**Purpose**: Integrates with Claude Code for AI-powered grading

**Key Methods:**
- `initialize()` - Checks Claude Code availability
- `analyzeUnityProject(analysis, criteria)` - Sends analysis to Claude Code
- `buildGradingPrompt(analysis, criteria)` - Creates structured prompt
- `parseClaudeCodeResponse(response)` - Extracts grading results

#### CriteriaManager
**Purpose**: Manages grading criteria templates and validation

**Key Methods:**
- `createTemplate(name, description, items)` - Creates new criteria
- `updateTemplate(id, updates)` - Modifies existing criteria
- `validateCriteria(criteria)` - Validates criteria structure
- `generateGradingRubric(criteria)` - Creates grading rubric

#### ResultsExporter
**Purpose**: Exports grading results in multiple formats

**Key Methods:**
- `exportToCsv(results, filename)` - Exports to CSV format
- `exportToJson(results, filename)` - Exports to JSON format
- `exportToPdf(results, filename)` - Generates PDF reports
- `calculateStatistics(results)` - Computes grade statistics

### Error Handling Strategy

**Repository Validation Failures:**
```javascript
// Invalid URL format
if (!git.isValidGitHubUrl(url)) {
  return createFailedAnalysis(url, 'Invalid GitHub URL format', 0);
}

// Repository not found
const repoCheck = await git.checkRepositoryExists(url);
if (!repoCheck.exists) {
  return createFailedAnalysis(url, repoCheck.error, 0);
}
```

**Unity Project Validation:**
```javascript
const validation = await git.validateUnityProject(path);
if (!validation.isValidUnityProject) {
  await cleanup(path);
  return createFailedAnalysis(url, 'Not a valid Unity project', 0);
}
```

**Claude Code Fallback:**
```javascript
if (await claudeCode.initialize()) {
  // Use Claude Code for grading
  const grade = await claudeCode.analyzeUnityProject(analysis, criteria);
} else {
  // Fallback to basic analysis
  console.warn('Claude Code unavailable - using basic analysis');
}
```

## Troubleshooting

### Common Issues and Solutions

#### Installation Problems

**"Node.js not found"**
- Download and install Node.js from [nodejs.org](https://nodejs.org/)
- Restart command prompt after installation
- Verify with `node --version`

**"Git not found"**
- Install Git from [git-scm.com](https://git-scm.com/)
- Ensure Git is added to system PATH
- Verify with `git --version`

**Build failures**
```bash
# Clear cache and reinstall
rmdir /s node_modules
del package-lock.json
npm install
```

#### Canvas Connection Issues

**Authentication Failed**
- Verify API URL format: `https://school.instructure.com/api/v1`
- Check token permissions and expiration
- Ensure Canvas allows API access
- Test with Canvas API browser directly

**Courses Not Loading**
- Check instructor permissions
- Verify active enrollment in courses
- Look for network/firewall issues
- Check application logs for details

**Assignments Missing**
- Only URL/text submission types are shown
- Check assignment publication status
- Verify submission types in Canvas

#### Grading Problems

**Claude Code Not Available**
- Install Claude Desktop application
- Verify Claude Code in system PATH
- Check Settings panel for status
- Restart application after Claude Code installation

**Repository Clone Failures**
```
Error: Repository not found
- Verify repository URL is correct
- Check if repository is public
- For private repos, provide GitHub token
- Ensure network connectivity
```

**Invalid Unity Projects**
- Student submitted wrong repository
- Repository missing Unity project files
- Check for Assets and ProjectSettings folders
- Student may have submitted parent directory

**Grading Timeout**
```javascript
// Increase timeout in claude-code-integration.js
setTimeout(() => {
  process.kill();
  reject(new Error('Analysis timed out'));
}, 120000); // Increase from 60000 to 120000
```

#### Performance Issues

**Slow Grading**
- Large repositories take longer to clone
- Complex projects require more analysis time
- Network speed affects clone times
- Consider increasing timeouts for large classes

**Memory Issues**
- Close other applications during batch grading
- Restart application between large batches
- Monitor temp directory cleanup

#### Export Problems

**Export Failures**
- Check disk space in export directory
- Verify write permissions
- Ensure export directory exists
- Check for special characters in filenames

### Diagnostic Steps

1. **Check System Requirements**
   ```bash
   node --version    # Should be 18+
   git --version     # Should be present
   npm --version     # Should be present
   ```

2. **Verify File Structure**
   ```
   aralaro/
   ├── main.js                 ✓
   ├── preload.js             ✓
   ├── package.json           ✓
   ├── src/                   ✓
   └── node_modules/          ✓
   ```

3. **Test Canvas Connection**
   - Use Canvas Setup → Test Connection
   - Check browser network tab for API calls
   - Verify Canvas instance status

4. **Check Application Logs**
   - Press F12 to open Developer Tools
   - Check Console tab for errors
   - Look for network failures or permission issues

## Advanced Features

### Custom Criteria Development

**Creating Detection Patterns:**
```javascript
{
  "id": "custom-pattern",
  "name": "Custom Unity Pattern",
  "detectionPatterns": [
    "CustomClass\\.(Method|Property)",
    "\\bcustomKeyword\\b",
    "using\\s+CustomNamespace"
  ]
}
```

**Weighted Scoring:**
```javascript
{
  "items": [
    { "name": "Critical Feature", "points": 40, "weight": "high" },
    { "name": "Important Feature", "points": 30, "weight": "medium" },
    { "name": "Nice to Have", "points": 20, "weight": "low" }
  ]
}
```

### Batch Processing Configuration

**Large Class Optimization:**
```javascript
// In main.js, increase timeouts
const batchConfig = {
  maxConcurrentJobs: 3,      // Process 3 repos simultaneously
  timeoutPerRepo: 300000,    // 5 minutes per repository
  retryAttempts: 2,          // Retry failed repositories
  cleanupInterval: 600000    // Cleanup temp files every 10 minutes
};
```

### Integration Extensions

**Custom Export Formats:**
```javascript
// In results-exporter.js
async exportToCustomFormat(results, filename) {
  const customData = results.map(result => ({
    student: result.studentName,
    grade: result.overallGrade,
    customField: this.calculateCustomMetric(result)
  }));

  return await this.writeCustomFile(customData, filename);
}
```

**Webhook Integration:**
```javascript
// Post results to external system
async postToWebhook(results) {
  const webhook = process.env.RESULTS_WEBHOOK_URL;
  if (webhook) {
    await axios.post(webhook, {
      timestamp: new Date().toISOString(),
      results: results
    });
  }
}
```

### Development Mode

**Enable Development Features:**
```bash
# Set environment variable
set NODE_ENV=development

# Start in development mode
npm run dev
```

**Development Features:**
- Hot reload for UI changes
- Detailed console logging
- Developer tools open by default
- Mock data for testing
- Bypass some validation checks

### Security Considerations

**API Token Security:**
- Tokens are stored encrypted using electron-store
- Never commit tokens to version control
- Rotate tokens regularly
- Use read-only tokens when possible

**Repository Access:**
- Only clone repositories from trusted sources
- Automatic cleanup prevents code persistence
- No code execution, only analysis
- Sandboxed temporary directories

**Data Privacy:**
- Student data remains local unless explicitly exported
- No telemetry or data collection
- Canvas data cached temporarily only
- Manual data cleanup options available

---

## Support and Resources

**Documentation:**
- [Canvas API Documentation](https://canvas.instructure.com/doc/api/)
- [Unity Scripting Reference](https://docs.unity3d.com/ScriptReference/)
- [Electron Documentation](https://electronjs.org/docs)

**Community:**
- GitHub Issues: Report bugs and feature requests
- Discord Server: Real-time support and discussions
- Email Support: technical-support@example.com

**Version Information:**
- Current Version: 1.0.0
- Last Updated: 2024
- Compatibility: Windows 10/11, Node.js 18+

**License:**
MIT License - See LICENSE file for details.

---

*This manual covers the complete functionality of AraLaro. For specific implementation details, refer to the source code and inline documentation.*