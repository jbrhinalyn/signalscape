import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppStatus,
  PublicAppConfig,
  SdkStatusEvent,
  SignalScapeDesktopApi,
} from './ipc/contracts.js';

// A sandboxed Electron preload cannot require sibling JavaScript modules.
// Mirror the fixed channel names here; tests verify they match contracts.ts.
const IPC_CHANNEL = Object.freeze({
  appStatus: 'signalscape:app-status',
  publicConfig: 'signalscape:public-config',
  sdkStatus: 'signalscape:sdk-status',
} as const);
const SDK_STATUSES = ['idle', 'starting', 'ready', 'stopped', 'error'];
const SDK_ERROR_CODES = [
  'camera-permission-denied', 'camera-unavailable', 'sdk-unavailable', 'unknown',
];

function isSdkStatusEvent(value: unknown): value is SdkStatusEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'status' && key !== 'errorCode')) return false;
  if (typeof record['status'] !== 'string' || !SDK_STATUSES.includes(record['status'])) return false;
  const code = record['errorCode'];
  return record['status'] === 'error'
    ? typeof code === 'string' && SDK_ERROR_CODES.includes(code)
    : code === undefined;
}

// Fixed, capability-based bridge only. Do not expose ipcRenderer, arbitrary
// channel names, Electron events, Node globals, or filesystem access.
const desktopApi: SignalScapeDesktopApi = {
  apiVersion: 1,
  getAppStatus: () => ipcRenderer.invoke(IPC_CHANNEL.appStatus) as Promise<AppStatus>,
  getPublicConfig: () => ipcRenderer.invoke(IPC_CHANNEL.publicConfig) as Promise<PublicAppConfig>,
  onSdkStatus: (listener: (event: Readonly<SdkStatusEvent>) => void): (() => void) => {
    if (typeof listener !== 'function') {
      throw new TypeError('SDK status listener must be a function');
    }
    const onStatus = (_event: IpcRendererEvent, payload: unknown): void => {
      if (!isSdkStatusEvent(payload)) return;
      // Only validated primitives cross into Angular, never the Electron event.
      const cleanEvent: Readonly<SdkStatusEvent> = Object.freeze(
        payload.errorCode === undefined
          ? { status: payload.status }
          : { status: payload.status, errorCode: payload.errorCode },
      );
      listener(cleanEvent);
    };
    ipcRenderer.on(IPC_CHANNEL.sdkStatus, onStatus);
    return () => ipcRenderer.removeListener(IPC_CHANNEL.sdkStatus, onStatus);
  },
};

contextBridge.exposeInMainWorld('signalScape', Object.freeze(desktopApi));
