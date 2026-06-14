// Copyright (c) 2026 goshawker@yeah.net

// ── State ──
const state = {
  fontSize: 14,
  theme: 'system',
  sidebarVisible: true,
  searchVisible: false,
  previewVisible: false,
  currentMatches: [],
  currentMatchIndex: -1,
  headings: [], // parsed heading data
  tabs: [],
  activeTabId: null,
  _nextTabId: 1,
};

// ── DOM refs ──
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const titleTree = document.getElementById('title-tree');
const sidebar = document.getElementById('sidebar');
const previewPanel = document.getElementById('preview-panel');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const replaceInput = document.getElementById('replace-input');
const searchCount = document.getElementById('search-count');
const fontSizeLabel = document.getElementById('font-size-label');
const contextMenu = document.getElementById('context-menu');
const searchHighlights = document.getElementById('search-highlights');
const editorWrap = document.getElementById('editor-wrap');
const statusEncoding = document.getElementById('status-encoding');
const statusTotal = document.getElementById('status-total');
const statusSelected = document.getElementById('status-selected');
const statusCursor = document.getElementById('status-cursor');
const lineNumbers = document.getElementById('line-numbers');
const resizeHandle = document.getElementById('resize-handle');
const editorPanel = document.getElementById('editor-panel');

let updatePreviewTimer = null;

// ── Resize handle ──
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizeHandle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const mainEl = document.getElementById('main');
  const mainRect = mainEl.getBoundingClientRect();
  const sidebar = document.getElementById('sidebar');
  const sidebarWidth = sidebar.classList.contains('hidden') ? 0 : sidebar.offsetWidth;
  
  let newWidth = e.clientX - mainRect.left - sidebarWidth;
  newWidth = Math.max(200, Math.min(newWidth, mainRect.width - sidebarWidth - 250));
  
  editorPanel.style.flex = 'none';
  editorPanel.style.width = newWidth + 'px';
  
  if (previewPanel.classList.contains('collapsed')) {
    togglePreview();
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizeHandle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// ── Helper: mark tab dirty ──
function markDirty() {
  const active = getActiveTab();
  if (active && !active.isDirty) {
    active.isDirty = true;
    updateTabBar();
    updateWindowTitle();
  }
}

// ── Update line numbers ──
function updateLineNumbers() {
  const content = editor.value;
  const lines = content.split('\n');
  const count = lines.length;
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += '<div>' + i + '</div>';
  }
  lineNumbers.innerHTML = html;
  lineNumbers.scrollTop = editor.scrollTop;
}

// ── Helper: save current tab ──
async function saveCurrentTab() {
  const active = getActiveTab();
  if (!active) return;

  if (active.filePath) {
    const result = await window.api.saveFile(active.filePath, editor.value);
    if (result && result.success) {
      active.isDirty = false;
      updateTabBar();
      updateWindowTitle();
      showTooltip('已保存');
    }
  } else {
    const result = await window.api.saveAsFile(editor.value);
    if (result && result.success) {
      active.filePath = result.filePath;
      active.fileName = result.fileName;
      active.isDirty = false;
      updateTabBar();
      updateWindowTitle();
      showTooltip('已保存');
      window.api.watchFile(result.filePath);
    }
  }
}

// ── Auto-save handler ──
window.api.onAutoSave(() => {
  const active = getActiveTab();
  if (active && active.isDirty && active.filePath) {
    window.api.saveFile(active.filePath, editor.value).then(result => {
      if (result && result.success) {
        active.isDirty = false;
        updateTabBar();
        updateWindowTitle();
      }
    });
  }
});

function updateStatusBar() {
  const content = editor.value;
  const totalChars = content.length;
  
  // Count words (Chinese characters + English words)
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
  const totalWords = chineseChars + englishWords;
  
  statusTotal.textContent = totalChars + ' 字 / ' + totalWords + ' 词';
  
  // Update encoding
  const active = getActiveTab();
  statusEncoding.textContent = active ? active.encoding : 'UTF-8';
  
  // Update selected text count
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  if (start !== end) {
    const selected = content.substring(start, end);
    const selectedChinese = (selected.match(/[\u4e00-\u9fa5]/g) || []).length;
    const selectedEnglish = (selected.match(/[a-zA-Z]+/g) || []).length;
    const selectedWords = selectedChinese + selectedEnglish;
    statusSelected.textContent = '选中 ' + selected.length + ' 字 / ' + selectedWords + ' 词';
  } else {
    statusSelected.textContent = '';
  }

  // Calculate line and column
  const textBefore = content.substring(0, start);
  const lines = textBefore.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  statusCursor.textContent = '行 ' + line + ', 列 ' + col;
}

// ── Theme ──
const THEME_OPTIONS = ['dark', 'light', 'system'];
const THEME_ICONS = { dark: '🌙', light: '☀️', system: '💻' };

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.textContent = THEME_ICONS[theme];
    btn.title = 'Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1) + ' (click to cycle)';
  }
}

function toggleTheme() {
  const idx = THEME_OPTIONS.indexOf(state.theme);
  const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
  applyTheme(next);
}

applyTheme(localStorage.getItem('theme') || 'system');

// ── Initialize Marked (XSS防护) ──
marked.setOptions({
  breaks: true,
  gfm: true,
  sanitize: true,
  sanitizeFn: function(content) {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '');
  }
});

// ── Tab Manager ──

function generateTabId() {
  return 'tab-' + (state._nextTabId++);
}

function createTabData(fileName, filePath, content, encoding) {
  return {
    id: generateTabId(),
    fileName: fileName || 'untitled.md',
    filePath: filePath || null,
    content: content || '',
    isDirty: false,
    scrollPosition: 0,
    previewScrollTop: 0,
    encoding: encoding || 'UTF-8',
  };
}

function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null;
}

function getTabIndex(tabId) {
  return state.tabs.findIndex(t => t.id === tabId);
}

function addTab(fileName, filePath, content, encoding) {
  const tab = createTabData(fileName, filePath, content, encoding);
  state.tabs.push(tab);
  return tab;
}

function removeTab(tabId) {
  const idx = getTabIndex(tabId);
  if (idx === -1) return null;
  const removed = state.tabs.splice(idx, 1)[0];
  return removed;
}

function switchTab(tabId) {
  if (tabId === state.activeTabId) return;

  // Save outgoing tab state
  const outgoing = getActiveTab();
  if (outgoing) {
    outgoing.content = editor.value;
    outgoing.scrollPosition = editor.scrollTop;
    outgoing.previewScrollTop = preview.scrollTop;
  }

  // Activate new tab
  state.activeTabId = tabId;
  const incoming = getActiveTab();
  if (!incoming) return;

  // Load incoming tab state into editor
  editor.value = incoming.content;
  editor.scrollTop = incoming.scrollPosition;
  preview.scrollTop = incoming.previewScrollTop || 0;

  // Update UI
  updatePreview();
  updateTabBar();
  updateWindowTitle();
  updateStatusBar();
  updateLineNumbers();
  editor.focus();

  // Watch the file for this tab
  if (incoming.filePath) {
    window.api.watchFile(incoming.filePath);
  } else {
    window.api.unwatchFile();
  }

  // Reset search state on tab switch
  if (state.searchVisible) {
    searchInput.value = '';
    toggleSearch();
  }
  clearSearchHighlights();
}

// ── Tab drag state ──
let draggedTabId = null;

function updateTabBar() {
  const tabList = document.getElementById('tab-list');
  tabList.innerHTML = '';

  state.tabs.forEach(tab => {
    const div = document.createElement('div');
    div.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
    div.dataset.tabId = tab.id;
    div.draggable = true;

    // Drag events
    div.addEventListener('dragstart', (e) => {
      draggedTabId = tab.id;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.id);
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      draggedTabId = null;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedTabId && draggedTabId !== tab.id) {
        div.classList.add('drag-over');
      }
    });

    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over');
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      if (draggedTabId && draggedTabId !== tab.id) {
        reorderTabs(draggedTabId, tab.id);
      }
    });

    // Dirty indicator
    if (tab.isDirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      div.appendChild(dot);
    }

    // Label
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.fileName;
    div.appendChild(label);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCloseTab(tab.id);
    });
    div.appendChild(closeBtn);

    // Click to switch
    div.addEventListener('click', () => switchTab(tab.id));

    tabList.appendChild(div);
  });

  // Scroll active tab into view
  const activeEl = tabList.querySelector('.tab.active');
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function reorderTabs(fromId, toId) {
  const fromIdx = state.tabs.findIndex(t => t.id === fromId);
  const toIdx = state.tabs.findIndex(t => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [movedTab] = state.tabs.splice(fromIdx, 1);
  state.tabs.splice(toIdx, 0, movedTab);
  updateTabBar();
}

function updateWindowTitle() {
  const active = getActiveTab();
  if (active) {
    const prefix = active.isDirty ? '\u2022 ' : '';
    document.title = prefix + active.fileName + ' - MarkdownParser';
  } else {
    document.title = 'MarkdownParser';
  }
}

function handleCloseTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;

  const wasActive = tab.id === state.activeTabId;
  removeTab(tabId);

  if (state.tabs.length === 0) {
    // Last tab closed — create a new untitled tab
    createNewTab();
    return;
  }

  if (wasActive) {
    // Switch to the nearest tab (prefer left)
    const idx = getTabIndex(state.activeTabId);
    const targetIdx = Math.max(0, Math.min(idx, state.tabs.length - 1));
    switchTab(state.tabs[targetIdx].id);
  } else {
    // Update watcher for the still-active tab
    const active = getActiveTab();
    if (active && active.filePath) {
      window.api.watchFile(active.filePath);
    } else {
      window.api.unwatchFile();
    }
    updateTabBar();
  }
}

function createNewTab() {
  window.api.unwatchFile();
  const tab = addTab('untitled.md', null, '');
  state.activeTabId = tab.id;
  editor.value = '';
  editor.scrollTop = 0;
  preview.scrollTop = 0;
  updatePreview();
  updateTabBar();
  updateWindowTitle();
  updateStatusBar();
  updateLineNumbers();
  editor.focus();
}

// ── Update preview ──
function updatePreview() {
  const content = editor.value;
  const rendered = marked.parse(content);
  preview.innerHTML = rendered;
  updateTitleTree();
}

function schedulePreviewUpdate() {
  clearTimeout(updatePreviewTimer);
  updatePreviewTimer = setTimeout(updatePreview, 200);
}

// ── Title tree ──
function parseHeadings(text) {
  const headings = [];
  const lines = text.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        lineIndex: i,
      });
    }
  }
  return headings;
}

function getHeadingContent(heading, allLines) {
  const startLine = heading.lineIndex;
  let endLine = allLines.length;

  for (let i = startLine + 1; i < allLines.length; i++) {
    const match = allLines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1].length <= heading.level) {
      endLine = i;
      break;
    }
  }

  return allLines.slice(startLine, endLine).join('\n');
}

function updateTitleTree() {
  const content = editor.value;
  state.headings = parseHeadings(content);

  if (state.headings.length === 0) {
    titleTree.innerHTML = '<div class="sidebar-empty">No headings found</div>';
    return;
  }

  titleTree.innerHTML = '';
  state.headings.forEach((h, idx) => {
    const div = document.createElement('div');
    div.className = `title-item level-${h.level}`;
    div.textContent = h.text;
    div.dataset.index = idx;
    div.addEventListener('click', () => scrollToHeading(idx));
    div.addEventListener('contextmenu', (e) => showContextMenu(e, idx));
    titleTree.appendChild(div);
  });
}

function scrollToHeading(idx) {
  const heading = state.headings[idx];
  if (!heading) return;

  const lines = editor.value.split('\n');
  let offset = 0;
  for (let i = 0; i < heading.lineIndex && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }

  editor.focus();
  editor.setSelectionRange(offset, offset);

  document.querySelectorAll('.title-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
}

// ── Context menu for title items ──
let contextHeadingIdx = -1;

function showContextMenu(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  contextHeadingIdx = idx;
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.remove('hidden');
}

document.addEventListener('click', () => {
  contextMenu.classList.add('hidden');
});

document.addEventListener('contextmenu', () => {
  contextMenu.classList.add('hidden');
});

contextMenu.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action || contextHeadingIdx < 0) return;

  const heading = state.headings[contextHeadingIdx];
  if (!heading) return;

  if (action === 'copy-title') {
    const text = heading.text;
    window.api.copyToClipboard(text).catch(() => {});
    showTooltip('Copied: ' + text.substring(0, 30));
  } else if (action === 'copy-content') {
    const lines = editor.value.split('\n');
    const content = getHeadingContent(heading, lines);
    window.api.copyToClipboard(content).catch(() => {});
    showTooltip('Content copied to clipboard');
  }

  contextMenu.classList.add('hidden');
});

let tooltipTimer = null;

function showTooltip(msg) {
  const existing = document.querySelector('.tooltip-toast');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'tooltip-toast';
  div.textContent = msg;
  Object.assign(div.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    fontSize: '13px',
    zIndex: '2000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(div);

  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, 2000);
}

// ── Font size ──
function applyFontSize(size) {
  state.fontSize = size;
  editor.style.fontSize = size + 'px';
  searchHighlights.style.fontSize = size + 'px';
  preview.style.fontSize = size + 'px';
  lineNumbers.style.fontSize = size + 'px';
  fontSizeLabel.textContent = size + 'px';
  document.documentElement.style.setProperty('--font-size', size + 'px');
  updateLineNumbers();
}

function changeFontSize(delta) {
  const newSize = Math.max(10, Math.min(32, state.fontSize + delta));
  applyFontSize(newSize);
}

function resetFontSize() {
  applyFontSize(14);
}

// ── Search & Replace ──
function clearSearchHighlights() {
  state.currentMatches = [];
  state.currentMatchIndex = -1;
  searchHighlights.innerHTML = '';
  updateSearchCount();
}

function performSearch() {
  const query = searchInput.value;
  const content = editor.value;

  if (!query) {
    state.currentMatches = [];
    state.currentMatchIndex = -1;
    searchHighlights.innerHTML = '';
    updateSearchCount();
    return;
  }

  const matches = [];
  let pos = content.indexOf(query, 0);
  while (pos !== -1) {
    matches.push(pos);
    pos = content.indexOf(query, pos + 1);
  }

  state.currentMatches = matches;
  state.currentMatchIndex = matches.length > 0 ? 0 : -1;

  // Build highlighted overlay HTML
  if (matches.length > 0) {
    let html = '';
    let lastEnd = 0;
    for (let i = 0; i < matches.length; i++) {
      const mPos = matches[i];
      // Text before this match
      html += escapeHtml(content.slice(lastEnd, mPos));
      // The match itself
      const cls = i === state.currentMatchIndex ? 'current' : '';
      html += `<mark class="${cls}">${escapeHtml(content.slice(mPos, mPos + query.length))}</mark>`;
      lastEnd = mPos + query.length;
    }
    html += escapeHtml(content.slice(lastEnd));
    searchHighlights.innerHTML = html;
  } else {
    searchHighlights.innerHTML = '';
  }

  updateSearchCount();

  if (matches.length > 0) {
    highlightMatch(0);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateSearchCount() {
  const total = state.currentMatches.length;
  const current = state.currentMatchIndex >= 0 ? state.currentMatchIndex + 1 : 0;
  searchCount.textContent = `${current}/${total}`;
}

function highlightMatch(index) {
  if (index < 0 || index >= state.currentMatches.length) return;
  state.currentMatchIndex = index;
  const pos = state.currentMatches[index];
  editor.focus();
  editor.setSelectionRange(pos, pos + searchInput.value.length);

  // Update the current match highlight in the overlay
  const marks = searchHighlights.querySelectorAll('mark');
  marks.forEach((m, i) => {
    m.classList.toggle('current', i === index);
  });

  // Scroll editor to make the selection visible
  const textBefore = editor.value.substring(0, pos);
  const lineNumber = textBefore.split('\n').length;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
  editor.scrollTop = Math.max(0, (lineNumber - 1) * lineHeight - editor.clientHeight / 3);

  updateSearchCount();
}

function goToNextMatch() {
  if (state.currentMatches.length === 0) return;
  const next = (state.currentMatchIndex + 1) % state.currentMatches.length;
  highlightMatch(next);
}

function goToPrevMatch() {
  if (state.currentMatches.length === 0) return;
  const prev = (state.currentMatchIndex - 1 + state.currentMatches.length) % state.currentMatches.length;
  highlightMatch(prev);
}

function replaceCurrent() {
  const replaceText = replaceInput.value;
  if (state.currentMatchIndex < 0 || state.currentMatchIndex >= state.currentMatches.length) return;

  const pos = state.currentMatches[state.currentMatchIndex];
  const before = editor.value.substring(0, pos);
  const after = editor.value.substring(pos + searchInput.value.length);
  editor.value = before + replaceText + after;

  markDirty();
  performSearch();
}

function replaceAll() {
  const query = searchInput.value;
  const replaceText = replaceInput.value;
  if (!query) return;

  editor.value = editor.value.split(query).join(replaceText);

  markDirty();
  performSearch();
  updatePreview();
}

// ── Sidebar toggle ──
function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  sidebar.classList.toggle('hidden', !state.sidebarVisible);
}

// ── Preview toggle ──
function togglePreview() {
  state.previewVisible = !state.previewVisible;
  previewPanel.classList.toggle('collapsed', !state.previewVisible);
  const btn = document.getElementById('btn-toggle-preview');
  btn.textContent = state.previewVisible ? '\u25C0' : '\u25B6';
  btn.title = state.previewVisible ? 'Collapse Preview' : 'Expand Preview';
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  const isCmd = e.metaKey || e.ctrlKey;

  if (isCmd && e.key === 'f') {
    e.preventDefault();
    toggleSearch();
  } else if (isCmd && e.key === '=') {
    e.preventDefault();
    changeFontSize(2);
  } else if (isCmd && e.key === '-') {
    e.preventDefault();
    changeFontSize(-2);
  } else if (isCmd && e.key === '0') {
    e.preventDefault();
    resetFontSize();
  } else if (isCmd && e.key === 'b') {
    e.preventDefault();
    toggleSidebar();
  } else if (isCmd && e.key === 'w') {
    e.preventDefault();
    const active = getActiveTab();
    if (active) handleCloseTab(active.id);
  } else if (isCmd && e.key === 't') {
    e.preventDefault();
    createNewTab();
  }
});

// ── Search toggle ──
function toggleSearch() {
  state.searchVisible = !state.searchVisible;
  searchBar.classList.toggle('hidden', !state.searchVisible);
  if (state.searchVisible) {
    searchInput.focus();
    performSearch();
  } else {
    clearSearchHighlights();
  }
}

// ── Event bindings ──

// Editor change → update preview and re-highlight search
editor.addEventListener('input', () => {
  schedulePreviewUpdate();
  markDirty();
  if (state.searchVisible) {
    performSearch();
  }
  updateStatusBar();
  updateLineNumbers();
});

// Editor selection change → update selected count
editor.addEventListener('select', updateStatusBar);
editor.addEventListener('click', updateStatusBar);
editor.addEventListener('keyup', updateStatusBar);

// Search events
searchInput.addEventListener('input', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) goToPrevMatch();
    else goToNextMatch();
  }
});
replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') replaceCurrent();
});

// Button events
document.getElementById('btn-open').addEventListener('click', () => window.api.openFile());
document.getElementById('btn-save').addEventListener('click', saveCurrentTab);
document.getElementById('btn-font-dec').addEventListener('click', () => changeFontSize(-2));
document.getElementById('btn-font-inc').addEventListener('click', () => changeFontSize(2));
document.getElementById('btn-font-reset').addEventListener('click', resetFontSize);
document.getElementById('btn-search').addEventListener('click', toggleSearch);
document.getElementById('btn-sidebar').addEventListener('click', toggleSidebar);
document.getElementById('btn-toggle-preview').addEventListener('click', togglePreview);
document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('search-next').addEventListener('click', goToNextMatch);
document.getElementById('search-prev').addEventListener('click', goToPrevMatch);
document.getElementById('search-close').addEventListener('click', () => {
  if (state.searchVisible) toggleSearch();
});
document.getElementById('replace-btn').addEventListener('click', replaceCurrent);
document.getElementById('replace-all-btn').addEventListener('click', replaceAll);

// Export buttons
document.getElementById('btn-export-html').addEventListener('click', async () => {
  const active = getActiveTab();
  const defaultName = active ? active.fileName.replace(/\.md$/, '.html') : 'export.html';
  const result = await window.api.exportHtml(preview.innerHTML, defaultName);
  if (result && result.success) {
    showTooltip('HTML 已导出');
  }
});

document.getElementById('btn-export-pdf').addEventListener('click', async () => {
  const active = getActiveTab();
  const defaultName = active ? active.fileName.replace(/\.md$/, '.pdf') : 'export.pdf';
  const result = await window.api.exportPdf(preview.innerHTML, defaultName);
  if (result && result.success) {
    showTooltip('PDF 已导出');
  }
});

// Check for updates button
document.getElementById('btn-check-update').addEventListener('click', () => {
  showTooltip('正在检查更新...');
  window.api.checkForUpdate();
});

// Update status handler
window.api.onUpdateStatus((data) => {
  switch (data.status) {
    case 'checking':
      showTooltip('正在检查更新...');
      break;
    case 'available':
      showTooltip(`发现新版本 ${data.version}`);
      break;
    case 'not-available':
      showTooltip('当前已是最新版本');
      break;
    case 'downloading':
      showTooltip(`正在下载更新 ${Math.round(data.percent)}%`);
      break;
    case 'downloaded':
      showTooltip('更新已下载，重启后生效');
      break;
    case 'error':
      showTooltip('更新检查失败');
      break;
  }
});

// Sync highlights overlay scroll with editor scroll
editor.addEventListener('scroll', () => {
  searchHighlights.scrollTop = editor.scrollTop;
  searchHighlights.scrollLeft = editor.scrollLeft;
  lineNumbers.scrollTop = editor.scrollTop;
});

// ── IPC events from main ──

window.api.onFileOpened((data) => {
  const tab = addTab(data.fileName, data.filePath, data.content, data.encoding);
  state.activeTabId = tab.id;
  editor.value = data.content;
  editor.scrollTop = 0;
  preview.scrollTop = 0;
  updatePreview();
  updateTabBar();
  updateWindowTitle();
  updateStatusBar();
  updateLineNumbers();
  editor.focus();
  if (data.filePath) window.api.watchFile(data.filePath);
});

window.api.onFileChanged((data) => {
  const tab = state.tabs.find(t => t.filePath === data.filePath);
  if (!tab) return;
  tab.content = data.content;
  tab.isDirty = false;
  if (data.encoding) tab.encoding = data.encoding;
  updateTabBar();
  updateWindowTitle();
  if (tab.id === state.activeTabId) {
    editor.value = data.content;
    updatePreview();
    updateStatusBar();
    updateLineNumbers();
    showTooltip('File reloaded: ' + data.fileName);
  }
});

window.api.onMenuSave(async () => {
  saveCurrentTab();
});

window.api.onMenuSaveAs(async () => {
  const active = getActiveTab();
  if (!active) return;
  const result = await window.api.saveAsFile(editor.value);
  if (result && result.success) {
    active.filePath = result.filePath;
    active.fileName = result.fileName;
    active.isDirty = false;
    updateTabBar();
    updateWindowTitle();
    showTooltip('已保存');
    window.api.watchFile(result.filePath);
  }
});

window.api.onToggleSidebar(() => {
  toggleSidebar();
});

// ── Init ──
applyFontSize(14);
createNewTab();
updateStatusBar();
updateLineNumbers();

// ── Recent files ──
const recentMenu = document.getElementById('recent-menu');
const btnRecent = document.getElementById('btn-recent');

async function loadRecentFiles() {
  const files = await window.api.loadRecentFiles();
  renderRecentFiles(files);
}

function renderRecentFiles(files) {
  recentMenu.innerHTML = '';
  if (files.length === 0) {
    recentMenu.innerHTML = '<div class="dropdown-empty">无最近文件</div>';
    return;
  }
  files.forEach(filePath => {
    const div = document.createElement('div');
    div.className = 'dropdown-item';
    const fileName = filePath.split('/').pop();
    div.innerHTML = `${fileName}<span class="file-path">${filePath}</span>`;
    div.addEventListener('click', () => {
      window.api.openFileByPath(filePath);
      recentMenu.classList.add('hidden');
    });
    recentMenu.appendChild(div);
  });
}

btnRecent.addEventListener('click', async (e) => {
  e.stopPropagation();
  const files = await window.api.getRecentFiles();
  renderRecentFiles(files);
  recentMenu.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  recentMenu.classList.add('hidden');
});

loadRecentFiles();

// ── Drag and drop ──
const mainEl = document.getElementById('main');

mainEl.addEventListener('dragenter', (e) => {
  e.preventDefault();
  mainEl.classList.add('drag-over');
});

mainEl.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (!mainEl.contains(e.relatedTarget)) {
    mainEl.classList.remove('drag-over');
  }
});

mainEl.addEventListener('dragover', (e) => {
  e.preventDefault();
});

mainEl.addEventListener('drop', (e) => {
  e.preventDefault();
  mainEl.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) {
    const validExts = ['.md', '.markdown', '.txt'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (validExts.includes(ext)) {
      window.api.openFileByPath(file.path);
    }
  }
});
