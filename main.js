// Copyright (c) 2026 goshawker@yeah.net

const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

let autoSaveTimer = null;
const AUTO_SAVE_INTERVAL = 30000; // 30秒

let recentFiles = [];
const MAX_RECENT_FILES = 10;

// ── Crash Reporter ──
const crashLogDir = path.join(app.getPath('userData'), 'crash-reports');

function initCrashReporter() {
  if (!fs.existsSync(crashLogDir)) {
    fs.mkdirSync(crashLogDir, { recursive: true });
  }

  crashReporter.start({
    submitURL: '',
    productName: 'MarkdownParser',
    compress: true,
    uploadToServer: false,
    extra: {
      version: app.getVersion(),
      platform: process.platform,
    },
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    logCrash('uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    logCrash('unhandledRejection', reason);
  });
}

function logCrash(type, error) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(crashLogDir, `crash-${timestamp}.json`);
  
  const crashData = {
    type,
    timestamp: new Date().toISOString(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    error: {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    },
  };
  
  try {
    fs.writeFileSync(filename, JSON.stringify(crashData, null, 2));
    console.log('Crash log saved:', filename);
  } catch (err) {
    console.error('Failed to save crash log:', err);
  }
  
  cleanOldCrashLogs();
}

function cleanOldCrashLogs() {
  try {
    const files = fs.readdirSync(crashLogDir)
      .filter(f => f.startsWith('crash-') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    // Keep only last 10 crash logs
    if (files.length > 10) {
      files.slice(10).forEach(f => {
        fs.unlinkSync(path.join(crashLogDir, f));
      });
    }
  } catch (_) {}
}

function getCrashLogs() {
  try {
    return fs.readdirSync(crashLogDir)
      .filter(f => f.startsWith('crash-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const content = fs.readFileSync(path.join(crashLogDir, f), 'utf-8');
        return JSON.parse(content);
      });
  } catch (_) {
    return [];
  }
}

// ── Auto Updater ──
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}`,
      detail: '是否现在下载更新？',
      buttons: ['下载', '稍后'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  }
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'not-available' });
  }
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { 
      status: 'downloading', 
      percent: progress.percent 
    });
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'downloaded' });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新就绪',
      message: '更新已下载完成',
      detail: '应用将重启以安装更新',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto updater error:', err);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
  }
});

// ── Encoding detection ──
function detectEncoding(buffer) {
  // Check for BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return { encoding: 'UTF-8 (BOM)', bom: 3 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { encoding: 'UTF-16 LE', bom: 2 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return { encoding: 'UTF-16 BE', bom: 2 };
  }
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xFE && buffer[2] === 0x00 && buffer[3] === 0x00) {
    return { encoding: 'UTF-32 LE', bom: 4 };
  }
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xFE && buffer[3] === 0xFF) {
    return { encoding: 'UTF-32 BE', bom: 4 };
  }

  // Check for valid UTF-8
  let isValidUtf8 = true;
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i];
    if (byte <= 0x7F) {
      i += 1;
    } else if ((byte & 0xE0) === 0xC0) {
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 2;
    } else if ((byte & 0xF0) === 0xE0) {
      if (i + 2 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 3;
    } else if ((byte & 0xF8) === 0xF0) {
      if (i + 3 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80 || (buffer[i + 3] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 4;
    } else {
      isValidUtf8 = false;
      break;
    }
  }

  if (isValidUtf8) {
    return { encoding: 'UTF-8', bom: 0 };
  }

  // Check for common single-byte encodings (heuristic: high bytes > threshold)
  let highBytes = 0;
  for (let j = 0; j < buffer.length; j++) {
    if (buffer[j] > 0x7F) highBytes++;
  }
  if (buffer.length > 0 && highBytes / buffer.length > 0.3) {
    return { encoding: 'GBK/GB2312', bom: 0 };
  }

  return { encoding: 'UTF-8', bom: 0 };
}

function readFileWithEncoding(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${Math.round(stat.size / 1024 / 1024)}MB)，最大支持 50MB`);
  }
  const buffer = fs.readFileSync(filePath);
  const { encoding, bom } = detectEncoding(buffer);
  const content = buffer.toString('utf-8', bom);
  return { content, encoding };
}

// ── File path queue (files opened before window is ready) ──
const pendingFiles = [];

// ── File watcher ──
let activeWatcher = null;
let activeWatchPath = null;
let watcherTimer = null;
let lastSaveTime = 0;

function startWatching(filePath) {
  stopWatching();
  if (!filePath) return;

  activeWatchPath = filePath;
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  try {
    activeWatcher = fs.watch(dir, (eventType, filename) => {
      // Some editors do atomic saves (temp → rename), some edit in-place.
      // Watch the directory and filter by filename to catch both.
      if (filename !== baseName) return;
      clearTimeout(watcherTimer);
      watcherTimer = setTimeout(() => {
        if (Date.now() - lastSaveTime < 300) return;
        try {
          const { content, encoding } = readFileWithEncoding(filePath);
          const fileName = path.basename(filePath);
          mainWindow.webContents.send('file-changed', { content, filePath, fileName, encoding });
        } catch (_) {
          // File may be temporarily unavailable
        }
      }, 200);
    });
  } catch (_) {
    // File may not exist or be unwatchable
  }
}

function stopWatching() {
  clearTimeout(watcherTimer);
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
  activeWatchPath = null;
}

function openFileByPath(filePath) {
  try {
    const { content, encoding } = readFileWithEncoding(filePath);
    const fileName = path.basename(filePath);
    addToRecentFiles(filePath);
    mainWindow.webContents.send('file-opened', { content, filePath, fileName, encoding });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

function addToRecentFiles(filePath) {
  recentFiles = recentFiles.filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles.pop();
  }
  saveRecentFiles();
}

function saveRecentFiles() {
  const dataPath = path.join(app.getPath('userData'), 'recent-files.json');
  try {
    fs.writeFileSync(dataPath, JSON.stringify(recentFiles, null, 2));
  } catch (_) {}
}

function loadRecentFiles() {
  const dataPath = path.join(app.getPath('userData'), 'recent-files.json');
  try {
    if (fs.existsSync(dataPath)) {
      recentFiles = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (_) {
    recentFiles = [];
  }
}

function startAutoSave() {
  stopAutoSave();
  autoSaveTimer = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-save');
    }
  }, AUTO_SAVE_INTERVAL);
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'MarkdownParser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open any files that were queued before window was ready
  mainWindow.webContents.once('did-finish-load', () => {
    for (const fp of pendingFiles) {
      openFileByPath(fp);
    }
    pendingFiles.length = 0;

    // Also handle command-line arguments (e.g. terminal launch)
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    for (const arg of args) {
      if (!arg.startsWith('-') && fs.existsSync(arg)) {
        openFileByPath(path.resolve(arg));
      }
    }
  });

  buildMenu();
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About MarkdownParser',
    message: 'MarkdownParser',
    detail: [
      'Version 1.0.0',
      '',
      'Copyright (c) 2026 goshawker@yeah.net',
      '',
      'A markdown viewer and parser built with Electron.',
    ].join('\n'),
    buttons: ['OK'],
  });
}

function buildMenu() {
  const template = [
    // macOS app menu
    ...(process.platform === 'darwin' ? [{
      label: app.getName(),
      submenu: [
        {
          label: 'About MarkdownParser',
          click: () => showAboutDialog(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenFile(),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save'),
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-save-as'),
        },
        { type: 'separator' },
        ...(process.platform !== 'darwin' ? [{ role: 'quit' }] : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── File handlers ──

async function handleOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return;

  const filePath = result.filePaths[0];
  try {
    const { content, encoding } = readFileWithEncoding(filePath);
    const fileName = path.basename(filePath);
    addToRecentFiles(filePath);
    mainWindow.webContents.send('file-opened', { content, filePath, fileName, encoding });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

async function handleSaveFile(_event, filePath, content) {
  if (!filePath) return { success: false, error: 'No file path' };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    lastSaveTime = Date.now();
    return { success: true };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function handleSaveAsFile(_event, content) {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  });

  if (result.canceled || !result.filePath) return { canceled: true };

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    lastSaveTime = Date.now();
    const fileName = path.basename(result.filePath);
    return { success: true, filePath: result.filePath, fileName };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── macOS "Open With" handler ──
// macOS sends open-file event when user opens a .md file via Finder

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    openFileByPath(filePath);
  } else {
    pendingFiles.push(filePath);
  }
});

// ── IPC handlers ──

ipcMain.handle('open-file', async () => {
  await handleOpenFile();
});

ipcMain.handle('open-file-by-path', async (_event, filePath) => {
  try {
    const { content, encoding } = readFileWithEncoding(filePath);
    const fileName = path.basename(filePath);
    addToRecentFiles(filePath);
    mainWindow.webContents.send('file-opened', { content, filePath, fileName, encoding });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  return await handleSaveFile(event, filePath, content);
});

ipcMain.handle('save-as-file', async (event, content) => {
  return await handleSaveAsFile(event, content);
});

ipcMain.handle('copy-to-clipboard', (_event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('export-html', async (_event, html, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    fs.writeFileSync(result.filePath, html, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to export: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-pdf', async (_event, html, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });
  
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; line-height: 1.6; color: #333; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; }
  </style>
</head>
<body>${html}</body>
</html>`;
  
  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
  
  const pdfData = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
  });
  
  pdfWindow.close();
  
  try {
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to export: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('watch-file', async (_event, filePath) => {
  startWatching(filePath);
});

ipcMain.handle('unwatch-file', async () => {
  stopWatching();
});

ipcMain.handle('check-for-update', async () => {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('Check for update error:', err);
  }
});

ipcMain.handle('get-recent-files', async () => {
  return recentFiles.filter(f => fs.existsSync(f));
});

ipcMain.handle('load-recent-files', async () => {
  loadRecentFiles();
  return recentFiles.filter(f => fs.existsSync(f));
});

ipcMain.handle('get-crash-logs', async () => {
  return getCrashLogs();
});

// ── App lifecycle ──

app.whenReady().then(() => {
  initCrashReporter();
  loadRecentFiles();
  createWindow();
  startAutoSave();
  
  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
