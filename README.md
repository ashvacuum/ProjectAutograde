# AraLaro

A desktop application that automates grading for Unity game math assignments submitted via Canvas LMS. The app integrates with AI-powered code analysis and provides a modern UI for instructors.

## 📥 Installation (For End Users)

### Download the Latest Release

**[Download Latest Version](https://github.com/ashvacuum/ProjectAutograde/releases/latest)**

Choose one of the following installation options:

#### Option 1: Installer (Recommended)
1. Download **AraLaro Setup X.X.X.exe** from the latest release
2. Run the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

#### Option 2: Portable Version
1. Download **AraLaro-X.X.X-win.zip** from the latest release
2. Extract the ZIP file to your preferred location
3. Run **AraLaro.exe** from the extracted folder

### System Requirements
- **Operating System**: Windows 10 or later (64-bit)
- **Internet Connection**: Required for Canvas and LLM API access
- **Git**: Must be installed and available in system PATH ([Download Git](https://git-scm.com/download/win))

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

## 🚀 Quick Start Guide

### Step 1: Get Your API Keys

Before using the app, you'll need:

1. **Canvas API Token** (Required)
   - Log into your Canvas LMS
   - Go to **Account → Settings**
   - Scroll to **"Approved Integrations"**
   - Click **"+ New Access Token"**
   - Enter purpose: "Unity Auto-Grader"
   - Copy the generated token

2. **LLM API Key** (Required - choose at least one)
   - **OpenAI**: [Get API key](https://platform.openai.com/api-keys)
   - **Anthropic (Claude)**: [Get API key](https://console.anthropic.com/)
   - **Google Gemini**: [Get API key](https://makersuite.google.com/app/apikey)
   - **Other supported**: Cohere, Azure OpenAI

### Step 2: First Time Setup

1. **Launch AraLaro**
2. **Configure LLM API Key**:
   - Click **"Settings"** in the sidebar
   - Click **"Add API Key"**
   - Select your LLM provider
   - Enter your API key
   - Verify status shows "Available"

3. **Connect to Canvas**:
   - Click **"Canvas Setup"** in the sidebar
   - Enter your Canvas URL (e.g., `https://yourschool.instructure.com`)
   - Paste your Canvas API token
   - Click **"Connect to Canvas"**
   - Verify connection is successful

4. **Load Grading Criteria** (Optional):
   - Click **"Criteria"** in the sidebar
   - Select a pre-built template or create custom criteria
   - Templates include Unity math concepts, code quality, etc.

### Step 3: Grade Your First Assignment

1. **Select Course and Assignment**:
   - Click **"Assignments"** in the sidebar
   - Choose your course from the dropdown
   - Click **"Grade"** next to the Unity assignment you want to grade

2. **Review Submissions**:
   - App displays all student submissions with GitHub URLs
   - Verify submissions are detected correctly

3. **Configure Grading**:
   - Select grading criteria (or use default Unity math template)
   - Optionally skip already-graded submissions

4. **Start Batch Grading**:
   - Click **"Start Batch Grading"**
   - App will automatically:
     - Clone each student's GitHub repository
     - Analyze Unity C# scripts
     - Grade based on your criteria
     - Generate detailed feedback
     - Clean up temporary files

5. **Review and Post Grades**:
   - Click **"Results"** in the sidebar
   - Review grades and feedback for each student
   - Handle any submissions flagged for manual review
   - Click **"Post to Canvas"** to submit grades
   - Export results to CSV/PDF/JSON as needed

## 📖 Detailed User Guide

### How Grading Works

AraLaro follows this workflow:

1. **Repository Cloning**: Downloads student's GitHub repository to a temporary folder
2. **Project Validation**: Verifies the repository is a valid Unity project (checks for Assets and ProjectSettings folders)
3. **Script Analysis**: Analyzes all C# scripts for Unity-specific patterns and math concepts
4. **LLM Grading**: Sends code analysis to your configured LLM with assignment criteria
5. **Feedback Generation**: Receives structured grades with detailed feedback
6. **Cleanup**: Removes temporary files after grading

### Grading Criteria Explained

The app uses weighted scoring across multiple criteria categories:

- **Unity Math Concepts**: Vector operations, quaternions, transforms, physics, trigonometry, interpolation
- **Code Quality**: MonoBehaviour structure, performance, naming conventions, error handling, organization
- **Custom Criteria**: Create your own criteria based on assignment requirements

Each criterion has:
- **Name**: What you're grading
- **Weight**: Points allocated (e.g., 25 points)
- **Description**: What to look for in student code

### Canvas Integration

#### Posting Grades
- Grades are posted individually or in batch
- Includes both numerical score and detailed text feedback
- Comments appear in Canvas gradebook for students to review

#### Required Permissions
Your Canvas API token must have:
- Read course content
- Read and write grades
- Read user information
- Read assignment submissions

### Export Options

**CSV Export**: Spreadsheet format for gradebook integration
- Student name, email, score, feedback
- Importable into Excel or Google Sheets

**JSON Export**: Machine-readable format for data analysis
- Complete grading results with metadata
- Useful for custom reporting tools

**PDF Export**: Professional grade reports
- Student name and submission details
- Score breakdown by criteria
- Detailed feedback and code examples
- Suitable for student records

## 🎓 Understanding the Grading Process

### What Students Need to Submit
Students must submit GitHub repository URLs through Canvas. The repository should contain:
- A valid Unity project structure (Assets and ProjectSettings folders)
- C# scripts implementing the assigned math concepts
- Public repository or provide GitHub access token

### What AraLaro Analyzes
The grading engine looks for:
- **Unity Patterns**: Proper use of MonoBehaviour, lifecycle methods (Start, Update, FixedUpdate)
- **Math Concepts**: Vector operations, quaternion rotations, physics calculations
- **Code Quality**: Naming conventions, error handling, performance optimization
- **Best Practices**: SerializeField usage, component references, code organization

### Grading is Code-Based Only
Important: AraLaro performs **static code analysis** only
- Does NOT compile or run Unity projects
- Does NOT test gameplay functionality
- Analyzes C# code structure and patterns
- Best for grading math implementation and code quality

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

### Technology Stack
- **Electron** - Cross-platform desktop framework
- **Node.js** - Backend processing
- **Canvas LMS API** - Learning management system integration
- **Simple Git** - Repository operations
- **LLM Integration** - AI-powered grading via OpenAI, Anthropic, Google, etc.

### Key Dependencies
- **Electron** - Desktop app framework
- **Express** - Local server for IPC
- **Axios** - HTTP client for Canvas API
- **Simple-git** - Git repository operations
- **Electron-store** - Secure local data storage
- **CSV-writer** - Export functionality
- **jsPDF** - PDF generation

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

## 👨‍💻 For Developers and Contributors

This is an educational tool designed for Unity game development instructors. Contributions and feedback are welcome!

### Building from Source

#### Prerequisites
- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Git** - For repository operations

#### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ashvacuum/ProjectAutograde.git
   cd ProjectAutograde
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm start
   ```

#### Development Scripts

- **`npm start`** - Production mode (minimal logging)
- **`npm run dev`** - Development mode with hot-reload
- **`start-debug.bat`** - Debug mode with DevTools and verbose logging (RECOMMENDED FOR TESTING)
- **`start-dev.bat`** - Development mode via batch file

#### Building Executables

**Windows**:
```bash
npm run build-win
```
Creates installer and ZIP in `dist/` folder

**Using build script**:
```bash
build-windows.bat
```
Installs dependencies and builds Windows executable

### Environment Variables (Optional)

For development, you can use a `.env` file:

1. Copy the template:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```env
   CANVAS_API_URL=https://your-school.instructure.com/api/v1
   CANVAS_TOKEN=your_canvas_api_token_here
   GITHUB_TOKEN=your_github_token_here
   ```

**Note**: UI credentials take precedence over `.env` values

### Project Structure
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

### Contributing Guidelines

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly using `start-debug.bat`
5. Submit a pull request with detailed description

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

**AraLaro - Made for Unity educators** 🎮✨