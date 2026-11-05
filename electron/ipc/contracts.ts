/**
 * The complete renderer-visible desktop surface. Do not add broad send/invoke
 * helpers here; any new capability needs a dedicated, reviewed method.
 */
export const IPC_API_VERSION = 1 as const;

export const IPC_CHANNEL = Object.freeze({
  appStatus: 'signalscape:app-status',
  publicConfig: 'signalscape:public-config',
  sdkStatus: 'signalscape:sdk-status',
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
