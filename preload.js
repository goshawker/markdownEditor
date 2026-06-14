// Copyright (c) 2026 goshawker@yeah.net

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  openFileByPath: (filePath) => ipcRenderer.invoke('open-file-by-path', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  saveAsFile: (content) => ipcRenderer.invoke('save-as-file', content),

  // Clipboard
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Export
  exportHtml: (html, defaultName) => ipcRenderer.invoke('export-html', html, defaultName),
  exportPdf: (html, defaultName) => ipcRenderer.invoke('export-pdf', html, defaultName),

  // Auto update
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },

  // Crash logs
  getCrashLogs: () => ipcRenderer.invoke('get-crash-logs'),

  // File watching
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  unwatchFile: () => ipcRenderer.invoke('unwatch-file'),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  loadRecentFiles: () => ipcRenderer.invoke('load-recent-files'),

  // Events from main
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data));
  },
  onMenuSave: (callback) => {
    ipcRenderer.on('menu-save', () => callback());
  },
  onMenuSaveAs: (callback) => {
    ipcRenderer.on('menu-save-as', () => callback());
  },
  onToggleSidebar: (callback) => {
    ipcRenderer.on('toggle-sidebar', () => callback());
  },
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (_event, data) => callback(data));
  },
  onAutoSave: (callback) => {
    ipcRenderer.on('auto-save', () => callback());
  },

  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
