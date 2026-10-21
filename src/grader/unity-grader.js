const fs = require('fs').promises;
const path = require('path');
const GitCommands = require('../utils/git-commands');

// Folders of imported packages, not student work
const VENDOR_DIR = /^(TextMesh Pro|TextMeshPro|Packages|Plugins|ThirdParty)$/i;

// Students often keep every activity in one repo ("Activity 4/", branch
// "activity-4", "Week5Scripts"). These read the numbers off names like that.
const NUMBERED = /(?:week|wk|activity|acitivty|actvity|act|lab|exercise)[\s_\-#:.]*0*(\d+)(?!\d)/gi;

// Numbers an assignment name refers to: "Week 4 Assignment" -> [4]
function assignmentNumbers(name) {
  return [...new Set([...String(name || '').matchAll(NUMBERED)].map(m => Number(m[1])))];
}

// Numbers a path or branch name refers to: "Assets/Activity 4/Pathing.cs" -> [4]
function referencedNumbers(text) {
  return [...String(text || '').matchAll(NUMBERED)].map(m => Number(m[1]));
}

// Distinctive words from the assignment text, for matching code to it
function assignmentKeywords(assignment) {
  const text = `${assignment?.name || ''} ${assignment?.description || ''}`
    .replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').toLowerCase();
  const stop = new Set(['should', 'which', 'their', 'there', 'these', 'those', 'about', 'every', 'after', 'before',
    'while', 'where', 'would', 'could', 'using', 'other', 'player', 'assignment', 'activity', 'create', 'make', 'video',
    'github', 'repository', 'readme', 'submit', 'link', 'google', 'drive']);
  return [...new Set(text.match(/[a-z]{5,}/g) || [])].filter(w => !stop.has(w));
}

class UnityGrader {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.currentProject = null;
    this.analysisResults = {};
    this.gitCommands = new GitCommands();
  }

  async analyzeProject(submittedUrl, criteria, assignment = null) {
    // Branch links (/tree/<branch>) clone that branch from the base repo
    const { repoUrl, branch: linkedBranch, branches } = await this.gitCommands.resolveRepoRef(submittedUrl);
    let branch = linkedBranch;
    let branchNote = null;
    if (branch) console.log(`🌿 Submission links branch "${branch}"`);

    // A plain link lands on the default branch. If exactly one branch is
    // named for this assignment ("activity-4" for "Week 4 ..."), grade that.
    const numbers = assignmentNumbers(assignment?.name);
    if (!branch && numbers.length) {
      const named = branches.filter(b => referencedNumbers(b).some(n => numbers.includes(n)));
      if (named.length === 1) {
        branch = named[0];
        branchNote = `The submitted link points at the default branch, but the repository has a branch "${branch}" named for this assignment, so that branch was graded.`;
        console.log(`🌿 ${branchNote}`);
      }
    }

    // First, validate the repository URL and check if it exists
    if (!this.gitCommands.isValidGitHubUrl(repoUrl)) {
      return this.createFailedAnalysis(repoUrl, 'Invalid GitHub URL format', 0, true, 'invalid_url');
    }

    try {
      // Check if repository exists and is accessible before attempting to clone
      console.log('🔍 Checking repository accessibility...');
      const repoCheck = await this.gitCommands.checkRepositoryExists(repoUrl);

      if (!repoCheck.exists) {
        console.log('❌ Repository not found or not accessible');
        return this.createFailedAnalysis(
          repoUrl,
          repoCheck.error || 'Repository not found',
          0,
          true,
          'not_found'
        );
      }

      // Check if repository is accessible (not private without credentials)
      if (repoCheck.accessible === false) {
        console.log('🔒 Repository is private or requires authentication');
        return this.createFailedAnalysis(
          repoUrl,
          'Repository is private or inaccessible. Please ensure the repository is set to public or provide access credentials.',
          0,
          true,
          'private_repo'
        );
      }

      console.log('✅ Repository is accessible, proceeding with clone...');

      // Clone the repository using git commands
      const cloneResult = await this.gitCommands.cloneRepository(repoUrl, { branch });
      if (!cloneResult.success) {
        return this.createFailedAnalysis(repoUrl, 'Failed to clone repository', 0, true, 'clone_failed');
      }

      this.currentProject = cloneResult.path;

      // Validate it's a Unity project - first check root, then subdirectories
      console.log('🔍 Checking for Unity project...');
      let projectPath = cloneResult.path;
      let validation = await this.gitCommands.validateUnityProject(projectPath);

      if (!validation.isValidUnityProject) {
        console.log('❌ Not a Unity project at root, searching subdirectories...');

        // Recursively search for Unity project in subdirectories (up to 3 levels deep)
        const foundPath = await this.findUnityProjectInSubdirectories(cloneResult.path, 3);

        if (foundPath) {
          console.log(`✅ Found Unity project at: ${foundPath}`);
          const subValidation = await this.gitCommands.validateUnityProject(foundPath);
          validation = subValidation;
          projectPath = foundPath;
          this.currentProject = projectPath;
        }
      } else {
        console.log('✅ Unity project found at repository root');
      }

      if (!validation.isValidUnityProject) {
        await this.cleanup(cloneResult.path);
        return this.createFailedAnalysis(
          repoUrl,
          'Not a valid Unity project. Checked root and subdirectories.',
          0,
          true,
          'invalid_project'
        );
      }

      // If we have warnings but it's still a valid project, continue
      if (validation.warnings.length > 0) {
        console.warn(`Unity project warnings for ${repoUrl}:`, validation.warnings);
      }

      // Perform the actual analysis (use the correct projectPath which may be a subdirectory)
      const projectStructure = await this.analyzeProjectStructure(projectPath);
      let csharpFiles = await this.findCSharpFiles(projectPath);

      // Fallback: If no C# files found in standard Unity structure, search entire repo
      if (csharpFiles.length === 0) {
        console.log('⚠️  No C# files found in Unity project structure, searching entire repository...');
        const repoRootPath = cloneResult.path;
        const allCSharpFiles = await this.gitCommands.findCSharpFiles(repoRootPath);

        if (allCSharpFiles.length > 0) {
          console.log(`✅ Found ${allCSharpFiles.length} C# files in repository root`);
          csharpFiles = allCSharpFiles;

          // Mark as non-standard structure
          projectStructure.isNonStandard = true;
          projectStructure.nonStandardReason = 'C# files found outside of Unity Assets folder structure';
        } else {
          console.log('❌ No C# files found anywhere in repository');
        }
      } else {
        console.log(`✅ Found ${csharpFiles.length} C# files in Unity project`);
        projectStructure.isNonStandard = false;
      }

      // Additional check: If no Assets folder but has C# files, mark as non-standard
      if (!projectStructure.hasAssetsFolder && csharpFiles.length > 0) {
        console.log('ℹ️  Non-standard Unity project detected (no Assets folder, but C# files present)');
        projectStructure.isNonStandard = true;
        projectStructure.nonStandardReason = projectStructure.nonStandardReason || 'No Assets folder, but C# files present';
      }

      const codeAnalysis = await this.analyzeCSharpCode(csharpFiles);
      const unitySpecific = await this.analyzeUnitySpecifics(projectPath);
      const gitInfo = await this.gitCommands.getRepositoryInfo(projectPath);

      const analysis = {
        repoUrl,
        branch,
        projectPath: cloneResult.path,
        structure: projectStructure,
        codeFiles: csharpFiles,
        codeAnalysis,
        unityFeatures: unitySpecific,
        gitInfo,
        validation,
        timestamp: new Date().toISOString(),
        success: true
      };

      // Everything the grader model needs goes into the prompt: it grades
      // only from what it's given.
      analysis.folderTree = await this.buildFolderTree(cloneResult.path);
      analysis.sourceFiles = await this.collectSourceFiles(cloneResult.path, csharpFiles, undefined, assignment);
      analysis.readme = await this.readReadme(cloneResult.path);
      analysis.branches = branches;
      analysis.branchNote = branchNote;
      analysis.authorshipSignals = this.countAuthorshipSignals(analysis.sourceFiles.files);

      this.analysisResults[repoUrl] = analysis;

      // The clone is left in place; the caller deletes analysis.projectPath
      // once grading is done (see grader-analyze-project in main.js).
      return analysis;

    } catch (error) {
      if (this.currentProject) {
        await this.cleanup(this.currentProject);
      }

      console.error(`Project analysis failed for ${repoUrl}:`, error.message);

      // Determine if this is an access issue
      const isAccessIssue = error.message.includes('Authentication') ||
                            error.message.includes('private') ||
                            error.message.includes('not found') ||
                            error.message.includes('Repository not found');

      return this.createFailedAnalysis(repoUrl, error.message, 0, isAccessIssue, 'error');
    }
  }

  createFailedAnalysis(repoUrl, errorMessage, score = 0, needsReview = false, errorType = 'unknown') {
    const errorTypeMessages = {
      'invalid_url': 'The repository URL format is invalid. Please check the GitHub URL.',
      'not_found': 'Repository not found. It may have been deleted or the URL is incorrect.',
      'private_repo': 'Repository is private or inaccessible. Student must make the repository public or grant access.',
      'clone_failed': 'Failed to clone the repository. There may be network issues or repository problems.',
      'invalid_project': 'The repository does not contain a valid Unity project structure.',
      'error': 'An unexpected error occurred during analysis.'
    };

    const interventionMessage = errorTypeMessages[errorType] || errorMessage;

    return {
      repoUrl,
      projectPath: null,
      structure: null,
      codeFiles: [],
      codeAnalysis: null,
      unityFeatures: null,
      gitInfo: null,
      validation: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: errorMessage,
      needsInstructorIntervention: needsReview,
      interventionReason: interventionMessage,
      errorType: errorType,
      grade: {
        overallGrade: score,
        maxPoints: 100,
        criteriaScores: {},
        feedback: `Failed to analyze project: ${errorMessage}`,
        strengths: [],
        improvements: ['Fix repository issues and resubmit']
      }
    };
  }

  async findCSharpFiles(projectPath) {
    try {
      return await this.gitCommands.findCSharpFiles(projectPath);
    } catch (error) {
      console.error('Error finding C# files:', error);
      return [];
    }
  }

  async findSubDirectories(basePath) {
    try {
      const items = await fs.readdir(basePath, { withFileTypes: true });
      const directories = items
        .filter(item => item.isDirectory())
        .filter(item => !item.name.startsWith('.')) // Skip hidden directories
        .filter(item => item.name !== 'node_modules') // Skip common non-Unity directories
        .map(item => item.name);

      return directories;
    } catch (error) {
      console.error('Error finding subdirectories:', error);
      return [];
    }
  }

  async findUnityProjectInSubdirectories(basePath, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return null;
    }

    try {
      const items = await fs.readdir(basePath, { withFileTypes: true });

      for (const item of items) {
        if (!item.isDirectory()) continue;

        // Skip hidden directories and common non-Unity folders
        if (item.name.startsWith('.') ||
            item.name === 'node_modules' ||
            item.name === 'Library' ||
            item.name === 'Temp' ||
            item.name === 'Logs') {
          continue;
        }

        const subPath = path.join(basePath, item.name);
        const relativePath = path.relative(this.tempDir, subPath);

        console.log(`${'  '.repeat(currentDepth)}📂 Checking: ${relativePath}`);

        // Check if this directory contains Assets and ProjectSettings
        try {
          const subItems = await fs.readdir(subPath, { withFileTypes: true });
          const hasAssets = subItems.some(si => si.isDirectory() && si.name === 'Assets');
          const hasProjectSettings = subItems.some(si => si.isDirectory() && si.name === 'ProjectSettings');

          if (hasAssets && hasProjectSettings) {
            console.log(`${'  '.repeat(currentDepth)}✅ Unity project found!`);
            return subPath;
          }
        } catch (error) {
          // Skip directories we can't read
          continue;
        }

        // Recursively check subdirectories
        const foundPath = await this.findUnityProjectInSubdirectories(subPath, maxDepth, currentDepth + 1);
        if (foundPath) {
          return foundPath;
        }
      }

      return null;
    } catch (error) {
      console.error(`Error searching directory ${basePath}:`, error);
      return null;
    }
  }

  async analyzeProjectStructure(projectPath) {
    const structure = {
      hasAssetsFolder: false,
      hasScriptsFolder: false,
      hasScenesFolder: false,
      hasProjectSettings: false,
      directories: [],
      rootFiles: []
    };

    try {
      const items = await fs.readdir(projectPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          structure.directories.push(item.name);

          if (item.name === 'Assets') {
            structure.hasAssetsFolder = true;
            const assetsStructure = await this.analyzeAssetsFolder(path.join(projectPath, 'Assets'));
            structure.assetsStructure = assetsStructure;
          }

          if (item.name === 'ProjectSettings') {
            structure.hasProjectSettings = true;
          }
        } else {
          structure.rootFiles.push(item.name);
        }
      }

      structure.hasScriptsFolder = await this.hasScriptsInAssets(projectPath);
      structure.hasScenesFolder = await this.hasScenesInAssets(projectPath);

    } catch (error) {
      console.error('Error analyzing project structure:', error);
    }

    return structure;
  }

  async analyzeAssetsFolder(assetsPath) {
    const assetsStructure = {
      scripts: [],
      scenes: [],
      materials: [],
      prefabs: [],
      textures: [],
      directories: []
    };

    try {
      const items = await fs.readdir(assetsPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          assetsStructure.directories.push(item.name);
          const subPath = path.join(assetsPath, item.name);
          await this.scanAssetDirectory(subPath, assetsStructure);
        } else {
          this.categorizeAssetFile(item.name, assetsStructure);
        }
      }
    } catch (error) {
      console.error('Error analyzing Assets folder:', error);
    }

    return assetsStructure;
  }

  async scanAssetDirectory(dirPath, assetsStructure) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          await this.scanAssetDirectory(path.join(dirPath, item.name), assetsStructure);
        } else {
          this.categorizeAssetFile(item.name, assetsStructure);
        }
      }
    } catch (error) {
      console.error('Error scanning asset directory:', error);
    }
  }

  categorizeAssetFile(filename, assetsStructure) {
    const ext = path.extname(filename).toLowerCase();
    const relativePath = filename;

    switch (ext) {
      case '.cs':
        assetsStructure.scripts.push(relativePath);
        break;
      case '.unity':
        assetsStructure.scenes.push(relativePath);
        break;
      case '.mat':
        assetsStructure.materials.push(relativePath);
        break;
      case '.prefab':
        assetsStructure.prefabs.push(relativePath);
        break;
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.tga':
        assetsStructure.textures.push(relativePath);
        break;
    }
  }


  async analyzeCSharpCode(csharpFiles) {
    const analysis = {
      totalFiles: csharpFiles.length,
      files: [],
      patterns: {
        monoBehaviours: 0,
        scriptableObjects: 0,
        vectors: 0,
        quaternions: 0,
        transforms: 0,
        physics: 0,
        coroutines: 0,
        events: 0
      },
      mathConcepts: {
        vectorOperations: [],
        quaternionUsage: [],
        transformMath: [],
        physicsCalculations: [],
        trigonometry: [],
        interpolation: []
      }
    };

    for (const filePath of csharpFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileAnalysis = await this.analyzeCodeFile(filePath, content);
        analysis.files.push(fileAnalysis);

        this.aggregatePatterns(analysis.patterns, fileAnalysis.patterns);
        this.aggregateMathConcepts(analysis.mathConcepts, fileAnalysis.mathConcepts);

      } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
        analysis.files.push({
          path: filePath,
          error: error.message,
          size: 0,
          lines: 0
        });
      }
    }

    return analysis;
  }

  async analyzeCodeFile(filePath, content) {
    const lines = content.split('\n');
    const relativePath = filePath.split('Assets')[1] || path.basename(filePath);

    const analysis = {
      path: relativePath,
      size: content.length,
      lines: lines.length,
      classes: this.extractClasses(content),
      methods: this.extractMethods(content),
      patterns: {
        monoBehaviours: 0,
        scriptableObjects: 0,
        vectors: 0,
        quaternions: 0,
        transforms: 0,
        physics: 0,
        coroutines: 0,
        events: 0
      },
      mathConcepts: {
        vectorOperations: [],
        quaternionUsage: [],
        transformMath: [],
        physicsCalculations: [],
        trigonometry: [],
        interpolation: []
      },
      codeQuality: this.assessCodeQuality(content),
      content: content
    };

    this.detectPatterns(content, analysis.patterns);
    this.detectMathConcepts(content, analysis.mathConcepts);

    return analysis;
  }

  extractClasses(content) {
    const classRegex = /(?:public|private|internal)?\s*class\s+(\w+)(?:\s*:\s*([^{]+))?/g;
    const classes = [];
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      classes.push({
        name: match[1],
        inheritance: match[2] ? match[2].trim().split(',').map(s => s.trim()) : []
      });
    }

    return classes;
  }

  extractMethods(content) {
    const methodRegex = /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(\w+)\s+(\w+)\s*\([^)]*\)/g;
    const methods = [];
    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      if (match[1] !== 'class' && match[1] !== 'interface' && match[1] !== 'struct') {
        methods.push({
          returnType: match[1],
          name: match[2]
        });
      }
    }

    return methods;
  }

  detectPatterns(content, patterns) {
    if (content.includes(': MonoBehaviour')) patterns.monoBehaviours++;
    if (content.includes(': ScriptableObject')) patterns.scriptableObjects++;
    if (content.match(/Vector[23]/g)) patterns.vectors += content.match(/Vector[23]/g).length;
    if (content.match(/Quaternion/g)) patterns.quaternions += content.match(/Quaternion/g).length;
    if (content.match(/\.transform\./g)) patterns.transforms += content.match(/\.transform\./g).length;
    if (content.match(/Rigidbody|Physics\./g)) patterns.physics += (content.match(/Rigidbody|Physics\./g) || []).length;
    if (content.includes('IEnumerator') || content.includes('yield')) patterns.coroutines++;
    if (content.match(/UnityEvent|Action<|Func</g)) patterns.events += (content.match(/UnityEvent|Action<|Func</g) || []).length;
  }

  detectMathConcepts(content, mathConcepts) {
    const vectorOps = content.match(/(Vector[23]\.(Dot|Cross|Normalize|Magnitude|Distance|Lerp|Slerp))/g);
    if (vectorOps) mathConcepts.vectorOperations.push(...vectorOps);

    const quaternionOps = content.match(/(Quaternion\.(LookRotation|FromToRotation|AngleAxis|Euler|Slerp|Lerp))/g);
    if (quaternionOps) mathConcepts.quaternionUsage.push(...quaternionOps);

    const transformMath = content.match(/(transform\.(position|rotation|scale|Translate|Rotate|LookAt))/g);
    if (transformMath) mathConcepts.transformMath.push(...transformMath);

    const physics = content.match(/(AddForce|AddTorque|velocity|angularVelocity|mass|drag)/g);
    if (physics) mathConcepts.physicsCalculations.push(...physics);

    const trig = content.match(/(Mathf\.(Sin|Cos|Tan|Asin|Acos|Atan2|PI))/g);
    if (trig) mathConcepts.trigonometry.push(...trig);

    const interp = content.match(/(Mathf\.(Lerp|LerpAngle|SmoothStep)|Vector[23]\.Lerp|Quaternion\.Lerp)/g);
    if (interp) mathConcepts.interpolation.push(...interp);
  }

  assessCodeQuality(content) {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*')).length;

    return {
      totalLines: lines.length,
      codeLines: nonEmptyLines,
      commentLines: commentLines,
      commentRatio: commentLines / nonEmptyLines,
      hasRegions: content.includes('#region'),
      hasUsings: content.includes('using '),
      hasNamespace: content.includes('namespace ')
    };
  }

  async analyzeUnitySpecifics(projectPath) {
    const unityFeatures = {
      version: 'Unknown',
      hasScenes: false,
      sceneCount: 0,
      hasInputSystem: false,
      hasPhysics2D: false,
      hasPhysics3D: false,
      customPackages: []
    };

    try {
      const projectVersionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
      try {
        const versionContent = await fs.readFile(projectVersionPath, 'utf-8');
        const versionMatch = versionContent.match(/m_EditorVersion:\s*(.+)/);
        if (versionMatch) unityFeatures.version = versionMatch[1].trim();
      } catch (error) {
        console.log('Could not read Unity version');
      }

      const scenesPath = path.join(projectPath, 'Assets');
      const scenes = await this.findSceneFiles(scenesPath);
      unityFeatures.hasScenes = scenes.length > 0;
      unityFeatures.sceneCount = scenes.length;

      const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        const dependencies = manifest.dependencies || {};

        unityFeatures.hasInputSystem = 'com.unity.inputsystem' in dependencies;
        unityFeatures.hasPhysics2D = 'com.unity.2d.physics' in dependencies;

        for (const [packageName, version] of Object.entries(dependencies)) {
          if (!packageName.startsWith('com.unity.')) {
            unityFeatures.customPackages.push({ name: packageName, version });
          }
        }
      } catch (error) {
        console.log('Could not read package manifest');
      }

    } catch (error) {
      console.error('Error analyzing Unity specifics:', error);
    }

    return unityFeatures;
  }

  async findSceneFiles(dirPath) {
    const scenes = [];
    await this.findSceneFilesRecursive(dirPath, scenes);
    return scenes;
  }

  async findSceneFilesRecursive(dirPath, scenes) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory() && !item.name.startsWith('.')) {
          await this.findSceneFilesRecursive(fullPath, scenes);
        } else if (item.name.endsWith('.unity')) {
          scenes.push(fullPath);
        }
      }
    } catch (error) {
      console.error('Error finding scene files:', error);
    }
  }

  async hasScriptsInAssets(projectPath) {
    try {
      const assetsPath = path.join(projectPath, 'Assets');
      const scripts = await this.findCSharpFiles(assetsPath);
      return scripts.length > 0;
    } catch (error) {
      return false;
    }
  }

  async hasScenesInAssets(projectPath) {
    try {
      const assetsPath = path.join(projectPath, 'Assets');
      const scenes = await this.findSceneFiles(assetsPath);
      return scenes.length > 0;
    } catch (error) {
      return false;
    }
  }

  aggregatePatterns(totalPatterns, filePatterns) {
    for (const key in filePatterns) {
      totalPatterns[key] += filePatterns[key];
    }
  }

  aggregateMathConcepts(totalConcepts, fileConcepts) {
    for (const key in fileConcepts) {
      totalConcepts[key].push(...fileConcepts[key]);
    }
  }

  extractRepoName(repoUrl) {
    return repoUrl.split('/').pop().replace('.git', '') || 'unknown-repo';
  }

  async cleanup(projectPath) {
    try {
      return await this.gitCommands.deleteDirectory(projectPath);
    } catch (error) {
      console.error(`Cleanup failed for ${projectPath}:`, error.message);
      return false;
    }
  }

  /**
   * Indented tree of the cloned project: folders first, then files. Skips
   * .meta files, git/IDE/build folders and imported packages (listed as
   * "(omitted)"). Capped at maxLines so huge projects stay readable.
   */
  async buildFolderTree(root, maxLines = 300) {
    const skip = /^(\.git|\.vs|\.idea|Library|Temp|Obj|Logs|Build|Builds|UserSettings|node_modules)$/i;
    const lines = [];

    const walk = async (dir, depth) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const dirs = entries.filter(e => e.isDirectory() && !skip.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
      const files = entries.filter(e => e.isFile() && !e.name.endsWith('.meta')).sort((a, b) => a.name.localeCompare(b.name));
      const indent = '  '.repeat(depth);

      for (const d of dirs) {
        if (lines.length >= maxLines) return;
        if (VENDOR_DIR.test(d.name)) {
          lines.push(`${indent}${d.name}/ (imported package, omitted)`);
          continue;
        }
        lines.push(`${indent}${d.name}/`);
        await walk(path.join(dir, d.name), depth + 1);
      }
      for (const f of files) {
        if (lines.length >= maxLines) return;
        lines.push(`${indent}${f.name}`);
      }
    };

    await walk(root, 0);
    if (lines.length >= maxLines) lines.push(`... (truncated at ${maxLines} entries)`);
    return lines.join('\n');
  }

  /**
   * The student's own C# files as { files: [{ path, content }], skipped },
   * with paths relative to the repo root. Imported packages are left out,
   * and the total is capped (~30k tokens); overflow is listed in skipped.
   */
  async collectSourceFiles(root, csharpFiles, maxChars = 160000, assignment = null) {
    const numbers = assignmentNumbers(assignment?.name);
    const keywords = assignmentKeywords(assignment);

    // Read every student file, then rank by how likely it is to belong to
    // this assignment, so a repo holding several activities sends this
    // one's code first instead of whatever comes first on disk.
    const candidates = [];
    const skipped = [];
    for (const filePath of csharpFiles) {
      const rel = path.relative(root, filePath);
      if (rel.split(/[\\/]/).some(part => VENDOR_DIR.test(part))) continue;
      try {
        candidates.push({ path: rel, content: await fs.readFile(filePath, 'utf-8') });
      } catch {
        skipped.push(rel);
      }
    }

    for (const file of candidates) {
      const refs = referencedNumbers(file.path);
      const matchesThis = numbers.length > 0 && refs.some(n => numbers.includes(n));
      // Path names another activity/week and not this one
      file.otherAssignment = numbers.length > 0 && refs.length > 0 && !matchesThis;
      const lower = file.content.toLowerCase();
      const keywordHits = keywords.filter(k => lower.includes(k)).length;
      file.relevance = (matchesThis ? 10 : 0) - (file.otherAssignment ? 10 : 0) + Math.min(keywordHits, 8);
    }
    candidates.sort((a, b) => b.relevance - a.relevance);

    const files = [];
    let used = 0;
    for (const file of candidates) {
      if (used + file.content.length > maxChars) {
        skipped.push(file.path);
        continue;
      }
      used += file.content.length;
      files.push({ path: file.path, content: file.content, otherAssignment: file.otherAssignment });
    }

    return { files, skipped };
  }

  /**
   * Count code patterns that are unusual for junior students, per signal:
   * { label, count, files }. Only a hint for the AI-authorship check; the
   * model weighs it against the code itself.
   */
  countAuthorshipSignals(sourceFiles) {
    const checks = [
      ['XML doc comments (/// <summary>)', /^\s*\/\/\/\s*<summary>/gm],
      ['Static classes', /\bstatic\s+(partial\s+)?class\b/g],
      ['Extension methods (this T param)', /\bstatic\s+[\w<>[\],\s]+\s+\w+\s*\(\s*this\s+/g],
      ['LINQ calls', /\.(Select|Where|OrderBy|OrderByDescending|Aggregate|SelectMany|GroupBy|ToDictionary|Any|All|FirstOrDefault)\s*\(/g],
      ['#region blocks', /^\s*#region\b/gm],
      ['Expression-bodied members (=>)', /\)\s*=>\s*[^{;]+;|\b(get|set)\s*=>/g],
      ['Null-conditional / coalescing (?. ??)', /\?\.|\?\?/g],
      ['Interfaces declared', /\binterface\s+I[A-Z]\w*/g],
      ['Generic type parameters (<T>)', /\b(class|void|static|public|private)\b[^\n;{]*<T\b/g],
      ['Singleton Instance pattern', /\bstatic\s+\w+\s+Instance\b/g],
      ['Pattern matching (is not / switch expressions)', /\bis\s+not\b|\bswitch\s*\{|=>\s*\w+\s*switch\b/g]
    ];

    const signals = [];
    for (const [label, regex] of checks) {
      let count = 0;
      const files = [];
      for (const file of sourceFiles) {
        const hits = (file.content.match(regex) || []).length;
        if (hits) {
          count += hits;
          files.push(path.basename(file.path));
        }
      }
      if (count) signals.push({ label, count, files });
    }
    return signals;
  }

  // Root README text (assignments ask for demo video links there), capped.
  async readReadme(root, maxChars = 8000) {
    try {
      const name = (await fs.readdir(root)).find(f => /^readme(\.md|\.txt)?$/i.test(f));
      if (!name) return null;
      const text = await fs.readFile(path.join(root, name), 'utf-8');
      return {
        name,
        text: text.length > maxChars ? text.slice(0, maxChars) + '\n... (truncated)' : text,
        links: this.extractReadmeLinks(text)
      };
    } catch {
      return null;
    }
  }

  /**
   * Every link in a README as { url, label }, cleaned of markdown: escapes
   * like "\_" (Drive IDs break on those), trailing <br> and punctuation.
   * label is the link text, the text before the URL on its line, or the
   * nearest heading above it ("Week 5"), which tells which video is which.
   */
  extractReadmeLinks(markdown) {
    const links = [];
    const seen = new Set();
    let heading = '';
    for (const rawLine of String(markdown).split(/\r?\n/)) {
      const line = rawLine.replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1');
      const h = /^\s*#{1,6}\s+(.*)$/.exec(line);
      if (h) heading = h[1].replace(/https?:\/\/\S+/g, '').replace(/[-:|\s]+$/, '').trim();

      // [label](url), <a href="url">label</a>, then bare URLs
      const found = [];
      for (const m of line.matchAll(/\[([^\]]*)\]\(\s*<?(https?:\/\/[^)\s>]+)>?[^)]*\)/g)) found.push({ url: m[2], label: m[1] });
      for (const m of line.matchAll(/<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) found.push({ url: m[1], label: m[2].replace(/<[^>]+>/g, '') });
      for (const m of line.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) found.push({ url: m[0], label: '' });

      for (const { url: rawUrl, label } of found) {
        const url = rawUrl.replace(/(<br\s*\/?>)+$/i, '').replace(/[.,;:!?*_~`'"]+$/, '');
        if (seen.has(url)) continue;
        seen.add(url);
        const before = line.slice(0, line.indexOf(rawUrl)).replace(/<[^>]+>|[#*>\-[\]()`_~]/g, ' ').replace(/\s+/g, ' ').trim();
        links.push({ url, label: (label || before || heading).slice(0, 80) });
      }
    }
    return links.slice(0, 30);
  }

  getAnalysisResult(repoUrl) {
    return this.analysisResults[repoUrl] || null;
  }
}

module.exports = UnityGrader;