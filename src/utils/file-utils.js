const fs = require('fs').promises;
const path = require('path');

class FileUtils {
  constructor() {
    this.supportedExtensions = {
      code: ['.cs', '.js', '.ts', '.cpp', '.h', '.py', '.java'],
      unity: ['.unity', '.prefab', '.mat', '.asset'],
      images: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tga'],
      audio: ['.wav', '.mp3', '.ogg', '.aiff'],
      video: ['.mp4', '.avi', '.mov', '.wmv'],
      documents: ['.txt', '.md', '.pdf', '.doc', '.docx'],
      config: ['.json', '.xml', '.yaml', '.yml', '.ini', '.cfg']
    };
  }

  async readFileContent(filePath, encoding = 'utf-8') {
    try {
      const content = await fs.readFile(filePath, encoding);
      const stats = await fs.stat(filePath);

      return {
        content: content,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        extension: path.extname(filePath),
        filename: path.basename(filePath),
        relativePath: filePath
      };
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  async writeFileContent(filePath, content, options = {}) {
    try {
      const dirPath = path.dirname(filePath);
      await this.ensureDirectory(dirPath);

      const writeOptions = {
        encoding: options.encoding || 'utf-8',
        flag: options.overwrite !== false ? 'w' : 'wx'
      };

      await fs.writeFile(filePath, content, writeOptions);

      const stats = await fs.stat(filePath);
      return {
        path: filePath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  async deleteDirectory(dirPath, recursive = false) {
    try {
      if (recursive) {
        await fs.rm(dirPath, { recursive: true, force: true });
      } else {
        await fs.rmdir(dirPath);
      }
      return true;
    } catch (error) {
      throw new Error(`Failed to delete directory ${dirPath}: ${error.message}`);
    }
  }

  async copyFile(sourcePath, destPath, overwrite = false) {
    try {
      const destDir = path.dirname(destPath);
      await this.ensureDirectory(destDir);

      const flags = overwrite ? 0 : fs.constants.COPYFILE_EXCL;
      await fs.copyFile(sourcePath, destPath, flags);

      return true;
    } catch (error) {
      throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error.message}`);
    }
  }

  async listFiles(dirPath, options = {}) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();

          // Apply extension filter if specified
          if (options.extensions && !options.extensions.includes(ext)) {
            continue;
          }

          // Apply pattern filter if specified
          if (options.pattern && !item.name.includes(options.pattern)) {
            continue;
          }

          const stats = await fs.stat(fullPath);

          files.push({
            name: item.name,
            path: fullPath,
            relativePath: path.relative(dirPath, fullPath),
            extension: ext,
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime,
            isFile: true,
            isDirectory: false
          });
        } else if (item.isDirectory() && options.includeDirectories) {
          const stats = await fs.stat(fullPath);

          files.push({
            name: item.name,
            path: fullPath,
            relativePath: path.relative(dirPath, fullPath),
            extension: '',
            size: 0,
            modified: stats.mtime,
            created: stats.birthtime,
            isFile: false,
            isDirectory: true
          });

          // Recursively include subdirectory files if requested
          if (options.recursive) {
            const subFiles = await this.listFiles(fullPath, options);
            files.push(...subFiles);
          }
        }
      }

      // Sort files if requested
      if (options.sortBy) {
        files.sort((a, b) => {
          switch (options.sortBy) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'size':
              return b.size - a.size;
            case 'modified':
              return new Date(b.modified) - new Date(a.modified);
            case 'extension':
              return a.extension.localeCompare(b.extension);
            default:
              return 0;
          }
        });
      }

      return files;
    } catch (error) {
      throw new Error(`Failed to list files in ${dirPath}: ${error.message}`);
    }
  }

  async findFiles(dirPath, criteria) {
    try {
      const allFiles = await this.listFiles(dirPath, { recursive: true });

      return allFiles.filter(file => {
        // Check filename pattern
        if (criteria.namePattern && !file.name.match(criteria.namePattern)) {
          return false;
        }

        // Check extension
        if (criteria.extensions && !criteria.extensions.includes(file.extension)) {
          return false;
        }

        // Check file size
        if (criteria.minSize && file.size < criteria.minSize) {
          return false;
        }
        if (criteria.maxSize && file.size > criteria.maxSize) {
          return false;
        }

        // Check modification date
        if (criteria.modifiedAfter && new Date(file.modified) < new Date(criteria.modifiedAfter)) {
          return false;
        }
        if (criteria.modifiedBefore && new Date(file.modified) > new Date(criteria.modifiedBefore)) {
          return false;
        }

        return true;
      });
    } catch (error) {
      throw new Error(`Failed to find files in ${dirPath}: ${error.message}`);
    }
  }

  async searchInFiles(dirPath, searchTerm, options = {}) {
    try {
      const files = await this.listFiles(dirPath, {
        recursive: true,
        extensions: options.extensions || this.supportedExtensions.code
      });

      const results = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(file.path, 'utf-8');
          const lines = content.split('\n');
          const matches = [];

          lines.forEach((line, index) => {
            const regex = options.caseSensitive
              ? new RegExp(searchTerm, 'g')
              : new RegExp(searchTerm, 'gi');

            const lineMatches = line.match(regex);
            if (lineMatches) {
              matches.push({
                lineNumber: index + 1,
                lineContent: line.trim(),
                matchCount: lineMatches.length
              });
            }
          });

          if (matches.length > 0) {
            results.push({
              file: file,
              matches: matches,
              totalMatches: matches.reduce((sum, match) => sum + match.matchCount, 0)
            });
          }
        } catch (error) {
          console.warn(`Could not search in file ${file.path}:`, error.message);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to search in files: ${error.message}`);
    }
  }

  async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      return {
        path: filePath,
        filename: path.basename(filePath),
        extension: path.extname(filePath),
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        lineCount: lines.length,
        characterCount: content.length,
        nonEmptyLines: lines.filter(line => line.trim().length > 0).length,
        isReadOnly: !(stats.mode & parseInt('200', 8)),
        permissions: stats.mode.toString(8)
      };
    } catch (error) {
      throw new Error(`Failed to get file stats for ${filePath}: ${error.message}`);
    }
  }

  async getDirectoryStats(dirPath) {
    try {
      const files = await this.listFiles(dirPath, { recursive: true });

      const stats = {
        path: dirPath,
        totalFiles: files.length,
        totalSize: 0,
        filesByExtension: {},
        largestFile: null,
        oldestFile: null,
        newestFile: null,
        averageFileSize: 0
      };

      files.forEach(file => {
        if (file.isFile) {
          stats.totalSize += file.size;

          // Count by extension
          const ext = file.extension || 'no-extension';
          stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

          // Find largest file
          if (!stats.largestFile || file.size > stats.largestFile.size) {
            stats.largestFile = file;
          }

          // Find oldest file
          if (!stats.oldestFile || new Date(file.created) < new Date(stats.oldestFile.created)) {
            stats.oldestFile = file;
          }

          // Find newest file
          if (!stats.newestFile || new Date(file.modified) > new Date(stats.newestFile.modified)) {
            stats.newestFile = file;
          }
        }
      });

      stats.averageFileSize = stats.totalFiles > 0 ? stats.totalSize / stats.totalFiles : 0;
      stats.totalSizeFormatted = this.formatFileSize(stats.totalSize);

      return stats;
    } catch (error) {
      throw new Error(`Failed to get directory stats for ${dirPath}: ${error.message}`);
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileCategory(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    for (const [category, extensions] of Object.entries(this.supportedExtensions)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }

    return 'other';
  }

  async validateFilePath(filePath) {
    try {
      await fs.access(filePath);
      return { exists: true, accessible: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { exists: false, accessible: false, error: 'File does not exist' };
      } else if (error.code === 'EACCES') {
        return { exists: true, accessible: false, error: 'Permission denied' };
      } else {
        return { exists: false, accessible: false, error: error.message };
      }
    }
  }

  async createBackup(filePath, backupSuffix = '.backup') {
    try {
      const backupPath = filePath + backupSuffix;
      await this.copyFile(filePath, backupPath, true);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup of ${filePath}: ${error.message}`);
    }
  }

  async restoreBackup(originalPath, backupPath) {
    try {
      await this.copyFile(backupPath, originalPath, true);
      return true;
    } catch (error) {
      throw new Error(`Failed to restore backup from ${backupPath}: ${error.message}`);
    }
  }

  generateTempPath(baseName, extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${baseName}_${timestamp}_${random}${extension}`;

    return path.join(require('os').tmpdir(), 'unity-auto-grader', filename);
  }

  async cleanupTempFiles(olderThanHours = 24) {
    try {
      const tempDir = path.join(require('os').tmpdir(), 'unity-auto-grader');
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);

      const files = await this.listFiles(tempDir, { recursive: true });
      let deletedCount = 0;

      for (const file of files) {
        if (new Date(file.created).getTime() < cutoffTime) {
          try {
            await this.deleteFile(file.path);
            deletedCount++;
          } catch (error) {
            console.warn(`Failed to delete temp file ${file.path}:`, error.message);
          }
        }
      }

      return { deletedCount, totalFiles: files.length };
    } catch (error) {
      console.warn('Failed to cleanup temp files:', error.message);
      return { deletedCount: 0, totalFiles: 0 };
    }
  }
}

module.exports = FileUtils;