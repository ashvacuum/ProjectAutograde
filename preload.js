const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key)
  },

  dialog: {
    showError: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
    showInfo: (title, content) => ipcRenderer.invoke('show-info-dialog', title, content),
    showSave: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpen: (options) => ipcRenderer.invoke('show-open-dialog', options)
  },

  app: {
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    getPath: () => ipcRenderer.invoke('get-app-path'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
  },

  canvas: {
    authenticate: (apiUrl, token) => ipcRenderer.invoke('canvas-authenticate', apiUrl, token),
    getCourses: () => ipcRenderer.invoke('canvas-get-courses'),
    getAssignments: (courseId) => ipcRenderer.invoke('canvas-get-assignments', courseId),
    getSubmissions: (courseId, assignmentId) => ipcRenderer.invoke('canvas-get-submissions', courseId, assignmentId),
    postGrade: (courseId, assignmentId, userId, grade, comment) =>
      ipcRenderer.invoke('canvas-post-grade', courseId, assignmentId, userId, grade, comment)
  },

  grader: {
    analyzeProject: (repoUrl, criteria) => ipcRenderer.invoke('grader-analyze-project', repoUrl, criteria),
    getGradingProgress: () => ipcRenderer.invoke('grader-get-progress'),
    cancelGrading: () => ipcRenderer.invoke('grader-cancel')
  },

  git: {
    cloneRepo: (url, destination) => ipcRenderer.invoke('git-clone-repo', url, destination),
    deleteRepo: (path) => ipcRenderer.invoke('git-delete-repo', path)
  },

  files: {
    readFile: (path) => ipcRenderer.invoke('files-read-file', path),
    writeFile: (path, content) => ipcRenderer.invoke('files-write-file', path, content),
    deleteFile: (path) => ipcRenderer.invoke('files-delete-file', path),
    ensureDir: (path) => ipcRenderer.invoke('files-ensure-dir', path),
    listFiles: (path, pattern) => ipcRenderer.invoke('files-list-files', path, pattern)
  },

  llm: {
    analyzeCode: (code, criteria, context) => ipcRenderer.invoke('llm-analyze', code, criteria, context),
    getAnalysisResult: (taskId) => ipcRenderer.invoke('llm-get-result', taskId),
    refreshProvider: () => ipcRenderer.invoke('llm-refresh-provider')
  },

  export: {
    toCsv: (data, filename) => ipcRenderer.invoke('export-to-csv', data, filename),
    toPdf: (data, filename) => ipcRenderer.invoke('export-to-pdf', data, filename),
    toJson: (data, filename) => ipcRenderer.invoke('export-to-json', data, filename)
  },

  apiKeys: {
    getProviders: () => ipcRenderer.invoke('api-keys-get-providers'),
    getAll: () => ipcRenderer.invoke('api-keys-get-all'),
    set: (provider, config) => ipcRenderer.invoke('api-keys-set', provider, config),
    get: (provider) => ipcRenderer.invoke('api-keys-get', provider),
    delete: (provider) => ipcRenderer.invoke('api-keys-delete', provider),
    test: (provider, config) => ipcRenderer.invoke('api-keys-test', provider, config),
    toggle: (provider, isActive) => ipcRenderer.invoke('api-keys-toggle', provider, isActive),
    getActive: () => ipcRenderer.invoke('api-keys-get-active'),
    exportConfig: () => ipcRenderer.invoke('api-keys-export-config'),
    clearAll: () => ipcRenderer.invoke('api-keys-clear-all')
  },

  onAppError: (callback) => {
    ipcRenderer.on('app-error', callback);
  },

  onGradingProgress: (callback) => {
    ipcRenderer.on('grading-progress', callback);
  },

  onGradingComplete: (callback) => {
    ipcRenderer.on('grading-complete', callback);
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});