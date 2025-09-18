# Unity Auto-Grader - Function Reference

## Core Architecture

The Unity Auto-Grader follows a modular architecture with clear separation of concerns:

```
Main Process (Electron)
├── IPC Handlers (main.js)
├── Canvas Integration (src/canvas/)
├── Grading Engine (src/grader/)
├── Criteria Management (src/criteria/)
├── Utilities (src/utils/)
└── Renderer Process (src/renderer/)
```

## Main Process (main.js)

### Window Management
```javascript
function createWindow()
```
- Creates the main Electron window
- Sets up security preferences (contextIsolation, nodeIntegration: false)
- Loads the renderer HTML file
- Configures development tools for debugging

### IPC Handlers
All IPC handlers follow the pattern: `ipcMain.handle('channel-name', async (event, ...args) => {})`

#### Store Operations
- `store-get(key)` - Retrieves stored data
- `store-set(key, value)` - Stores data securely
- `store-delete(key)` - Removes stored data

#### Dialog Operations
- `show-error-dialog(title, content)` - Shows error message
- `show-info-dialog(title, content)` - Shows information dialog
- `show-save-dialog(options)` - Opens save file dialog
- `show-open-dialog(options)` - Opens file selection dialog

#### Canvas API Operations
- `canvas-authenticate(apiUrl, token)` - Authenticates with Canvas
- `canvas-get-courses()` - Retrieves instructor courses
- `canvas-get-assignments(courseId)` - Gets assignments for course
- `canvas-get-submissions(courseId, assignmentId)` - Fetches submissions
- `canvas-post-grade(courseId, assignmentId, userId, grade, comment)` - Posts grades

#### Grading Operations
- `grader-analyze-project(repoUrl, criteria)` - Analyzes Unity project
- `grader-get-progress()` - Returns grading progress
- `grader-cancel()` - Cancels active grading

#### File Operations
- `files-read-file(filePath)` - Reads file content
- `files-write-file(filePath, content)` - Writes file content
- `files-delete-file(filePath)` - Deletes file
- `files-ensure-dir(dirPath)` - Creates directory if needed

#### Export Operations
- `export-to-csv(data, filename)` - Exports to CSV
- `export-to-json(data, filename)` - Exports to JSON
- `export-to-pdf(data, filename)` - Exports to PDF

## Canvas Integration

### CanvasAuth Class
**File**: `src/canvas/canvas-auth.js`

```javascript
class CanvasAuth {
  async authenticate(apiUrl, token)
  async loadStoredCredentials()
  clearCredentials()
  getStoredUser()
  getAPI()
  isValidUrl(url)
  isValidToken(token)
}
```

#### Methods Detail

**authenticate(apiUrl, token)**
- Validates Canvas API credentials
- Tests connection with test API call
- Stores credentials securely if successful
- Returns: `{success: boolean, user?: object, error?: string}`

**loadStoredCredentials()**
- Loads previously stored Canvas credentials
- Validates credentials are still active
- Expires credentials older than 30 days
- Returns: `{success: boolean, user?: object, error?: string}`

### CanvasAPI Class
**File**: `src/canvas/canvas-api.js`

```javascript
class CanvasAPI {
  authenticate(apiUrl, token)
  getCourses()
  getAssignments(courseId)
  getSubmissions(courseId, assignmentId)
  postGrade(courseId, assignmentId, userId, grade, comment)
  extractGithubUrl(text)
}
```

#### Methods Detail

**getCourses()**
- Fetches courses where user is enrolled as teacher
- Filters for active, available courses
- Returns: `{success: boolean, courses: array, error?: string}`

**getSubmissions(courseId, assignmentId)**
- Retrieves all submissions for assignment
- Filters for submitted entries with URLs or text
- Extracts GitHub URLs from submission content
- Returns: `{success: boolean, submissions: array, error?: string}`

**extractGithubUrl(text)**
- Uses regex to find GitHub URLs in text content
- Handles both submission.url and submission.body
- Returns first valid GitHub URL found

## Grading Engine

### UnityGrader Class
**File**: `src/grader/unity-grader.js`

```javascript
class UnityGrader {
  async analyzeProject(repoUrl, criteria)
  createFailedAnalysis(repoUrl, errorMessage, score)
  async findCSharpFiles(projectPath)
  async analyzeProjectStructure(projectPath)
  async analyzeCSharpCode(files)
  async analyzeUnitySpecifics(projectPath)
  async cleanup(projectPath)
}
```

#### Core Workflow

**analyzeProject(repoUrl, criteria)**
1. **Validation Phase**
   ```javascript
   // Validate GitHub URL format
   if (!this.gitCommands.isValidGitHubUrl(repoUrl)) {
     return this.createFailedAnalysis(repoUrl, 'Invalid GitHub URL format', 0);
   }

   // Check repository exists
   const repoCheck = await this.gitCommands.checkRepositoryExists(repoUrl);
   if (!repoCheck.exists) {
     return this.createFailedAnalysis(repoUrl, repoCheck.error, 0);
   }
   ```

2. **Cloning Phase**
   ```javascript
   // Clone using Git commands
   const cloneResult = await this.gitCommands.cloneRepository(repoUrl);
   this.currentProject = cloneResult.path;
   ```

3. **Unity Validation Phase**
   ```javascript
   // Validate Unity project structure
   const validation = await this.gitCommands.validateUnityProject(cloneResult.path);
   if (!validation.isValidUnityProject) {
     await this.cleanup(cloneResult.path);
     return this.createFailedAnalysis(repoUrl, 'Not a valid Unity project', 0);
   }
   ```

4. **Analysis Phase**
   ```javascript
   // Analyze project components
   const projectStructure = await this.analyzeProjectStructure(cloneResult.path);
   const csharpFiles = await this.findCSharpFiles(cloneResult.path);
   const codeAnalysis = await this.analyzeCSharpCode(csharpFiles);
   const unitySpecific = await this.analyzeUnitySpecifics(cloneResult.path);
   ```

5. **Cleanup Phase**
   ```javascript
   // Always cleanup temporary files
   await this.cleanup(cloneResult.path);
   ```

**analyzeCSharpCode(files)**
- Analyzes each C# file for:
  - MonoBehaviour patterns
  - Unity-specific APIs
  - Math concept usage
  - Code quality metrics
- Returns aggregated analysis with file-level details

### GitCommands Class
**File**: `src/utils/git-commands.js`

```javascript
class GitCommands {
  async checkRepositoryExists(repoUrl)
  async cloneRepository(repoUrl, options)
  async deleteDirectory(dirPath)
  async validateUnityProject(projectPath)
  async findCSharpFiles(projectPath)
  isValidGitHubUrl(url)
}
```

#### Key Features

**Repository Validation**
```javascript
async checkRepositoryExists(repoUrl) {
  // Uses git ls-remote to check without cloning
  const command = `git ls-remote --heads "${repoUrl}"`;
  await this.executeCommand(command);
  return { exists: true, accessible: true };
}
```

**Safe Cloning**
```javascript
async cloneRepository(repoUrl, options = {}) {
  // Shallow clone for efficiency
  let cloneCommand = `git clone --depth 1 --single-branch`;
  if (options.branch) {
    cloneCommand += ` --branch "${options.branch}"`;
  }
  cloneCommand += ` "${repoUrl}" "${projectDir}"`;
}
```

**Unity Project Validation**
```javascript
async validateUnityProject(projectPath) {
  // Check for required folders
  await fs.access(path.join(projectPath, 'Assets'));
  await fs.access(path.join(projectPath, 'ProjectSettings'));

  // Validate project structure
  return {
    isValidUnityProject: true,
    hasAssets: true,
    hasProjectSettings: true,
    hasScripts: await this.hasFilesWithExtension(projectPath, '.cs'),
    hasScenes: await this.hasFilesWithExtension(projectPath, '.unity')
  };
}
```

### ClaudeCodeIntegration Class
**File**: `src/grader/claude-code-integration.js`

```javascript
class ClaudeCodeIntegration {
  async initialize()
  async analyzeUnityProject(projectAnalysis, gradingCriteria)
  buildGradingPrompt(projectAnalysis, criteria)
  async executeClaudeCodeAnalysis(prompt, projectAnalysis)
  parseClaudeCodeResponse(response)
}
```

#### Integration Workflow

**buildGradingPrompt(projectAnalysis, criteria)**
Creates comprehensive prompt including:
- Project overview and statistics
- Code structure analysis
- Math concepts detected
- Grading criteria details
- Required JSON output format

**executeClaudeCodeAnalysis(prompt, projectAnalysis)**
1. Creates temporary files with analysis data
2. Calls Claude Code with structured prompt
3. Parses JSON response from Claude Code
4. Cleans up temporary files
5. Returns grading results

## Criteria Management

### CriteriaManager Class
**File**: `src/criteria/criteria-manager.js`

```javascript
class CriteriaManager {
  createTemplate(name, description, items)
  updateTemplate(id, updates)
  deleteTemplate(id)
  validateCriteria(criteria)
  generateGradingRubric(criteria)
  getDefaultUnityMathCriteria()
}
```

#### Criteria Structure

**Template Format**
```javascript
{
  "id": "unique_id",
  "name": "Template Name",
  "description": "Description",
  "items": [
    {
      "id": "criterion_id",
      "name": "Criterion Name",
      "description": "Detailed description",
      "points": 25,
      "weight": "high|medium|low",
      "keywords": ["keyword1", "keyword2"],
      "examples": ["code example 1", "code example 2"],
      "detectionPatterns": ["regex1", "regex2"]
    }
  ]
}
```

**Default Templates**
- Unity Math Fundamentals (100 points)
- Code Quality Standards (90 points)
- Advanced Unity Concepts (120 points)

## Results Export

### ResultsExporter Class
**File**: `src/grader/results-exporter.js`

```javascript
class ResultsExporter {
  async exportToCsv(results, filename)
  async exportToJson(results, filename)
  async exportToPdf(results, filename)
  calculateStatistics(results)
  analyzeCriteriaPerformance(results, criteria)
}
```

#### Export Formats

**CSV Export**
- Student information
- Grade breakdown by criteria
- Percentage scores
- Feedback summaries
- Timestamps

**JSON Export**
- Complete results data
- Metadata and statistics
- Detailed criteria scores
- Full feedback text
- Analysis context

**PDF Export**
- Formatted report with:
  - Summary statistics
  - Grade distribution charts
  - Individual student results
  - Criteria performance analysis

## Utility Classes

### FileUtils Class
**File**: `src/utils/file-utils.js`

```javascript
class FileUtils {
  async readFileContent(filePath, encoding)
  async writeFileContent(filePath, content, options)
  async listFiles(dirPath, options)
  async findFiles(dirPath, criteria)
  async searchInFiles(dirPath, searchTerm, options)
  formatFileSize(bytes)
}
```

#### File Operations

**listFiles(dirPath, options)**
Options:
- `extensions: ['.cs', '.js']` - Filter by file extensions
- `pattern: 'string'` - Filter by filename pattern
- `recursive: true` - Include subdirectories
- `includeDirectories: true` - Include folders in results
- `sortBy: 'name|size|modified'` - Sort results

**searchInFiles(dirPath, searchTerm, options)**
- Searches file content for patterns
- Returns matches with line numbers
- Supports case-sensitive/insensitive search
- Filters by file extensions

## Frontend (Renderer Process)

### UnityAutoGraderApp Class
**File**: `src/renderer/renderer.js`

```javascript
class UnityAutoGraderApp {
  init()
  showPanel(panelName)
  authenticateCanvas()
  loadAssignments()
  startBatchGrading()
  exportResults(format)
  showToast(message, type)
}
```

#### UI Management

**Panel Navigation**
- Dashboard: System overview
- Canvas Setup: LMS configuration
- Criteria: Grading templates
- Assignments: Course/assignment selection
- Grading: Batch processing interface
- Results: Export and review
- Settings: Application configuration

**Progress Tracking**
```javascript
updateGradingProgress(progress) {
  const progressFill = document.getElementById('progress-fill');
  progressFill.style.width = `${progress.percentage}%`;

  const progressText = document.getElementById('grading-progress');
  progressText.innerHTML = `
    <p>Grading: ${progress.current}/${progress.total}</p>
    <p>Current: ${progress.currentStudent}</p>
  `;
}
```

## Error Handling Patterns

### Consistent Error Response Format
```javascript
{
  success: boolean,
  data?: any,
  error?: string,
  details?: object
}
```

### Repository Validation Errors
```javascript
// Invalid URL
return createFailedAnalysis(url, 'Invalid GitHub URL format', 0);

// Repository not found
return createFailedAnalysis(url, 'Repository not found or not accessible', 0);

// Not Unity project
return createFailedAnalysis(url, 'Not a valid Unity project', 0);
```

### Network Error Handling
```javascript
catch (error) {
  if (error.message.includes('Repository not found')) {
    return { success: false, error: 'Repository not found' };
  } else if (error.message.includes('Authentication failed')) {
    return { success: false, error: 'Authentication required' };
  } else if (error.message.includes('network')) {
    return { success: false, error: 'Network error' };
  }
  return { success: false, error: error.message };
}
```

## Configuration and Environment

### Environment Variables
```bash
CANVAS_API_URL=https://school.instructure.com/api/v1
CANVAS_TOKEN=your_canvas_token
GITHUB_TOKEN=your_github_token
NODE_ENV=development|production
LOG_LEVEL=info|debug|error
```

### Electron Store Keys
```javascript
// Canvas credentials
'canvas.apiUrl'
'canvas.token'
'canvas.user'
'canvas.authenticatedAt'

// Criteria templates
'criteria.templates'

// Application settings
'app.theme'
'app.autoCleanup'
'app.maxConcurrentJobs'
```

## Performance Considerations

### Memory Management
- Automatic cleanup of cloned repositories
- Temp file management
- Limited concurrent operations
- Progress streaming for large batches

### Optimization Strategies
- Shallow Git clones (`--depth 1`)
- Incremental result processing
- Async/await for non-blocking operations
- File system monitoring for cleanup

### Timeout Configuration
```javascript
const timeouts = {
  repositoryClone: 120000,    // 2 minutes
  codeAnalysis: 180000,       // 3 minutes
  claudeCodeGrading: 300000,  // 5 minutes
  canvasApiCall: 30000        // 30 seconds
};
```

## Security Implementation

### Data Protection
- Electron context isolation enabled
- Node integration disabled in renderer
- Secure storage using electron-store
- No code execution, only analysis

### API Security
- Token-based authentication
- HTTPS-only connections
- Automatic token expiration
- Minimal required permissions

### File System Security
- Sandboxed temporary directories
- Automatic cleanup procedures
- No persistent code storage
- Read-only repository access

---

*This function reference provides comprehensive documentation of all major components and their interactions within the Unity Auto-Grader application.*