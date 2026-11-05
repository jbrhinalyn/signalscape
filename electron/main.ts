import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEV_SERVER_URL = 'http://127.0.0.1:4200/';
const USE_DEV_SERVER = process.env['SIGNALSCAPE_DEV_SERVER'] === '1';
const SMOKE_TEST = process.env['SIGNALSCAPE_SMOKE_TEST'] === '1';

let mainWindow: BrowserWindow | null = null;

// Electron's renderer must remain sandboxed even when opening local content.
app.enableSandbox();

function createWindow(): void {
  const entryFile = join(__dirname, '..', 'renderer', 'index.html');
  const entryUrl = USE_DEV_SERVER ? DEV_SERVER_URL : pathToFileURL(entryFile).href;

  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: '#07121e',
    title: 'SignalScape',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = window;

  // Do not let renderer content navigate to arbitrary sites or spawn windows.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== entryUrl) event.preventDefault();
  });

  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 means a navigation was cancelled.
    console.error(`SignalScape renderer failed to load: ${description} (${code})`);
    if (SMOKE_TEST) app.exit(1);
  });
  if (SMOKE_TEST) {
    window.webContents.once('did-finish-load', () => app.exit(0));
  }

  const load = USE_DEV_SERVER
    ? window.loadURL(entryUrl)
    : window.loadFile(entryFile);
  void load.catch((error: unknown) => {
    console.error('Unable to launch SignalScape renderer:', error);
    if (SMOKE_TEST) app.exit(1);
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
}

void app.whenReady().then(() => {
  // No camera or other permissions are granted at this foundation stage.
  // A later milestone will implement user-initiated camera consent.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error: unknown) => {
  console.error('Electron initialization failed:', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
