const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');

/**
 * Git and filesystem helpers for cloning and inspecting student repositories.
 *
 * All git operations go through simple-git, which passes arguments as an array
 * to the git binary (no shell string interpolation) — student-supplied repo
 * URLs and branch names can never be interpreted as shell. Filesystem scans
 * use fs APIs rather than spawning `dir` / `find` / `rm`.
 */
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

  isValidGitHubUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const githubRegex = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/;
    const cleanUrl = url.replace(/\.git$/, '').trim();
    return githubRegex.test(cleanUrl);
  }

  async checkRepositoryExists(repoUrl) {
    if (!this.isValidGitHubUrl(repoUrl)) {
      return { exists: false, error: 'Invalid GitHub URL format' };
    }

    try {
      // listRemote passes args as an array — repoUrl is never shell-evaluated.
      await simpleGit().listRemote(['--heads', repoUrl]);
      console.log('   ✅ Repository is public and accessible');
      return { exists: true, accessible: true };
    } catch (error) {
      const errorMessage = (error.message || '').toLowerCase();

      if (errorMessage.includes('repository not found') || errorMessage.includes('could not read from remote')) {
        return { exists: false, accessible: false, error: 'Repository not found or not accessible' };
      } else if (
        errorMessage.includes('authentication') ||
        errorMessage.includes('permission') ||
        errorMessage.includes('credentials') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('403')
      ) {
        return { exists: true, accessible: false, error: 'Repository is private or requires authentication' };
      }
      return { exists: false, accessible: false, error: `Repository check failed: ${error.message}` };
    }
  }

  async cloneRepository(repoUrl, options = {}) {
    await this.ensureTempDir();

    const repoCheck = await this.checkRepositoryExists(repoUrl);
    if (!repoCheck.exists) {
      throw new Error(repoCheck.error || 'Repository does not exist');
    }

    const repoName = this.extractRepoName(repoUrl);
    const projectDir = path.join(this.tempDir, `${repoName}-${Date.now()}`);

    const cloneArgs = ['--depth', '1', '--single-branch'];
    if (options.branch) {
      cloneArgs.push('--branch', options.branch);
    }

    try {
      console.log(`Cloning repository: ${repoUrl} to ${projectDir}`);
      await simpleGit().clone(repoUrl, projectDir, cloneArgs);
      console.log(`Successfully cloned repository to: ${projectDir}`);

      return {
        success: true,
        path: projectDir,
        url: repoUrl,
        clonedAt: new Date().toISOString()
      };
    } catch (error) {
      // Clean up a partial clone before surfacing the error.
      try {
        await this.deleteDirectory(projectDir);
      } catch (cleanupError) {
        console.warn('Failed to cleanup after clone error:', cleanupError);
      }

      const msg = error.message || '';
      if (msg.includes('Repository not found')) {
        throw new Error('Repository not found. Please check the URL and ensure the repository is public or you have access.');
      } else if (msg.includes('Authentication failed')) {
        throw new Error('Authentication failed. For private repositories, please provide a GitHub token.');
      } else if (/network/i.test(msg)) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw new Error(`Failed to clone repository: ${msg}`);
    }
  }

  async deleteDirectory(dirPath) {
    try {
      // Guard: only ever delete inside our temp directory.
      const resolved = path.resolve(dirPath);
      if (!resolved.startsWith(path.resolve(this.tempDir))) {
        console.warn(`Skipping deletion of non-temp directory: ${dirPath}`);
        return false;
      }
      await fs.rm(resolved, { recursive: true, force: true });
      console.log(`Deleted directory: ${resolved}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete directory ${dirPath}:`, error.message);
      return false;
    }
  }

  async getRepositoryInfo(projectPath) {
    try {
      const git = simpleGit(projectPath);
      const results = {};

      const tryGet = async (key, fn) => {
        try {
          results[key] = await fn();
        } catch (error) {
          results[key] = null;
          console.warn(`Failed to get ${key}:`, error.message);
        }
      };

      await tryGet('branch', async () => (await git.branch()).current);
      await tryGet('hash', async () => (await git.revparse(['--short', 'HEAD'])).trim());
      await tryGet('lastCommit', async () => {
        const log = await git.log(['-1', '--pretty=format:%h %s %an %ad', '--date=short']);
        return log.latest ? log.latest.hash : null;
      });
      await tryGet('remoteUrl', async () => {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
        return origin ? origin.refs.fetch : null;
      });
      await tryGet('isClean', async () => (await git.status()).isClean());

      return {
        currentBranch: results.branch,
        commitHash: results.hash,
        lastCommit: results.lastCommit,
        remoteUrl: results.remoteUrl,
        isClean: results.isClean !== false,
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
    const validation = {
      isValidUnityProject: false,
      hasAssets: false,
      hasProjectSettings: false,
      hasScripts: false,
      hasScenes: false,
      errors: [],
      warnings: []
    };

    try {
      try {
        await fs.access(path.join(projectPath, 'Assets'));
        validation.hasAssets = true;
      } catch (error) {
        validation.errors.push('Assets folder not found');
      }

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

      validation.hasScripts = await this.hasFilesWithExtension(projectPath, '.cs');
      if (!validation.hasScripts) {
        validation.warnings.push('No C# scripts found');
      }

      validation.hasScenes = await this.hasFilesWithExtension(projectPath, '.unity');
      if (!validation.hasScenes) {
        validation.warnings.push('No Unity scenes found');
      }

      return validation;
    } catch (error) {
      validation.errors.push(`Validation failed: ${error.message}`);
      return validation;
    }
  }

  // Recursively collect files with the given extension, skipping .git.
  async _walkForExtension(dirPath, extension, results, limit = Infinity) {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      return results;
    }

    for (const entry of entries) {
      if (results.length >= limit) return results;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this._walkForExtension(fullPath, extension, results, limit);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension.toLowerCase())) {
        results.push(fullPath);
      }
    }
    return results;
  }

  async hasFilesWithExtension(dirPath, extension) {
    const found = await this._walkForExtension(dirPath, extension, [], 1);
    return found.length > 0;
  }

  async findCSharpFiles(projectPath) {
    try {
      return await this._walkForExtension(projectPath, '.cs', []);
    } catch (error) {
      console.warn('Failed to find C# files:', error);
      return [];
    }
  }

  extractRepoName(repoUrl) {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      return (pathParts[pathParts.length - 1] || 'unknown-repo').replace(/\.git$/, '');
    } catch (error) {
      return 'unknown-repo';
    }
  }
}

module.exports = GitCommands;
