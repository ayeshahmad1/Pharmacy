const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Bundled configuration
// These are set BEFORE the backend loads, so server.js picks them up via
// process.env. dotenv will not override values already set here, and no .env
// file is shipped with the app. To rotate the Atlas credentials, edit the
// MONGO_URI below and rebuild.
// ---------------------------------------------------------------------------
process.env.MONGO_URI =
  'mongodb+srv://ayeshahmad24:brotherhood.12@pharmacy-cluster.2jqorox.mongodb.net/pharmacy?retryWrites=true&w=majority&appName=pharmacy-cluster';
process.env.JWT_SECRET = 'this_is_my_secret_key';
process.env.PORT = process.env.PORT || '5000';
process.env.NODE_ENV = 'production';

const PORT = process.env.PORT;
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let logFile = null;

// --- Logging -------------------------------------------------------------
// Writes startup diagnostics to a file we can read after launching the .exe.
function initLog() {
  try {
    logFile = path.join(app.getPath('userData'), 'launch-log.txt');
    fs.writeFileSync(logFile, `--- Pharmacy POS launch ${new Date().toISOString()} ---\n`);
  } catch (_) {
    logFile = null;
  }
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { if (logFile) fs.appendFileSync(logFile, line); } catch (_) { }
  console.log(msg);
}

// Surface any fatal error visibly instead of failing silently.
function fatal(stage, err) {
  const message = `${stage}: ${err && err.stack ? err.stack : err}`;
  log('FATAL ' + message);
  const where = logFile ? `\n\nFull log:\n${logFile}` : '';
  try {
    dialog.showErrorBox('Pharmacy POS failed to start', message + where);
  } catch (_) { }
}

// Boot the existing Express backend in-process. server.js connects to Atlas,
// serves the built frontend from pharmacy-backend/public, and starts listening.
function startBackend() {
  const serverPath = path.join(__dirname, 'pharmacy-backend', 'server.js');
  log('Requiring backend: ' + serverPath);
  log('Backend exists on disk: ' + fs.existsSync(serverPath));
  require(serverPath);
  log('Backend module loaded');
}

// Poll the server until it responds, so we never load a blank window.
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Backend did not respond on ' + url + ' within ' + timeoutMs + 'ms'));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

function loadingHtml(text) {
  const safe = String(text).replace(/</g, '&lt;');
  return 'data:text/html,' + encodeURIComponent(
    `<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#334">
     <div style="text-align:center"><h2>Pharmacy POS</h2><p>${safe}</p></div></body></html>`);
}

// loadURL rejects if a newer navigation interrupts it (ERR_ABORTED) — that's
// normal here, so swallow load errors and never let them become fatal dialogs.
async function safeLoad(win, url) {
  try {
    await win.loadURL(url);
  } catch (err) {
    log('Navigation note (ignored): ' + (err && err.message ? err.message : err));
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true, // show immediately so we never get a silent no-window launch
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Open external links in the system browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await safeLoad(mainWindow, loadingHtml('Starting'));
}

// Native printing. The renderer sends a full HTML document; we render it in an
// offscreen window and print through Electron's own pipeline. This replaces the
// old window.open()+window.print() flow, which Electron's popup handler blocked.
ipcMain.handle('print-html', (event, html) => {
  return new Promise((resolve) => {
    let printWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) {}
      printWin = null;
      resolve(result);
    };

    printWin.webContents.once('did-finish-load', () => {
      // Let layout settle one tick before invoking the print dialog.
      setTimeout(() => {
        try {
          printWin.webContents.print(
            { silent: false, printBackground: true, margins: { marginType: 'none' } },
            (success, failureReason) => {
              log('Print result: success=' + success + ' reason=' + (failureReason || 'n/a'));
              done({ success, reason: failureReason || null });
            }
          );
        } catch (err) {
          log('Print threw: ' + (err && err.message ? err.message : err));
          done({ success: false, reason: String(err && err.message ? err.message : err) });
        }
      }, 150);
    });

    printWin.webContents.once('did-fail-load', (_e, code, desc) => {
      done({ success: false, reason: 'load failed: ' + desc + ' (' + code + ')' });
    });

    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
});

app.whenReady().then(async () => {
  initLog();
  Menu.setApplicationMenu(null);

  await createWindow();

  // Boot the backend; a require failure (e.g. missing node_modules) lands here.
  try {
    startBackend();
  } catch (err) {
    fatal('Backend failed to load', err);
    if (mainWindow) await safeLoad(mainWindow, loadingHtml('Backend failed to load. See the error dialog / log file.'));
    return;
  }

  // Wait for it to listen, then load the real UI.
  try {
    await waitForServer(`${APP_URL}/ping`);
    log('Backend is up, loading UI');
    await safeLoad(mainWindow, APP_URL);
    log('UI loaded');
  } catch (err) {
    fatal('Backend did not start', err);
    if (mainWindow) await safeLoad(mainWindow, loadingHtml('Backend did not start. See the error dialog / log file.'));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A real crash (e.g. an async EADDRINUSE from app.listen) gets a dialog.
process.on('uncaughtException', (err) => fatal('Uncaught exception', err));
// Rejections are usually just interrupted navigations — log only, don't alarm.
process.on('unhandledRejection', (err) => log('Unhandled rejection (ignored): ' + (err && err.stack ? err.stack : err)));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
