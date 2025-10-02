# Unity Auto-Grader Desktop App

A desktop application that automates grading for Unity game math assignments submitted via Canvas LMS. The app integrates with Claude Code for intelligent code analysis and provides a Discord-like modern UI for instructors.

## 🎯 Features

### Canvas LMS Integration
- Secure authentication with Canvas API
- Automatic course and assignment fetching
- Grade posting back to Canvas with detailed feedback
- GitHub URL extraction from submissions

### Unity Project Analysis
- Automated GitHub repository cloning
- C# script analysis and structure evaluation
- Unity-specific pattern detection (MonoBehaviour, Vector math, etc.)
- Math concept identification (vectors, quaternions, transforms, physics)
- Code quality assessment

### Claude Code Integration
- Leverages Claude Code directly for intelligent grading
- Contextual analysis based on assignment criteria
- Detailed feedback generation with specific code examples
- Comprehensive scoring across multiple criteria

### Modern Discord-like UI
- Intuitive sidebar navigation
- Glass morphism design with gradients
- Real-time progress tracking
- Toast notifications for user feedback
- Responsive card-based layouts

### Flexible Criteria Management
- Pre-built templates for Unity math concepts
- Custom criteria builder
- Import/export functionality
- Weighted scoring system

### Export & Reporting
- CSV export for gradebook integration
- JSON export for data analysis
- PDF reports with detailed feedback
- Grade distribution statistics

## 📋 Prerequisites

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **LLM API Key** - At least one of: OpenAI, Anthropic (Claude), Google Gemini, Cohere, Azure OpenAI
- **Canvas LMS Access** - API token required (instructor/TA permissions)
- **Git** - For repository operations (must be in system PATH)

## 🚀 Quick Start

### 1. Installation

1. **Clone or download this repository**
2. **Open a command prompt in the project directory**
3. **Run the Windows build script:**
   ```bash
   build-windows.bat
   ```
   This will:
   - Install all dependencies
   - Build the Windows executable
   - Create an installer in the `dist` folder

### 1b. Development & Testing

For testing and debugging, use these batch files:

- **`start-debug.bat`** - **RECOMMENDED FOR TESTING**
  - Opens DevTools automatically
  - Enables verbose logging to console
  - Shows detailed grading progress
  - Perfect for troubleshooting

- **`start-dev.bat`** - Development mode
  - Standard development environment
  - DevTools available (F12)
  - Some logging enabled

- **`npm start`** - Production mode
  - Minimal logging
  - No DevTools by default

### 2. Configuration (Optional - Environment Variables)

The app stores credentials securely in electron-store, but you can also use environment variables as a fallback:

1. **Copy the environment template:**
   ```bash
   copy .env.example .env
   ```

2. **Edit the `.env` file with your settings:**
   ```env
   CANVAS_API_URL=https://your-school.instructure.com/api/v1
   CANVAS_TOKEN=your_canvas_api_token_here
   # or use: CANVAS_API_KEY=your_canvas_api_token_here (both work)
   GITHUB_TOKEN=your_github_token_here
   ```

**Note**: Credentials entered in the UI take precedence over `.env` values. The `.env` file is only used as a fallback if no credentials are stored in electron-store.

### 3. First Time Setup

1. **Launch the application** (run `npm start` or use built executable)
2. **Navigate to "Settings"** panel and add your LLM API key (OpenAI, Claude, or other)
3. **Navigate to "Canvas Setup"** and enter your Canvas credentials
4. **Go to "Criteria"** panel and load the default Unity math templates
5. **Verify LLM status** shows as "Available" in the Dashboard

## 🎮 Usage Workflow

### Standard Grading Process

1. **Connect to Canvas** - Set up your Canvas API credentials in Canvas Setup panel
2. **Select Course** - Go to Assignments panel, choose the course containing Unity assignments
3. **Choose Assignment** - Click "Grade" on the assignment you want to grade
4. **Review Submissions** - App shows all submissions with GitHub URLs
5. **Configure Criteria** - Select grading criteria template (or use default)
6. **Start Batch Grading** - Click "Start Batch Grading" button. App will:
   - Clone each GitHub repository to temp directory
   - Validate Unity project structure (Assets, ProjectSettings folders)
   - Analyze C# scripts for Unity patterns and math concepts
   - Send analysis to LLM with rubric and assignment context
   - Receive structured grading with feedback
   - Clean up temp files
7. **Review Results** - Go to Results panel to:
   - View detailed grades and feedback for each student
   - Handle submissions flagged for instructor review
   - Post grades to Canvas
   - Export results to CSV/JSON/PDF

### Minimal Workflow (No Build)
- Pulls GitHub repositories
- Analyzes code without compilation
- Grades based on code structure and math usage
- Cleans up temporary files automatically

## 📊 Grading Criteria

### Default Unity Math Criteria
- **Vector Mathematics** (25 pts) - Vector3/2 operations, dot/cross products
- **Quaternion Rotations** (20 pts) - Rotation handling and interpolation
- **Transform Math** (20 pts) - Position, rotation, scale operations
- **Physics Integration** (15 pts) - Rigidbody forces and collision detection
- **Trigonometry** (10 pts) - Sin/cos applications and angle calculations
- **Interpolation** (10 pts) - Lerp, Slerp, and smooth transitions

### Code Quality Criteria
- **MonoBehaviour Structure** (15 pts) - Proper Unity lifecycle usage
- **Performance Optimization** (20 pts) - Efficient Update loops and caching
- **Naming Conventions** (10 pts) - C# naming standards
- **Error Handling** (15 pts) - Null checks and defensive programming
- **Code Organization** (10 pts) - Comments, regions, and structure
- **Unity Best Practices** (10 pts) - SerializeField, component usage

## 🔧 Technical Details

### Architecture
- **Electron** - Cross-platform desktop framework
- **Node.js** - Backend processing
- **Canvas API** - LMS integration
- **Simple Git** - Repository operations
- **Claude Code** - AI-powered grading

### File Structure
```
unity-auto-grader/
├── main.js                 # Electron main process
├── preload.js             # Secure IPC bridge
├── package.json           # Dependencies and scripts
├── src/
│   ├── renderer/          # UI components
│   ├── canvas/           # Canvas API integration
│   ├── grader/           # Core grading engine
│   ├── criteria/         # Criteria management
│   └── utils/            # Helper utilities
├── assets/               # App icons and resources
└── dist/                 # Build output
```

### Dependencies
- **Electron** - Desktop app framework
- **Express** - Local server for IPC
- **Axios** - HTTP client for Canvas API
- **Simple-git** - Git repository operations
- **Electron-store** - Secure local data storage
- **CSV-writer** - Export functionality
- **jsPDF** - PDF generation

## 🎯 Canvas Setup

### Getting Your Canvas API Token

1. **Log into Canvas**
2. **Go to Account → Settings**
3. **Scroll to "Approved Integrations"**
4. **Click "+ New Access Token"**
5. **Enter purpose: "Unity Auto-Grader"**
6. **Copy the generated token**
7. **Paste into the app's Canvas Setup page**

### Required Canvas Permissions
- Read course content
- Read and write grades
- Read user information
- Read assignment submissions

## 🔍 Troubleshooting

### Common Issues

**Canvas Connection Failed**
- Verify API URL format: `https://school.instructure.com/api/v1`
- Check token validity and permissions
- Ensure network connectivity

**LLM API Key Issues**
- Configure at least one LLM provider in Settings panel
- Supported providers: OpenAI, Anthropic (Claude), Google Gemini, Cohere, Azure OpenAI
- Test API key after adding it
- Check if key is marked as "Active"

**GitHub Repository Access**
- Ensure repositories are public or provide GitHub token
- Verify repository URLs in Canvas submissions
- Check internet connectivity
- Git must be installed and in system PATH

**Grading Failures**
- Verify repository is a valid Unity project (has Assets and ProjectSettings folders)
- Check that repository contains C# scripts
- Ensure LLM API has sufficient quota/credits
- Review error messages in Results panel under "Needs Review"

**Build Failures**
- Update Node.js to latest LTS version
- Clear node_modules and reinstall: `npm install`
- Run as administrator if permission issues

### Known Issues & Fixes

Several critical bugs were identified and fixed:
1. **GitHub URL extraction inconsistency** - Fixed property naming mismatch
2. **Missing user object in submissions** - Added proper user structure
3. **Assignment context not passed to LLM** - Fixed IPC parameter passing
4. **Canvas URL validation error** - Corrected boolean logic
5. **Grade extraction from nested results** - Improved error handling
6. **GitHub URL regex too strict** - Updated to accept more formats

### Log Files
- Application logs: `%APPDATA%/unity-auto-grader/logs/`
- Electron logs: Check Developer Tools (F12 or Ctrl+Shift+I)
- Temp directory: `Project AutoGrade/temp/` (manually clean if needed)

## 📈 Roadmap

### Planned Features
- **Batch Assignment Management** - Grade multiple assignments simultaneously
- **Advanced Criteria Builder** - Visual criteria editor with drag-drop
- **Integration Extensions** - Support for other LMS platforms
- **Machine Learning** - Improve grading accuracy over time
- **Collaboration Tools** - Multi-instructor grading workflows

### Performance Improvements
- Parallel processing for large batches
- Incremental analysis for code changes
- Caching for repeated submissions

## 🤝 Contributing

This is an educational tool designed for Unity game development instructors. Contributions and feedback are welcome!

### Development Setup
1. Clone repository
2. Run `npm install`
3. Run `npm start` for development mode
4. Use `npm run dev` for hot-reload development

## 📄 License

MIT License - See LICENSE file for details.

## 🆘 Support

For issues, feature requests, or questions:
1. Check the troubleshooting section above
2. Review application logs
3. Create an issue with detailed information including:
   - Operating system version
   - Node.js version
   - Error messages or screenshots
   - Steps to reproduce

---

**Made for Unity educators by Claude Code** 🎮✨