// Preload — runs with contextIsolation ON. Exposes a tiny, safe printing API to
// the renderer (the React app) without giving it Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // Sends a full HTML document string to the main process to be printed via
  // Electron's native print pipeline. Resolves { success, reason }.
  printHTML: (html) => ipcRenderer.invoke('print-html', html),
});
