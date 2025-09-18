const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const express = require('express');

// Import our custom modules
const CanvasAuth = require('./src/canvas/canvas-auth');
const UnityGrader = require('./src/grader/unity-grader');
const ClaudeCodeIntegration = require('./src/grader/claude-code-integration');
const CriteriaManager = require('./src/criteria/criteria-manager');
const ResultsExporter = require('./src/grader/results-exporter');

const store = new Store();
let mainWindow;
let serverApp;
let server;

// Initialize service instances
const canvasAuth = new CanvasAuth();
const unityGrader = new UnityGrader();
const claudeCode = new ClaudeCodeIntegration();
const criteriaManager = new CriteriaManager();
const resultsExporter = new ResultsExporter();

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: !isDev,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // Filter out autofill console errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      return; // Suppress these specific console messages
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createExpressServer() {
  serverApp = express();
  serverApp.use(express.json());

  serverApp.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Try different ports if 3001 is in use
  const tryPorts = [3001, 3002, 3003, 3004, 3005];

  function tryPort(portIndex) {
    if (portIndex >= tryPorts.length) {
      console.error('All ports are in use, server not started');
      return;
    }

    const port = tryPorts[portIndex];
    server = serverApp.listen(port, () => {
      console.log(`Unity Auto-Grader server running on port ${port}`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, trying next port...`);
        tryPort(portIndex + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  }

  tryPort(0);
}

app.whenReady().then(() => {
  createWindow();
  createExpressServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('show-error-dialog', async (event, title, content) => {
  const result = await dialog.showErrorBox(title, content);
  return result;
});

ipcMain.handle('show-info-dialog', async (event, title, content) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: title,
    message: content,
    buttons: ['OK']
  });
  return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

// Canvas API IPC Handlers
ipcMain.handle('canvas-authenticate', async (event, apiUrl, token) => {
  try {
    return await canvasAuth.authenticate(apiUrl, token);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('canvas-get-courses', async () => {
  try {
    const api = canvasAuth.getAPI();
    return await api.getCourses();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('canvas-get-assignments', async (event, courseId) => {
  try {
    const api = canvasAuth.getAPI();
    return await api.getAssignments(courseId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('canvas-get-submissions', async (event, courseId, assignmentId) => {
  try {
    const api = canvasAuth.getAPI();
    return await api.getSubmissions(courseId, assignmentId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('canvas-post-grade', async (event, courseId, assignmentId, userId, grade, comment) => {
  try {
    const api = canvasAuth.getAPI();
    return await api.postGrade(courseId, assignmentId, userId, grade, comment);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Unity Grader IPC Handlers
ipcMain.handle('grader-analyze-project', async (event, repoUrl, criteria, assignmentDetails = null) => {
  try {
    // Send progress updates to the renderer
    mainWindow.webContents.send('grading-progress', {
      current: 1,
      total: 1,
      percentage: 0,
      currentStudent: 'Analyzing project...'
    });

    const analysis = await unityGrader.analyzeProject(repoUrl, criteria);

    mainWindow.webContents.send('grading-progress', {
      current: 1,
      total: 1,
      percentage: 50,
      currentStudent: 'Generating grade...'
    });

    // If Claude Code is available, use it for grading
    if (await claudeCode.initialize()) {
      const gradingResult = await claudeCode.analyzeUnityProject(analysis, criteria, assignmentDetails);

      mainWindow.webContents.send('grading-progress', {
        current: 1,
        total: 1,
        percentage: 100,
        currentStudent: 'Complete'
      });

      return {
        success: true,
        analysis: analysis,
        grade: gradingResult
      };
    } else {
      // Fallback to basic analysis without Claude Code
      mainWindow.webContents.send('grading-progress', {
        current: 1,
        total: 1,
        percentage: 100,
        currentStudent: 'Complete (basic analysis)'
      });

      return {
        success: true,
        analysis: analysis,
        grade: null,
        warning: 'Claude Code not available - basic analysis only'
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('grader-get-progress', () => {
  // Return current grading progress if any
  return { active: false, progress: 0 };
});

ipcMain.handle('grader-cancel', () => {
  // Cancel current grading operation
  return { success: true };
});

// Claude Code Integration IPC Handlers
ipcMain.handle('claude-code-analyze', async (event, code, criteria, context) => {
  try {
    if (!await claudeCode.initialize()) {
      return { success: false, error: 'Claude Code not available' };
    }

    return await claudeCode.analyzeUnityProject(context, criteria);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude-code-get-result', async (event, taskId) => {
  try {
    if (taskId === 'status') {
      return await claudeCode.getAvailabilityStatus();
    }
    return await claudeCode.getAnalysisResult(taskId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File System and Git IPC Handlers
ipcMain.handle('git-clone-repo', async (event, url, destination) => {
  try {
    // This functionality is handled by the UnityGrader
    return { success: true, path: destination };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('git-delete-repo', async (event, path) => {
  try {
    await unityGrader.cleanup(path);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('files-read-file', async (event, filePath) => {
  try {
    const fs = require('fs').promises;
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('files-write-file', async (event, filePath, content) => {
  try {
    const fs = require('fs').promises;
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('files-delete-file', async (event, filePath) => {
  try {
    const fs = require('fs').promises;
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('files-ensure-dir', async (event, dirPath) => {
  try {
    const fs = require('fs').promises;
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('files-list-files', async (event, dirPath, pattern) => {
  try {
    const fs = require('fs').promises;
    const files = await fs.readdir(dirPath);

    if (pattern) {
      const filteredFiles = files.filter(file => file.includes(pattern));
      return { success: true, files: filteredFiles };
    }

    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export IPC Handlers
ipcMain.handle('export-to-csv', async (event, data, filename) => {
  try {
    const result = await resultsExporter.exportToCsv(data, filename);
    return { success: true, path: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-to-json', async (event, data, filename) => {
  try {
    const result = await resultsExporter.exportToJson(data, filename);
    return { success: true, path: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-to-pdf', async (event, data, filename) => {
  try {
    const result = await resultsExporter.exportToPdf(data, filename);
    return { success: true, path: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Initialize Claude Code on startup
app.whenReady().then(async () => {
  try {
    const isAvailable = await claudeCode.initialize();
    if (isAvailable) {
      console.log('✅ Claude Code integration ready');
    } else {
      console.log('⚠️  Claude Code not found - basic analysis mode enabled');
    }
  } catch (error) {
    console.log('⚠️  Claude Code initialization error:', error.message);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (mainWindow) {
    mainWindow.webContents.send('app-error', {
      type: 'uncaught-exception',
      message: error.message,
      stack: error.stack
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (mainWindow) {
    mainWindow.webContents.send('app-error', {
      type: 'unhandled-rejection',
      message: reason.message || reason,
      stack: reason.stack
    });
  }
});