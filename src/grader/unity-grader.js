const fs = require('fs').promises;
const path = require('path');
const GitCommands = require('../utils/git-commands');

class UnityGrader {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.currentProject = null;
    this.analysisResults = {};
    this.gitCommands = new GitCommands();
  }

  async analyzeProject(repoUrl, criteria) {
    // First, validate the repository URL and check if it exists
    if (!this.gitCommands.isValidGitHubUrl(repoUrl)) {
      return this.createFailedAnalysis(repoUrl, 'Invalid GitHub URL format', 0);
    }

    try {
      // Check if repository exists before attempting to clone
      const repoCheck = await this.gitCommands.checkRepositoryExists(repoUrl);
      if (!repoCheck.exists) {
        return this.createFailedAnalysis(repoUrl, repoCheck.error || 'Repository not found', 0);
      }

      // Clone the repository using git commands
      const cloneResult = await this.gitCommands.cloneRepository(repoUrl);
      if (!cloneResult.success) {
        return this.createFailedAnalysis(repoUrl, 'Failed to clone repository', 0);
      }

      this.currentProject = cloneResult.path;

      // Validate it's a Unity project
      const validation = await this.gitCommands.validateUnityProject(cloneResult.path);
      if (!validation.isValidUnityProject) {
        await this.cleanup(cloneResult.path);
        return this.createFailedAnalysis(repoUrl, 'Not a valid Unity project', 0);
      }

      // If we have warnings but it's still a valid project, continue
      if (validation.warnings.length > 0) {
        console.warn(`Unity project warnings for ${repoUrl}:`, validation.warnings);
      }

      // Perform the actual analysis
      const projectStructure = await this.analyzeProjectStructure(cloneResult.path);
      const csharpFiles = await this.findCSharpFiles(cloneResult.path);
      const codeAnalysis = await this.analyzeCSharpCode(csharpFiles);
      const unitySpecific = await this.analyzeUnitySpecifics(cloneResult.path);
      const gitInfo = await this.gitCommands.getRepositoryInfo(cloneResult.path);

      const analysis = {
        repoUrl,
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

      this.analysisResults[repoUrl] = analysis;

      // Cleanup the cloned repository
      await this.cleanup(cloneResult.path);

      return analysis;

    } catch (error) {
      if (this.currentProject) {
        await this.cleanup(this.currentProject);
      }

      console.error(`Project analysis failed for ${repoUrl}:`, error.message);
      return this.createFailedAnalysis(repoUrl, error.message, 0);
    }
  }

  createFailedAnalysis(repoUrl, errorMessage, score = 0) {
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

  getAnalysisResult(repoUrl) {
    return this.analysisResults[repoUrl] || null;
  }
}

module.exports = UnityGrader;