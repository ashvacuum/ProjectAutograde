const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

class GitHubHelper {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.clonedRepos = new Map();
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

    const githubRegex = /^https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;
    return githubRegex.test(url.replace(/\.git$/, ''));
  }

  extractRepoInfo(url) {
    if (!this.isValidGitHubUrl(url)) {
      throw new Error('Invalid GitHub URL format');
    }

    const cleanUrl = url.replace(/\.git$/, '').replace(/\/$/, '');
    const parts = cleanUrl.split('/');

    if (parts.length < 5) {
      throw new Error('Unable to extract repository information from URL');
    }

    return {
      owner: parts[3],
      repo: parts[4],
      fullName: `${parts[3]}/${parts[4]}`,
      url: cleanUrl
    };
  }

  async cloneRepository(repoUrl, options = {}) {
    await this.ensureTempDir();

    if (!this.isValidGitHubUrl(repoUrl)) {
      throw new Error('Invalid GitHub repository URL');
    }

    const repoInfo = this.extractRepoInfo(repoUrl);
    const timestamp = Date.now();
    const projectDir = path.join(this.tempDir, `${repoInfo.repo}-${timestamp}`);

    const git = simpleGit();

    try {
      console.log(`Cloning repository: ${repoUrl} to ${projectDir}`);

      const cloneOptions = {
        '--depth': options.depth || 1, // Shallow clone by default
        '--single-branch': null,
        '--no-tags': null
      };

      if (options.branch) {
        cloneOptions['--branch'] = options.branch;
      }

      await git.clone(repoUrl, projectDir, cloneOptions);

      const cloneInfo = {
        url: repoUrl,
        path: projectDir,
        repoInfo: repoInfo,
        clonedAt: new Date().toISOString(),
        options: options
      };

      this.clonedRepos.set(projectDir, cloneInfo);

      console.log(`Successfully cloned repository to: ${projectDir}`);
      return cloneInfo;

    } catch (error) {
      // Clean up failed clone attempt
      try {
        await fs.rm(projectDir, { recursive: true, force: true });
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

  async getRepositoryInfo(projectPath) {
    if (!this.clonedRepos.has(projectPath)) {
      throw new Error('Repository path not found in tracked repositories');
    }

    const cloneInfo = this.clonedRepos.get(projectPath);
    const git = simpleGit(projectPath);

    try {
      // Get basic git information
      const status = await git.status();
      const log = await git.log({ maxCount: 5 });
      const remotes = await git.getRemotes(true);

      return {
        ...cloneInfo,
        gitInfo: {
          currentBranch: status.current,
          isClean: status.isClean(),
          ahead: status.ahead,
          behind: status.behind,
          recentCommits: log.all.map(commit => ({
            hash: commit.hash.substring(0, 8),
            message: commit.message,
            author: commit.author_name,
            date: commit.date
          })),
          remotes: remotes
        }
      };
    } catch (error) {
      console.warn('Failed to get git info:', error);
      return cloneInfo;
    }
  }

  async getFileHistory(projectPath, filePath) {
    const git = simpleGit(projectPath);

    try {
      const log = await git.log({
        file: filePath,
        maxCount: 10
      });

      return log.all.map(commit => ({
        hash: commit.hash.substring(0, 8),
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        file: filePath
      }));
    } catch (error) {
      console.warn(`Failed to get file history for ${filePath}:`, error);
      return [];
    }
  }

  async getBranchInfo(projectPath) {
    const git = simpleGit(projectPath);

    try {
      const branches = await git.branch(['-a']);
      const currentBranch = branches.current;
      const allBranches = branches.all;

      return {
        current: currentBranch,
        all: allBranches,
        remote: allBranches.filter(branch => branch.startsWith('remotes/')),
        local: allBranches.filter(branch => !branch.startsWith('remotes/'))
      };
    } catch (error) {
      console.warn('Failed to get branch info:', error);
      return {
        current: 'unknown',
        all: [],
        remote: [],
        local: []
      };
    }
  }

  async getCommitStats(projectPath) {
    const git = simpleGit(projectPath);

    try {
      const log = await git.log({ maxCount: 100 });

      const stats = {
        totalCommits: log.total,
        recentCommits: log.all.length,
        authors: {},
        commitsByDay: {},
        averageCommitsPerDay: 0
      };

      // Analyze commit patterns
      log.all.forEach(commit => {
        const author = commit.author_name;
        const date = new Date(commit.date).toDateString();

        // Count by author
        stats.authors[author] = (stats.authors[author] || 0) + 1;

        // Count by day
        stats.commitsByDay[date] = (stats.commitsByDay[date] || 0) + 1;
      });

      // Calculate average commits per day
      const dayCount = Object.keys(stats.commitsByDay).length;
      if (dayCount > 0) {
        stats.averageCommitsPerDay = log.all.length / dayCount;
      }

      return stats;
    } catch (error) {
      console.warn('Failed to get commit stats:', error);
      return {
        totalCommits: 0,
        recentCommits: 0,
        authors: {},
        commitsByDay: {},
        averageCommitsPerDay: 0
      };
    }
  }

  async validateRepositoryStructure(projectPath) {
    const validation = {
      isValidUnityProject: false,
      hasAssets: false,
      hasProjectSettings: false,
      hasScripts: false,
      hasScenes: false,
      structure: {
        rootFiles: [],
        directories: [],
        unityVersion: null,
        packageManifest: null
      },
      warnings: [],
      recommendations: []
    };

    try {
      const items = await fs.readdir(projectPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          validation.structure.directories.push(item.name);

          if (item.name === 'Assets') {
            validation.hasAssets = true;
            validation.hasScripts = await this.hasScriptsInDirectory(path.join(projectPath, 'Assets'));
            validation.hasScenes = await this.hasScenesInDirectory(path.join(projectPath, 'Assets'));
          }

          if (item.name === 'ProjectSettings') {
            validation.hasProjectSettings = true;
          }
        } else {
          validation.structure.rootFiles.push(item.name);
        }
      }

      // Check for Unity project indicators
      validation.isValidUnityProject = validation.hasAssets && validation.hasProjectSettings;

      // Get Unity version
      try {
        const versionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
        const versionContent = await fs.readFile(versionPath, 'utf-8');
        const versionMatch = versionContent.match(/m_EditorVersion:\s*(.+)/);
        if (versionMatch) {
          validation.structure.unityVersion = versionMatch[1].trim();
        }
      } catch (error) {
        validation.warnings.push('Could not read Unity version');
      }

      // Check package manifest
      try {
        const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        validation.structure.packageManifest = JSON.parse(manifestContent);
      } catch (error) {
        validation.warnings.push('Could not read package manifest');
      }

      // Generate recommendations
      if (!validation.isValidUnityProject) {
        validation.recommendations.push('This does not appear to be a Unity project. Ensure Assets and ProjectSettings folders are present.');
      }

      if (!validation.hasScripts) {
        validation.recommendations.push('No C# scripts found in the Assets folder. This may not be a programming assignment.');
      }

      if (!validation.hasScenes) {
        validation.recommendations.push('No Unity scenes found. Consider checking if the project includes scene files.');
      }

    } catch (error) {
      validation.warnings.push(`Error validating repository structure: ${error.message}`);
    }

    return validation;
  }

  async hasScriptsInDirectory(dirPath) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          if (await this.hasScriptsInDirectory(path.join(dirPath, item.name))) {
            return true;
          }
        } else if (item.name.endsWith('.cs')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async hasScenesInDirectory(dirPath) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          if (await this.hasScenesInDirectory(path.join(dirPath, item.name))) {
            return true;
          }
        } else if (item.name.endsWith('.unity')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async cleanup(projectPath) {
    try {
      if (projectPath && projectPath.includes('temp')) {
        await fs.rm(projectPath, { recursive: true, force: true });
        this.clonedRepos.delete(projectPath);
        console.log(`Cleaned up repository: ${projectPath}`);
        return true;
      } else {
        console.warn(`Skipping cleanup of non-temp directory: ${projectPath}`);
        return false;
      }
    } catch (error) {
      console.error(`Cleanup failed for ${projectPath}:`, error.message);
      return false;
    }
  }

  async cleanupAll() {
    const cleanupPromises = Array.from(this.clonedRepos.keys()).map(path => this.cleanup(path));
    const results = await Promise.allSettled(cleanupPromises);

    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value).length;

    console.log(`Cleanup completed: ${successful} successful, ${failed} failed`);
    return { successful, failed };
  }

  getClonedRepositories() {
    return Array.from(this.clonedRepos.values());
  }

  async getRepositorySize(projectPath) {
    try {
      const stats = await this.getDirectorySize(projectPath);
      return {
        totalSizeBytes: stats.size,
        totalSizeMB: Math.round(stats.size / (1024 * 1024) * 100) / 100,
        fileCount: stats.files,
        directoryCount: stats.directories
      };
    } catch (error) {
      console.warn('Failed to get repository size:', error);
      return {
        totalSizeBytes: 0,
        totalSizeMB: 0,
        fileCount: 0,
        directoryCount: 0
      };
    }
  }

  async getDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    let directoryCount = 0;

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          directoryCount++;
          const subStats = await this.getDirectorySize(fullPath);
          totalSize += subStats.size;
          fileCount += subStats.files;
          directoryCount += subStats.directories;
        } else {
          fileCount++;
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${dirPath}:`, error);
    }

    return {
      size: totalSize,
      files: fileCount,
      directories: directoryCount
    };
  }
}

module.exports = GitHubHelper;