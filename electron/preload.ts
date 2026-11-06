import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppStatus,
  CameraEvent,
  CameraFrame,
  CameraStartResult,
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
  cameraArm: 'signalscape:camera-arm',
  cameraDisarm: 'signalscape:camera-disarm',
  measurementStart: 'signalscape:measurement-start',
  measurementStop: 'signalscape:measurement-stop',
  cameraFrame: 'signalscape:camera-frame',
  cameraEvent: 'signalscape:camera-event',
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

// Sandboxed preload cannot import the contracts module at runtime.
// Validate incoming native events and copy only allowlisted primitives.
function isCameraEvent(value: unknown): value is CameraEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry);
  const only = (...names: string[]): boolean => keys.every((name) => names.includes(name));
  if (entry['kind'] === 'rate' || entry['kind'] === 'unavailable') {
    const signal = entry['signal'];
    if (signal !== 'pulse' && signal !== 'breathing') return false;
    const timestamp = entry['timestampMs'];
    if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) return false;
    if (entry['kind'] === 'unavailable') {
      return only('kind', 'signal', 'reason', 'timestampMs') && keys.length === 4 &&
        (entry['reason'] === 'invalid' || entry['reason'] === 'missing');
    }
    return only('kind', 'signal', 'value', 'unit', 'confidence', 'stable', 'timestampMs') &&
      keys.length === 7 && entry['unit'] === (signal === 'pulse' ? 'bpm' : 'breaths/min') &&
      typeof entry['value'] === 'number' && Number.isFinite(entry['value']) &&
      entry['value'] >= (signal === 'pulse' ? 40 : 5) &&
      entry['value'] <= (signal === 'pulse' ? 110 : 40) &&
      typeof entry['confidence'] === 'number' && Number.isFinite(entry['confidence']) &&
      entry['confidence'] >= 0 && entry['confidence'] <= 100 &&
      typeof entry['stable'] === 'boolean';
  }
  if (entry['kind'] === 'state') {
    const code = entry['errorCode'];
    return only('kind', 'state', 'errorCode') &&
      ['idle', 'starting', 'running', 'stopping', 'stopped', 'error'].includes(String(entry['state'])) &&
      (code === undefined || code === null ||
        (typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 20));
  }
  if (entry['kind'] === 'validation') {
    return only('kind', 'code') && typeof entry['code'] === 'number' &&
      Number.isInteger(entry['code']) && entry['code'] >= 0 && entry['code'] <= 17;
  }
  if (entry['kind'] === 'metrics') {
    return only('kind', 'packets', 'breathingObserved', 'pulseObserved') &&
      typeof entry['packets'] === 'number' && Number.isSafeInteger(entry['packets']) &&
      entry['packets'] >= 0 && typeof entry['breathingObserved'] === 'boolean' &&
      typeof entry['pulseObserved'] === 'boolean';
  }
  if (entry['kind'] === 'transport') {
    return only('kind', 'framesReceived', 'framesAccepted', 'framesRejected', 'framesForwarded') &&
      ['framesReceived', 'framesAccepted', 'framesRejected', 'framesForwarded'].every((key) =>
        typeof entry[key] === 'number' && Number.isSafeInteger(entry[key]) && entry[key] >= 0) &&
      (entry['framesAccepted'] as number) + (entry['framesRejected'] as number) <=
        (entry['framesReceived'] as number);
  }
  return false;
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
  authorizeCameraPreview: () => ipcRenderer.invoke(IPC_CHANNEL.cameraArm) as Promise<boolean>,
  releaseCameraPreview: () => ipcRenderer.invoke(IPC_CHANNEL.cameraDisarm) as Promise<void>,
  startNativeMeasurement: () => ipcRenderer.invoke(IPC_CHANNEL.measurementStart) as Promise<CameraStartResult>,
  stopNativeMeasurement: () => ipcRenderer.invoke(IPC_CHANNEL.measurementStop) as Promise<void>,
  pushCameraFrame: (frame: CameraFrame): void => {
    // Fixed data-only channel, bounded pixels, no dynamic channel or argument.
    if (!frame || frame.width !== 640 || frame.height !== 480 ||
      !(frame.pixels instanceof Uint8Array) ||
      frame.pixels.byteLength !== 640 * 480 * 4 ||
      !Number.isFinite(frame.timestampUs) || frame.timestampUs < 0) return;
    ipcRenderer.send(IPC_CHANNEL.cameraFrame, {
      width: 640, height: 480, timestampUs: frame.timestampUs, pixels: frame.pixels,
    });
  },
  onCameraEvent: (listener: (event: Readonly<CameraEvent>) => void): (() => void) => {
    if (typeof listener !== 'function') throw new TypeError('Camera event listener must be a function');
    const handler = (_event: IpcRendererEvent, raw: unknown): void => {
      if (!isCameraEvent(raw)) return;
      const event = raw.kind === 'rate'
        ? { kind: raw.kind, signal: raw.signal, value: raw.value, unit: raw.unit,
            confidence: raw.confidence, stable: raw.stable, timestampMs: raw.timestampMs }
        : raw.kind === 'unavailable'
          ? { kind: raw.kind, signal: raw.signal, reason: raw.reason,
              timestampMs: raw.timestampMs }
        : raw.kind === 'state'
        ? { kind: raw.kind, state: raw.state, ...(raw.errorCode === undefined
            ? {} : { errorCode: raw.errorCode }) }
        : raw.kind === 'validation'
          ? { kind: raw.kind, code: raw.code }
          : raw.kind === 'metrics'
            ? { kind: raw.kind, packets: raw.packets,
                breathingObserved: raw.breathingObserved, pulseObserved: raw.pulseObserved }
            : { kind: raw.kind, framesReceived: raw.framesReceived,
                framesAccepted: raw.framesAccepted, framesRejected: raw.framesRejected,
                framesForwarded: raw.framesForwarded };
      listener(Object.freeze(event) as CameraEvent);
    };
    ipcRenderer.on(IPC_CHANNEL.cameraEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNEL.cameraEvent, handler);
  },
};

contextBridge.exposeInMainWorld('signalScape', Object.freeze(desktopApi));
