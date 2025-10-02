const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const express = require('express');

// Load environment variables
require('dotenv').config();

// Import our custom modules
const CanvasAuth = require('./src/canvas/canvas-auth');
const UnityGrader = require('./src/grader/unity-grader');
const LLMIntegration = require('./src/grader/llm-integration');
const CriteriaManager = require('./src/criteria/criteria-manager');
const ResultsExporter = require('./src/grader/results-exporter');
const APIKeyManager = require('./src/utils/api-key-manager');
const LatePenaltyCalculator = require('./src/utils/late-penalty-calculator');

const store = new Store();
let mainWindow;
let serverApp;
let server;

// Initialize service instances
const canvasAuth = new CanvasAuth();
const unityGrader = new UnityGrader();
const apiKeyManager = new APIKeyManager();
const llmIntegration = new LLMIntegration(apiKeyManager);
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
      preload: path.join(__dirname, 'preload.js'),
      // Disable autofill to prevent console warnings
      autofillEnabled: false,
      enableWebSQL: false,
      experimentalFeatures: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // Filter out autofill console errors using the new event format
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Suppress autofill-related console errors
    if (message && (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses'))) {
      event.preventDefault?.();
      return;
    }

    // Log other console messages in development
    if (isDev && level >= 2) { // Only show warnings and errors
      console.log(`Console [${level}]:`, message);
    }
  });

  if (isDev) {
    // Open DevTools with reduced noise
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Disable some DevTools features that cause warnings
    mainWindow.webContents.once('devtools-opened', () => {
      mainWindow.webContents.devToolsWebContents?.executeJavaScript(`
        // Suppress autofill warnings in DevTools
        const originalError = console.error;
        console.error = function(...args) {
          const message = args.join(' ');
          if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
            return;
          }
          originalError.apply(console, args);
        };
      `);
    });
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

app.whenReady().then(async () => {
  createWindow();
  createExpressServer();

  // Load stored Canvas credentials on startup
  try {
    const canvasResult = await canvasAuth.loadStoredCredentials();
    if (canvasResult.success) {
      console.log('✅ Canvas credentials loaded successfully');
    } else {
      console.log('ℹ️  No stored Canvas credentials found');
    }
  } catch (error) {
    console.log('⚠️  Canvas credentials check failed:', error.message);
  }

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
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('🎓 GRADING REQUEST RECEIVED');
  console.log('========================================');
  console.log('Repository:', repoUrl);
  console.log('Has Criteria:', !!criteria);
  console.log('Has Assignment Details:', !!assignmentDetails);
  console.log('Timestamp:', new Date().toISOString());
  console.log('========================================\n');

  try {
    // Ensure all data is serializable
    const cleanCriteria = JSON.parse(JSON.stringify(criteria));
    const cleanAssignmentDetails = assignmentDetails ? JSON.parse(JSON.stringify(assignmentDetails)) : null;

    console.log('✅ Data serialization successful');

    // Send progress updates to the renderer
    mainWindow.webContents.send('grading-progress', {
      current: 1,
      total: 1,
      percentage: 0,
      currentStudent: 'Analyzing project...'
    });

    console.log('📂 Step 1/3: Cloning and analyzing Unity project...');
    const analysis = await unityGrader.analyzeProject(repoUrl, cleanCriteria);
    console.log('✅ Unity project analysis complete');
    console.log('   - Files found:', analysis.codeFiles?.length || 0);
    console.log('   - Valid Unity project:', analysis.success);

    mainWindow.webContents.send('grading-progress', {
      current: 1,
      total: 1,
      percentage: 50,
      currentStudent: 'Generating grade...'
    });

    console.log('🤖 Step 2/3: Initializing LLM integration...');
    // If LLM is available, use it for grading
    if (await llmIntegration.initialize()) {
      console.log('✅ LLM initialized successfully');
      console.log('   Provider:', llmIntegration.activeProvider?.provider || 'unknown');

      console.log('📝 Step 3/3: Sending to LLM for grading...');
      const gradingResult = await llmIntegration.analyzeUnityProject(analysis, cleanCriteria, cleanAssignmentDetails);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('✅ LLM grading complete');
      console.log(`   Overall grade: ${gradingResult.result?.overallGrade || 'N/A'}`);
      console.log(`   Duration: ${duration}s`);

      // Apply late penalty if applicable
      let finalGrade = gradingResult.result;
      let latePenaltyInfo = null;

      // Load late penalty settings
      const latePenaltySettings = store.get('latePenaltySettings', { enabled: false });

      if (latePenaltySettings.enabled && cleanAssignmentDetails?.due_at && cleanAssignmentDetails?.submitted_at) {
        console.log('📅 Checking for late submission...');

        const penalty = LatePenaltyCalculator.calculatePenalty({
          dueDate: cleanAssignmentDetails.due_at,
          submittedAt: cleanAssignmentDetails.submitted_at,
          penaltyPerDay: latePenaltySettings.penaltyPerDay || 10,
          maxPenalty: latePenaltySettings.maxPenalty || 50,
          gracePeriodHours: latePenaltySettings.gracePeriodHours || 0
        });

        if (penalty.isLate) {
          const gradeWithPenalty = LatePenaltyCalculator.applyPenaltyToGrade(
            finalGrade.overallGrade,
            finalGrade.maxPoints,
            penalty
          );

          console.log(`⏰ Late submission detected: ${penalty.daysLate} days late`);
          console.log(`   Original grade: ${gradeWithPenalty.originalGrade}/${gradeWithPenalty.maxPoints}`);
          console.log(`   Penalty: -${gradeWithPenalty.penaltyPoints} points (${gradeWithPenalty.penaltyPercentage}%)`);
          console.log(`   Final grade: ${gradeWithPenalty.adjustedGrade}/${gradeWithPenalty.maxPoints}`);

          // Update the grade with penalty applied
          finalGrade.overallGrade = gradeWithPenalty.adjustedGrade;
          finalGrade.originalGradeBeforePenalty = gradeWithPenalty.originalGrade;

          // Store penalty info for display
          latePenaltyInfo = gradeWithPenalty;
        } else {
          console.log('✅ Submission on time');
        }
      }

      mainWindow.webContents.send('grading-progress', {
        current: 1,
        total: 1,
        percentage: 100,
        currentStudent: 'Complete'
      });

      console.log('\n========================================');
      console.log('✅ GRADING COMPLETE');
      console.log('========================================\n');

      return {
        success: true,
        analysis: analysis,
        grade: finalGrade,
        latePenalty: latePenaltyInfo
      };
    } else {
      console.log('❌ LLM not available');
      // Fallback to basic analysis without LLM
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
        warning: 'No LLM provider available - basic analysis only'
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

// LLM Integration IPC Handlers
ipcMain.handle('llm-analyze', async (event, code, criteria, context) => {
  try {
    if (!await llmIntegration.initialize()) {
      return { success: false, error: 'No LLM provider available' };
    }

    return await llmIntegration.analyzeUnityProject(context, criteria);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm-get-result', async (event, taskId) => {
  try {
    if (taskId === 'status') {
      return await llmIntegration.getAvailabilityStatus();
    }
    return await llmIntegration.getAnalysisResult(taskId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm-refresh-provider', async () => {
  try {
    const isAvailable = await llmIntegration.refreshProvider();
    return { success: true, isAvailable };
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

// API Key Management IPC Handlers
ipcMain.handle('api-keys-get-providers', async () => {
  try {
    return { success: true, providers: apiKeyManager.getSupportedProviders() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-get-all', async () => {
  try {
    const keys = await apiKeyManager.getAllAPIKeys();
    return { success: true, keys };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-set', async (event, provider, config) => {
  try {
    // Ensure we have serializable data
    const cleanConfig = JSON.parse(JSON.stringify(config));
    const result = await apiKeyManager.setAPIKey(provider, cleanConfig);
    return result;
  } catch (error) {
    console.error('API key set error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-get', async (event, provider) => {
  try {
    const keyData = await apiKeyManager.getAPIKey(provider);
    return { success: true, keyData };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-delete', async (event, provider) => {
  try {
    const result = await apiKeyManager.deleteAPIKey(provider);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-test', async (event, provider, config = null) => {
  try {
    // Ensure we have serializable data if config is provided
    const cleanConfig = config ? JSON.parse(JSON.stringify(config)) : null;
    const result = await apiKeyManager.testAPIKey(provider, cleanConfig);
    return result;
  } catch (error) {
    console.error('API key test error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-toggle', async (event, provider, isActive) => {
  try {
    const result = await apiKeyManager.toggleProvider(provider, isActive);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-get-active', async () => {
  try {
    const active = await apiKeyManager.getActiveProvider();
    return { success: true, active };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-export-config', async () => {
  try {
    const config = await apiKeyManager.exportConfig();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('api-keys-clear-all', async () => {
  try {
    const result = await apiKeyManager.clearAllKeys();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Late Penalty Settings IPC Handlers
ipcMain.handle('late-penalty-save-settings', async (event, settings) => {
  try {
    store.set('latePenaltySettings', settings);
    console.log('✅ Late penalty settings saved:', settings);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to save late penalty settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('late-penalty-get-settings', async () => {
  try {
    const defaultSettings = {
      enabled: false,
      penaltyPerDay: 10,
      maxPenalty: 50,
      gracePeriodHours: 0
    };
    const settings = store.get('latePenaltySettings', defaultSettings);
    return { success: true, settings };
  } catch (error) {
    console.error('❌ Failed to load late penalty settings:', error);
    return { success: false, error: error.message };
  }
});

// Diagnostic IPC Handlers
ipcMain.handle('diagnostics-check-api-keys', async () => {
  try {
    console.log('\n========================================');
    console.log('🔍 API KEY DIAGNOSTICS');
    console.log('========================================');

    const activeProvider = await apiKeyManager.getActiveProvider();

    if (!activeProvider) {
      console.log('❌ No active provider found');
      const allKeys = await apiKeyManager.getAllAPIKeys();
      console.log('All stored providers:', Object.keys(allKeys));
      console.log('========================================\n');
      return {
        success: false,
        error: 'No active API provider configured',
        details: {
          hasActiveProvider: false,
          allProviders: Object.keys(allKeys)
        }
      };
    }

    const apiKey = activeProvider.config.apiKey;

    console.log('Provider:', activeProvider.provider);
    console.log('Provider Name:', activeProvider.config.providerInfo?.name);
    console.log('API Key Present:', !!apiKey);
    console.log('API Key Length:', apiKey ? apiKey.length : 0);
    console.log('API Key First 10:', apiKey ? apiKey.substring(0, 10) : 'N/A');
    console.log('API Key Last 4:', apiKey ? '***' + apiKey.slice(-4) : 'N/A');
    console.log('Contains spaces:', apiKey ? apiKey.includes(' ') : false);
    console.log('Contains newlines:', apiKey ? apiKey.includes('\n') : false);
    console.log('Trimmed length:', apiKey ? apiKey.trim().length : 0);
    console.log('Is Active:', activeProvider.config.isActive);
    console.log('Created At:', activeProvider.config.createdAt);
    console.log('Last Used:', activeProvider.config.lastUsed);

    // Test the API key
    console.log('\n🧪 Testing API key...');
    const testResult = await apiKeyManager.testAPIKey(
      activeProvider.provider,
      activeProvider.config
    );

    console.log('Test Result:', testResult.success ? '✅ Success' : '❌ Failed');
    if (!testResult.success) {
      console.log('Error:', testResult.error);
    }
    console.log('========================================\n');

    return {
      success: true,
      provider: activeProvider.provider,
      providerName: activeProvider.config.providerInfo?.name,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPreview: apiKey ? '***' + apiKey.slice(-4) : 'N/A',
      apiKeyFirst10: apiKey ? apiKey.substring(0, 10) : 'N/A',
      containsSpaces: apiKey ? apiKey.includes(' ') : false,
      containsNewlines: apiKey ? apiKey.includes('\n') : false,
      trimmedLength: apiKey ? apiKey.trim().length : 0,
      isActive: activeProvider.config.isActive,
      createdAt: activeProvider.config.createdAt,
      lastUsed: activeProvider.config.lastUsed,
      testResult: testResult
    };
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
    console.log('========================================\n');
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
});

// Grading Results Storage IPC Handlers
ipcMain.handle('results-save', async (event, results) => {
  try {
    console.log('💾 Saving grading results...');

    // Get existing results
    const existingResults = store.get('gradingResults', []);

    // Add timestamp and ID to new results
    const resultsWithMetadata = results.map((result, index) => ({
      ...result,
      id: result.id || `result-${Date.now()}-${index}`,
      savedAt: result.savedAt || new Date().toISOString(),
      gradedAt: result.gradedAt || new Date().toISOString()
    }));

    // Merge with existing (avoid duplicates by ID)
    const mergedResults = [...existingResults];

    resultsWithMetadata.forEach(newResult => {
      const existingIndex = mergedResults.findIndex(r => r.id === newResult.id);
      if (existingIndex >= 0) {
        // Update existing
        mergedResults[existingIndex] = newResult;
      } else {
        // Add new
        mergedResults.push(newResult);
      }
    });

    store.set('gradingResults', mergedResults);
    console.log(`✅ Saved ${resultsWithMetadata.length} results (total: ${mergedResults.length})`);

    return { success: true, count: mergedResults.length };
  } catch (error) {
    console.error('❌ Failed to save grading results:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('results-load', async () => {
  try {
    const results = store.get('gradingResults', []);
    console.log(`📥 Loaded ${results.length} saved grading results`);
    return { success: true, results };
  } catch (error) {
    console.error('❌ Failed to load grading results:', error);
    return { success: false, error: error.message, results: [] };
  }
});

ipcMain.handle('results-clear', async () => {
  try {
    store.set('gradingResults', []);
    console.log('🗑️ Cleared all saved grading results');
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to clear grading results:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('results-delete', async (event, resultId) => {
  try {
    const results = store.get('gradingResults', []);
    const filtered = results.filter(r => r.id !== resultId);
    store.set('gradingResults', filtered);
    console.log(`🗑️ Deleted result ${resultId}`);
    return { success: true, remaining: filtered.length };
  } catch (error) {
    console.error('❌ Failed to delete result:', error);
    return { success: false, error: error.message };
  }
});

// Initialize LLM integration on startup
app.whenReady().then(async () => {
  try {
    const isAvailable = await llmIntegration.initialize();
    if (isAvailable) {
      console.log('✅ LLM integration ready');
    } else {
      console.log('⚠️  No LLM provider configured - basic analysis mode enabled');
      console.log('💡 Configure an API key in Settings to enable AI-powered grading');
    }
  } catch (error) {
    console.log('⚠️  LLM initialization error:', error.message);
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