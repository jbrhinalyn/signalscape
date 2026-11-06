import type { SignalEvent } from '../signals/model.js';

/**
 * The complete renderer-visible desktop surface. Do not add broad send/invoke
 * helpers here; any new capability needs a dedicated, reviewed method.
 */
export const IPC_API_VERSION = 1 as const;

export const IPC_CHANNEL = Object.freeze({
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

export type DesktopPlatform = 'linux' | 'darwin' | 'win32' | 'other';

export interface AppStatus {
  readonly apiVersion: typeof IPC_API_VERSION;
  readonly version: string;
  readonly platform: DesktopPlatform;
  readonly ready: true;
}

export interface PublicAppConfig {
  readonly mode: 'development' | 'production';
  readonly features: Readonly<{
    cameraEnabled: false;
    smartSpectraEnabled: false;
    telemetryEnabled: false;
  }>;
}

export type SdkStatus = 'idle' | 'starting' | 'ready' | 'stopped' | 'error';
export type SdkErrorCode =
  | 'camera-permission-denied'
  | 'camera-unavailable'
  | 'sdk-unavailable'
  | 'unknown';

export interface SdkStatusEvent {
  readonly status: SdkStatus;
  readonly errorCode?: SdkErrorCode;
}

export interface SignalScapeDesktopApi {
  readonly apiVersion: typeof IPC_API_VERSION;
  getAppStatus(): Promise<AppStatus>;
  getPublicConfig(): Promise<PublicAppConfig>;
  onSdkStatus(listener: (event: Readonly<SdkStatusEvent>) => void): () => void;
  authorizeCameraPreview(): Promise<boolean>;
  releaseCameraPreview(): Promise<void>;
  startNativeMeasurement(): Promise<CameraStartResult>;
  stopNativeMeasurement(): Promise<void>;
  pushCameraFrame(frame: CameraFrame): void;
  onCameraEvent(listener: (event: Readonly<CameraEvent>) => void): () => void;
}

const SDK_STATUSES: readonly string[] = ['idle', 'starting', 'ready', 'stopped', 'error'];
const SDK_ERROR_CODES: readonly string[] = [
  'camera-permission-denied',
  'camera-unavailable',
  'sdk-unavailable',
  'unknown',
];

/** Validate native-to-renderer events at runtime, not just at compile time. */
export function isSdkStatusEvent(value: unknown): value is SdkStatusEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'status' && key !== 'errorCode')) return false;
  if (typeof record['status'] !== 'string' || !SDK_STATUSES.includes(record['status'])) return false;
  const errorCode = record['errorCode'];
  if (record['status'] === 'error') {
    return typeof errorCode === 'string' && SDK_ERROR_CODES.includes(errorCode);
  }
  return errorCode === undefined;
}

/** Preview pixels travel only from a consented renderer camera to native SDK. */
export interface CameraFrame {
  readonly width: number;
  readonly height: number;
  readonly timestampUs: number;
  readonly pixels: Uint8Array;
}
export type CameraStartResult = Readonly<{
  ok: boolean;
  reason?: 'camera-permission-denied' | 'api-key-not-configured' | 'sdk-unavailable' | 'sdk-error';
}>;
export interface CameraStateEvent {
  readonly kind: 'state';
  readonly state: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  readonly errorCode?: number | null;
}
export interface CameraValidationEvent {
  readonly kind: 'validation';
  readonly code: number;
}
export interface CameraMeasurementEvent {
  readonly kind: 'metrics';
  readonly packets: number;
  readonly breathingObserved: boolean;
  readonly pulseObserved: boolean;
}
/** Aggregate counts only; no camera data, timestamps, keys or vital values. */
export interface CameraTransportEvent {
  readonly kind: 'transport';
  readonly framesReceived: number;
  readonly framesAccepted: number;
  readonly framesRejected: number;
  readonly framesForwarded: number;
}
export type CameraEvent = CameraStateEvent | CameraValidationEvent |
  CameraMeasurementEvent | CameraTransportEvent | SignalEvent;

/** Preload must validate all values before forwarding events to Angular. */
export function isCameraEvent(value: unknown): value is CameraEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const only = (...allowed: string[]): boolean => keys.every((key) => allowed.includes(key));
  if (record['kind'] === 'rate' || record['kind'] === 'unavailable') {
    const signal = record['signal'];
    if (signal !== 'pulse' && signal !== 'breathing') return false;
    const timestamp = record['timestampMs'];
    if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) return false;
    if (record['kind'] === 'unavailable') {
      return only('kind', 'signal', 'reason', 'timestampMs') && keys.length === 4 &&
        (record['reason'] === 'invalid' || record['reason'] === 'missing');
    }
    const min = signal === 'pulse' ? 40 : 5;
    const max = signal === 'pulse' ? 110 : 40;
    return only('kind', 'signal', 'value', 'unit', 'confidence', 'stable', 'timestampMs') &&
      keys.length === 7 && record['unit'] === (signal === 'pulse' ? 'bpm' : 'breaths/min') &&
      typeof record['value'] === 'number' && Number.isFinite(record['value']) &&
      record['value'] >= min && record['value'] <= max &&
      typeof record['confidence'] === 'number' && Number.isFinite(record['confidence']) &&
      record['confidence'] >= 0 && record['confidence'] <= 100 &&
      typeof record['stable'] === 'boolean';
  }
  if (record['kind'] === 'state') {
    const states = ['idle', 'starting', 'running', 'stopping', 'stopped', 'error'];
    const errorCode = record['errorCode'];
    return only('kind', 'state', 'errorCode') &&
      typeof record['state'] === 'string' && states.includes(record['state']) &&
      (errorCode === undefined || errorCode === null ||
        (Number.isInteger(errorCode) && typeof errorCode === 'number' &&
          errorCode >= 0 && errorCode <= 20));
  }
  if (record['kind'] === 'validation') {
    return only('kind', 'code') && typeof record['code'] === 'number' &&
      Number.isInteger(record['code']) && record['code'] >= 0 && record['code'] <= 17;
  }
  if (record['kind'] === 'metrics') {
    return only('kind', 'packets', 'breathingObserved', 'pulseObserved') &&
      typeof record['packets'] === 'number' &&
      Number.isSafeInteger(record['packets']) && record['packets'] >= 0 &&
      typeof record['breathingObserved'] === 'boolean' &&
      typeof record['pulseObserved'] === 'boolean';
  }
  if (record['kind'] === 'transport') {
    return only('kind', 'framesReceived', 'framesAccepted', 'framesRejected', 'framesForwarded') &&
      ['framesReceived', 'framesAccepted', 'framesRejected', 'framesForwarded'].every((key) => {
        const count = record[key];
        return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
      }) &&
      (record['framesAccepted'] as number) + (record['framesRejected'] as number) <=
        (record['framesReceived'] as number);
  }
  return false;
}
