const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class GitCommands {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async executeCommand(command, cwd = null) {
    return new Promise((resolve, reject) => {
      const options = cwd ? { cwd } : {};

      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\nError: ${error.message}\nStderr: ${stderr}`));
        } else {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      });
    });
  }

  isValidGitHubUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const githubRegex = /^https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;
    return githubRegex.test(url.replace(/\.git$/, ''));
  }

  async checkGitInstallation() {
    try {
      const result = await this.executeCommand('git --version');
      return {
        installed: true,
        version: result.stdout
      };
    } catch (error) {
      return {
        installed: false,
        error: 'Git is not installed or not available in PATH'
      };
    }
  }

  async checkRepositoryExists(repoUrl) {
    try {
      if (!this.isValidGitHubUrl(repoUrl)) {
        return {
          exists: false,
          error: 'Invalid GitHub URL format'
        };
      }

      // Use git ls-remote to check if repository exists without cloning
      const command = `git ls-remote --heads "${repoUrl}"`;
      await this.executeCommand(command);

      return {
        exists: true,
        accessible: true
      };
    } catch (error) {
      if (error.message.includes('Repository not found')) {
        return {
          exists: false,
          error: 'Repository not found or not accessible'
        };
      } else if (error.message.includes('Authentication failed')) {
        return {
          exists: true,
          accessible: false,
          error: 'Authentication required for private repository'
        };
      } else {
        return {
          exists: false,
          error: `Repository check failed: ${error.message}`
        };
      }
    }
  }

  async cloneRepository(repoUrl, options = {}) {
    await this.ensureTempDir();

    // First check if repository exists
    const repoCheck = await this.checkRepositoryExists(repoUrl);
    if (!repoCheck.exists) {
      throw new Error(repoCheck.error || 'Repository does not exist');
    }

    const repoName = this.extractRepoName(repoUrl);
    const timestamp = Date.now();
    const projectDir = path.join(this.tempDir, `${repoName}-${timestamp}`);

    try {
      console.log(`Cloning repository: ${repoUrl} to ${projectDir}`);

      // Build git clone command
      let cloneCommand = `git clone --depth 1 --single-branch`;

      if (options.branch) {
        cloneCommand += ` --branch "${options.branch}"`;
      }

      cloneCommand += ` "${repoUrl}" "${projectDir}"`;

      await this.executeCommand(cloneCommand);

      console.log(`Successfully cloned repository to: ${projectDir}`);

      return {
        success: true,
        path: projectDir,
        url: repoUrl,
        clonedAt: new Date().toISOString()
      };

    } catch (error) {
      // Clean up failed clone attempt
      try {
        await this.deleteDirectory(projectDir);
      } catch (cleanupError) {
        console.warn('Failed to cleanup after clone error:', cleanupError);
      }

      // Provide more specific error messages
      if (error.message.includes('Repository not found')) {
        throw new Error('Repository not found. Please check the URL and ensure the repository is public or you have access.');
      } else if (error.message.includes('Authentication failed')) {
        throw new Error('Authentication failed. For private repositories, please provide a GitHub token.');
      } else if (error.message.includes('network')) {
        throw new Error('Network error. Please check your internet connection.');
      } else {
        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    }
  }

  async deleteDirectory(dirPath) {
    try {
      if (dirPath && dirPath.includes('temp')) {
        if (process.platform === 'win32') {
          await this.executeCommand(`rmdir /s /q "${dirPath}"`);
        } else {
          await this.executeCommand(`rm -rf "${dirPath}"`);
        }
        console.log(`Deleted directory: ${dirPath}`);
        return true;
      } else {
        console.warn(`Skipping deletion of non-temp directory: ${dirPath}`);
        return false;
      }
    } catch (error) {
      console.error(`Failed to delete directory ${dirPath}:`, error.message);
      return false;
    }
  }

  async getRepositoryInfo(projectPath) {
    try {
      const commands = {
        branch: 'git rev-parse --abbrev-ref HEAD',
        hash: 'git rev-parse --short HEAD',
        lastCommit: 'git log -1 --pretty=format:"%h %s %an %ad" --date=short',
        remoteUrl: 'git config --get remote.origin.url',
        status: 'git status --porcelain'
      };

      const results = {};

      for (const [key, command] of Object.entries(commands)) {
        try {
          const result = await this.executeCommand(command, projectPath);
          results[key] = result.stdout;
        } catch (error) {
          results[key] = null;
          console.warn(`Failed to get ${key}:`, error.message);
        }
      }

      return {
        currentBranch: results.branch,
        commitHash: results.hash,
        lastCommit: results.lastCommit,
        remoteUrl: results.remoteUrl,
        isClean: !results.status || results.status.length === 0,
        path: projectPath
      };
    } catch (error) {
      console.warn('Failed to get repository info:', error);
      return {
        currentBranch: 'unknown',
        commitHash: 'unknown',
        lastCommit: 'unknown',
        remoteUrl: 'unknown',
        isClean: true,
        path: projectPath
      };
    }
  }

  async validateUnityProject(projectPath) {
    try {
      const validation = {
        isValidUnityProject: false,
        hasAssets: false,
        hasProjectSettings: false,
        hasScripts: false,
        hasScenes: false,
        errors: [],
        warnings: []
      };

      // Check if Assets folder exists
      try {
        await fs.access(path.join(projectPath, 'Assets'));
        validation.hasAssets = true;
      } catch (error) {
        validation.errors.push('Assets folder not found');
      }

      // Check if ProjectSettings folder exists
      try {
        await fs.access(path.join(projectPath, 'ProjectSettings'));
        validation.hasProjectSettings = true;
      } catch (error) {
        validation.errors.push('ProjectSettings folder not found');
      }

      validation.isValidUnityProject = validation.hasAssets && validation.hasProjectSettings;

      if (!validation.isValidUnityProject) {
        validation.errors.push('Not a valid Unity project');
        return validation;
      }

      // Check for C# scripts
      validation.hasScripts = await this.hasFilesWithExtension(projectPath, '.cs');
      if (!validation.hasScripts) {
        validation.warnings.push('No C# scripts found');
      }

      // Check for Unity scenes
      validation.hasScenes = await this.hasFilesWithExtension(projectPath, '.unity');
      if (!validation.hasScenes) {
        validation.warnings.push('No Unity scenes found');
      }

      return validation;
    } catch (error) {
      return {
        isValidUnityProject: false,
        hasAssets: false,
        hasProjectSettings: false,
        hasScripts: false,
        hasScenes: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: []
      };
    }
  }

  async hasFilesWithExtension(dirPath, extension) {
    try {
      if (process.platform === 'win32') {
        const command = `dir /s /b "${dirPath}\\*${extension}" 2>nul`;
        const result = await this.executeCommand(command);
        return result.stdout.length > 0;
      } else {
        const command = `find "${dirPath}" -name "*${extension}" -type f 2>/dev/null | head -1`;
        const result = await this.executeCommand(command);
        return result.stdout.length > 0;
      }
    } catch (error) {
      return false;
    }
  }

  async findCSharpFiles(projectPath) {
    try {
      let command;
      if (process.platform === 'win32') {
        command = `dir /s /b "${projectPath}\\*.cs" 2>nul`;
      } else {
        command = `find "${projectPath}" -name "*.cs" -type f 2>/dev/null`;
      }

      const result = await this.executeCommand(command);
      return result.stdout.split(/\r?\n/).filter(line => line.trim().length > 0);
    } catch (error) {
      console.warn('Failed to find C# files:', error);
      return [];
    }
  }

  extractRepoName(repoUrl) {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      return pathParts[pathParts.length - 1].replace('.git', '') || 'unknown-repo';
    } catch (error) {
      return 'unknown-repo';
    }
  }

  async setupProjectRemote() {
    try {
      const remoteUrl = 'https://github.com/ashvacuum/ProjectAutograde.git';

      // Check if we're in a git repository
      try {
        await this.executeCommand('git status');
      } catch (error) {
        // Initialize git repository
        await this.executeCommand('git init');
        console.log('Initialized git repository');
      }

      // Check if remote already exists
      try {
        const result = await this.executeCommand('git remote get-url origin');
        if (result.stdout === remoteUrl) {
          console.log('Remote origin already set correctly');
          return true;
        } else {
          // Update existing remote
          await this.executeCommand(`git remote set-url origin "${remoteUrl}"`);
          console.log('Updated remote origin URL');
        }
      } catch (error) {
        // Add new remote
        await this.executeCommand(`git remote add origin "${remoteUrl}"`);
        console.log('Added remote origin');
      }

      return true;
    } catch (error) {
      console.error('Failed to setup project remote:', error);
      return false;
    }
  }

  async commitAndPush(message = 'Auto-grader application update') {
    try {
      // Add all files
      await this.executeCommand('git add .');

      // Check if there are changes to commit
      try {
        await this.executeCommand('git diff --cached --exit-code');
        console.log('No changes to commit');
        return { success: true, message: 'No changes to commit' };
      } catch (error) {
        // There are changes to commit (git diff returns non-zero exit code)
      }

      // Commit changes
      await this.executeCommand(`git commit -m "${message}"`);
      console.log('Changes committed');

      // Push to remote
      await this.executeCommand('git push origin main');
      console.log('Changes pushed to remote');

      return { success: true, message: 'Changes committed and pushed successfully' };
    } catch (error) {
      console.error('Failed to commit and push:', error);
      return { success: false, error: error.message };
    }
  }

  async pullLatest() {
    try {
      await this.executeCommand('git pull origin main');
      console.log('Pulled latest changes from remote');
      return { success: true, message: 'Successfully pulled latest changes' };
    } catch (error) {
      console.error('Failed to pull latest changes:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = GitCommands;