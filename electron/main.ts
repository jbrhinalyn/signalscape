import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerDesktopIpc } from './ipc/handlers.js';
import { registerCameraIpc } from './camera/ipc.js';

const DEV_SERVER_URL = 'http://127.0.0.1:4200/';
const USE_DEV_SERVER = process.env['SIGNALSCAPE_DEV_SERVER'] === '1';
const SMOKE_TEST = process.env['SIGNALSCAPE_SMOKE_TEST'] === '1';
const ENTRY_FILE = join(__dirname, '..', 'renderer', 'index.html');
const ENTRY_URL = USE_DEV_SERVER ? DEV_SERVER_URL : pathToFileURL(ENTRY_FILE).href;

let mainWindow: BrowserWindow | null = null;
let cameraBridge: ReturnType<typeof registerCameraIpc> | null = null;

// Electron's renderer must remain sandboxed even when opening local content.
app.enableSandbox();

function createWindow(): void {
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
    if (url !== ENTRY_URL) event.preventDefault();
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
    ? window.loadURL(ENTRY_URL)
    : window.loadFile(ENTRY_FILE);
  void load.catch((error: unknown) => {
    console.error('Unable to launch SignalScape renderer:', error);
    if (SMOKE_TEST) app.exit(1);
  });

  window.on('closed', () => {
    void cameraBridge?.shutdown().catch(() => {
      // Closing the window still releases Chromium's camera stream.
    });
    if (mainWindow === window) mainWindow = null;
  });
}

void app.whenReady().then(() => {
  // Authorize only requests from our live primary top-level renderer frame.
  const isTrustedSender = (event: {
    sender: Electron.WebContents;
    senderFrame: Electron.WebFrameMain | null;
  }): boolean => mainWindow !== null &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    event.senderFrame.url === ENTRY_URL;

  registerDesktopIpc({
    ipcMain,
    isPackaged: app.isPackaged,
    getVersion: () => app.getVersion(),
    platform: process.platform,
    isTrustedSender,
  });

  cameraBridge = registerCameraIpc({
    ipcMain,
    isTrustedSender,
    // Unpackaged developer builds only. Environment keys must never unlock a
    // distributed review installer. Public SDK distribution is NOT approved.
    nativeMeasurementAllowed: !app.isPackaged,
    emitToRenderer: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('signalscape:camera-event', event);
      }
    },
  });

  // Permission is denied by default, including on app startup. Camera can
  // only be armed by trusted, explicit Preview button IPC and is revoked when
  // the preview stops or window closes. No microphone permissions are granted.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = details.requestingUrl || contents.getURL();
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes;
    const onlyVideo = Array.isArray(mediaTypes) && mediaTypes.includes('video') &&
      !mediaTypes.includes('audio');
    callback(Boolean(permission === 'media' && onlyVideo &&
      mainWindow && !mainWindow.isDestroyed() &&
      contents === mainWindow.webContents &&
      mainWindow.webContents.getURL() === ENTRY_URL &&
      url === ENTRY_URL && cameraBridge?.isCameraArmed()));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    Boolean(permission === 'media' && details.mediaType !== 'audio' && mainWindow &&
      !mainWindow.isDestroyed() && contents === mainWindow.webContents &&
      mainWindow.webContents.getURL() === ENTRY_URL &&
      cameraBridge?.isCameraArmed()));
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

// A quit request must revoke camera permission and give native destroy()
// a bounded chance to finish. Close the window after disarming so Chromium
// releases the video stream even if native teardown is slow or fails.
let quitReady = false;
let quitTask: Promise<void> | null = null;
app.on('before-quit', (event) => {
  if (quitReady || !cameraBridge) return;
  event.preventDefault();
  if (quitTask) return;
  const teardown = cameraBridge.shutdown().catch(() => {
    // Keep details and native error messages out of renderer/log output.
  });
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  quitTask = Promise.race([teardown, deadline]).then(() => {
    quitReady = true;
    app.quit();
  });
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
