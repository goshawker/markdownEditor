# AGENTS.md

## What this is

Electron desktop app for viewing/editing markdown files. Single-process main + renderer architecture, no framework — vanilla JS, HTML, CSS. Uses `marked` for markdown rendering.

## Commands

- `npm run start` — launch dev (electron .)
- `npm run build` — package with electron-builder (outputs to `dist/`)
- `npm run pack` — package without installer (outputs to `dist/`)
- `npm install` — install deps

No linter, test suite, typecheck, or formatter configured.

## Architecture

- `main.js` — Electron main process. Window creation, IPC handlers, file I/O, menu, file watcher (fs.watch on parent dir).
- `preload.js` — contextBridge exposing `window.api` to renderer. Never import directly in renderer.
- `renderer/app.js` — All renderer logic. Tab manager, editor, preview (marked.parse), search/replace, title tree sidebar, drag-and-drop. Single-file, no modules.
- `renderer/index.html` — loads `marked.min.js` from node_modules, then `app.js`. No bundler.
- `renderer/style.css` — Catppuccin Mocha dark theme via CSS custom properties.

## Key quirks

- **No build step for renderer**: `index.html` loads scripts directly. Edit renderer files and reload the window.
- **File watching**: main.js watches the directory (not the file) to catch atomic-save editors. Debounce at 200ms with 300ms dedup against own saves.
- **Tab system**: state is a plain object in renderer/app.js. Tabs track content, filePath, isDirty, scroll positions. Only one file watcher active at a time (last-switched tab).
- **File associations**: registered in package.json build config for .md, .markdown, .txt. macOS `open-file` event handled via pendingFiles queue.
- **Packaging**: electron-builder, mac dmg+zip, win nsis+portable+zip. Icons expected at `build/icon.icns` (mac) and `build/icon.ico` (win).
- **contextIsolation: true**, nodeIntegration: false — all Node access goes through preload IPC.
