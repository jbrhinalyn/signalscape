import type { CameraStateEvent, CameraMeasurementEvent } from '../ipc/contracts.js';

interface NativeRuntime {
  readonly PixelFormat: { readonly kRGBA: number };
  readonly SmartSpectraLogLevel: { readonly kNone: number };
  readonly breathingMetrics: readonly number[];
  readonly cardioMetrics: readonly number[];
  readonly SmartSpectraSDK: new (options: {
    apiKey: string;
    requestedMetrics: number[];
    enableTelemetry: false;
    logLevel: number;
  }) => NativeSession;
}
interface NativeSession {
  on(name: 'processingStatus' | 'validationStatus' | 'metrics' | 'error', callback: (...args: unknown[]) => void): NativeSession;
  useCustomInput(): NativeSession;
  start(): void;
  sendFrame(data: Uint8Array, width: number, height: number, stride: number,
    pixelFormat: number, timestampUs: number): boolean;
  destroy(): Promise<void>;
}
interface Decoder { decodeMetrics(data: Uint8Array): unknown; }

export type CameraEvent = CameraStateEvent | CameraMeasurementEvent;
type Emit = (event: CameraEvent) => void;

function hasObservedValue(data: unknown, section: string, key: string): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const group = (data as Record<string, unknown>)[section];
  if (typeof group !== 'object' || group === null || Array.isArray(group)) return false;
  const samples = (group as Record<string, unknown>)[key];
  if (!Array.isArray(samples)) return false;
  return samples.some((sample: unknown) =>
    typeof sample === 'object' && sample !== null &&
    typeof (sample as Record<string, unknown>)['value'] === 'number' &&
    Number.isFinite((sample as Record<string, number>)['value']) &&
    (sample as Record<string, number>)['value'] > 0);
}

export class SmartSpectraCapture {
  private session: NativeSession | null = null;
  private format = 2;
  private decoder: Decoder | null = null;
  private lastTimestamp = 0;
  private lastFrameAt = 0;
  private packets = 0;
  private breathing = false;
  private pulse = false;
  private lastMetricsReport = 0;
  private stopping: Promise<void> | null = null;

  constructor(
    private readonly emit: Emit,
    private readonly load: (name: string) => unknown = (name) => require(name) as unknown,
    private readonly getKey: () => string | undefined = () => process.env['SMARTSPECTRA_API_KEY'],
  ) {}

  start(): { ok: boolean; reason?: 'api-key-not-configured' | 'sdk-unavailable' | 'sdk-error' } {
    if (this.session !== null || this.stopping !== null) return { ok: false, reason: 'sdk-error' };
    const key = this.getKey();
    if (!key?.trim()) return { ok: false, reason: 'api-key-not-configured' };
    let sdk: NativeSession | null = null;
    try {
      const runtime = this.load('@smartspectra/node-sdk') as NativeRuntime;
      const decoder = this.load('@smartspectra/node-sdk/messages') as Decoder;
      if (typeof runtime.SmartSpectraSDK !== 'function' ||
        typeof decoder.decodeMetrics !== 'function') {
        return { ok: false, reason: 'sdk-unavailable' };
      }
      this.decoder = decoder;
      this.format = runtime.PixelFormat.kRGBA;
      this.lastTimestamp = 0;
      this.lastFrameAt = 0;
      this.packets = 0;
      this.breathing = false;
      this.pulse = false;
      this.lastMetricsReport = 0;
      sdk = new runtime.SmartSpectraSDK({
        apiKey: key,
        requestedMetrics: [...runtime.breathingMetrics, ...runtime.cardioMetrics],
        enableTelemetry: false,
        logLevel: runtime.SmartSpectraLogLevel.kNone,
      });
      sdk.on('processingStatus', (raw) => {
        const state = raw === 3 ? 'running' : raw === 2 ? 'starting' :
          raw === 4 ? 'stopping' : raw === 1 ? 'idle' : raw === 5 ? 'error' : null;
        if (state !== null) this.emit({ kind: 'state', state });
      });
      sdk.on('validationStatus', (raw) => {
        if (Number.isInteger(raw) && typeof raw === 'number' && raw >= 0 && raw <= 17) {
          this.emit({ kind: 'validation', code: raw });
        }
      });
      sdk.on('error', (raw) => {
        const code = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 20
          ? raw : null;
        this.emit({ kind: 'state', state: 'error', errorCode: code });
      });
      sdk.on('metrics', (raw) => {
        if (!(raw instanceof Uint8Array) || !this.decoder) return;
        this.packets += 1;
        try {
          const decoded = this.decoder.decodeMetrics(raw);
          this.breathing ||= hasObservedValue(decoded, 'breathing', 'rate');
          this.pulse ||= hasObservedValue(decoded, 'cardio', 'pulseRate');
        } catch { /* No raw metrics or SDK diagnostics enter logs. */ }
        const now = Date.now();
        if (now - this.lastMetricsReport > 1000) {
          this.lastMetricsReport = now;
          this.emit({ kind: 'metrics', packets: this.packets,
            breathingObserved: this.breathing, pulseObserved: this.pulse });
        }
      });
      sdk.useCustomInput();
      this.session = sdk;
      this.emit({ kind: 'state', state: 'starting' });
      sdk.start();
      return { ok: true };
    } catch {
      if (sdk) {
        const failed = sdk;
        this.stopping = failed.destroy().catch(() => {}).then(() => {
          this.stopping = null;
        });
      }
      this.session = null;
      this.decoder = null;
      return { ok: false, reason: sdk ? 'sdk-error' : 'sdk-unavailable' };
    }
  }

  submit(data: Uint8Array, width: number, height: number, timestampUs: number): void {
    if (!this.session || this.stopping) return;
    // Fixed size, bounded rate and monotonic timestamps: camera data is
    // forwarded in memory, never serialized to disk or logs.
    if (width !== 640 || height !== 480 || data.byteLength !== width * height * 4 ||
      !(data instanceof Uint8Array) || !Number.isFinite(timestampUs) ||
      timestampUs <= this.lastTimestamp || timestampUs < 0) return;
    const now = Date.now();
    if (now - this.lastFrameAt < 25) return;
    this.lastFrameAt = now;
    this.lastTimestamp = timestampUs;
    try {
      this.session.sendFrame(data, width, height, width * 4, this.format, timestampUs);
    } catch {
      this.emit({ kind: 'state', state: 'error', errorCode: null });
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const sdk = this.session;
    this.session = null;
    this.decoder = null;
    if (!sdk) return;
    this.stopping = (async () => {
      try {
        await sdk.destroy();
      } catch {
        this.emit({ kind: 'state', state: 'error', errorCode: null });
      } finally {
        this.lastTimestamp = 0;
        this.emit({ kind: 'state', state: 'stopped' });
        this.stopping = null;
      }
    })();
    return this.stopping;
  }
}
