import type { CameraStateEvent, CameraMeasurementEvent, CameraValidationEvent,
  CameraTransportEvent } from '../ipc/contracts.js';
import { adaptSmartSpectraRates, type SignalEvent } from '../signals/model.js';

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
  on(name: 'processingStatus' | 'validationStatus' | 'metrics' | 'error' |
    'frameSentThrough', callback: (...args: unknown[]) => void): NativeSession;
  useCustomInput(): NativeSession;
  start(): void;
  sendFrame(data: Uint8Array, width: number, height: number, stride: number,
    pixelFormat: number, timestampUs: number): boolean;
  destroy(): Promise<void>;
}
interface Decoder { decodeMetrics(data: Uint8Array): unknown; }

export type CameraEvent = CameraStateEvent | CameraMeasurementEvent |
  CameraValidationEvent | CameraTransportEvent | SignalEvent;
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
  private lastTransportReport = 0;
  private framesReceived = 0;
  private framesAccepted = 0;
  private framesRejected = 0;
  private framesForwarded = 0;
  private stopping: Promise<void> | null = null;
  // Retain a failed teardown target so retries cannot construct a second SDK.
  private pendingDestroy: NativeSession | null = null;

  private reportTransport(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastTransportReport < 1000) return;
    this.lastTransportReport = now;
    this.emit({ kind: 'transport', framesReceived: this.framesReceived,
      framesAccepted: this.framesAccepted, framesRejected: this.framesRejected,
      framesForwarded: this.framesForwarded });
  }

  constructor(
    private readonly emit: Emit,
    private readonly load: (name: string) => unknown = (name) => require(name) as unknown,
    private readonly getKey: () => string | undefined = () => process.env['SMARTSPECTRA_API_KEY'],
  ) {}

  private failSession(sdk: NativeSession, errorCode: number | null): void {
    // Ignore late callbacks from a destroyed or superseded native session.
    if (this.session !== sdk) return;
    this.emit({ kind: 'state', state: 'error', errorCode });
    // Revoke native frame delivery immediately. The renderer independently
    // closes its MediaStream when it receives the error event.
    void this.stop().catch(() => { /* Failure is surfaced as a sanitized state event. */ });
  }

  start(): { ok: boolean; reason?: 'api-key-not-configured' | 'sdk-unavailable' | 'sdk-error' } {
    if (this.session !== null || this.stopping !== null ||
      this.pendingDestroy !== null) return { ok: false, reason: 'sdk-error' };
    const key = this.getKey();
    if (!key?.trim()) return { ok: false, reason: 'api-key-not-configured' };
    let sdk: NativeSession | null = null;
    let runtimeLoaded = false;
    try {
      const runtime = this.load('@smartspectra/node-sdk') as NativeRuntime;
      const decoder = this.load('@smartspectra/node-sdk/messages') as Decoder;
      if (typeof runtime.SmartSpectraSDK !== 'function' ||
        typeof decoder.decodeMetrics !== 'function') {
        return { ok: false, reason: 'sdk-unavailable' };
      }
      runtimeLoaded = true;
      this.decoder = decoder;
      this.format = runtime.PixelFormat.kRGBA;
      this.lastTimestamp = 0;
      this.lastFrameAt = 0;
      this.packets = 0;
      this.breathing = false;
      this.pulse = false;
      this.lastMetricsReport = 0;
      this.lastTransportReport = 0;
      this.framesReceived = 0;
      this.framesAccepted = 0;
      this.framesRejected = 0;
      this.framesForwarded = 0;
      sdk = new runtime.SmartSpectraSDK({
        apiKey: key,
        requestedMetrics: [...runtime.breathingMetrics, ...runtime.cardioMetrics],
        enableTelemetry: false,
        logLevel: runtime.SmartSpectraLogLevel.kNone,
      });
      // Assign before start(), since native errors may be delivered synchronously.
      const current = sdk;
      let startupFailed = false;
      sdk.on('processingStatus', (raw) => {
        if (this.session !== current) return;
        if (raw === 5) {
          startupFailed = true;
          this.failSession(current, null);
          return;
        }
        const state = raw === 3 ? 'running' : raw === 2 ? 'starting' :
          raw === 4 ? 'stopping' : raw === 1 ? 'idle' : null;
        if (state !== null) this.emit({ kind: 'state', state });
      });
      sdk.on('validationStatus', (raw) => {
        if (this.session !== current) return;
        if (Number.isInteger(raw) && typeof raw === 'number' && raw >= 0 && raw <= 17) {
          this.emit({ kind: 'validation', code: raw });
        }
      });
      sdk.on('error', (raw) => {
        if (this.session !== current) return;
        startupFailed = true;
        const code = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 20
          ? raw : null;
        this.failSession(current, code);
      });
      sdk.on('frameSentThrough', (sent) => {
        if (sent === true && this.session === current) {
          this.framesForwarded += 1;
          this.reportTransport();
        }
      });
      sdk.on('metrics', (raw) => {
        if (this.session !== current || !(raw instanceof Uint8Array) || !this.decoder) return;
        this.packets += 1;
        try {
          const decoded = this.decoder.decodeMetrics(raw);
          // Only typed, strictly validated rate events leave the native process.
          for (const event of adaptSmartSpectraRates(decoded, Date.now())) this.emit(event);
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
      // A synchronous SDK error must never be reported to Angular as success.
      return startupFailed || this.session !== sdk
        ? { ok: false, reason: 'sdk-error' } : { ok: true };
    } catch {
      this.decoder = null;
      if (sdk && this.pendingDestroy !== sdk) {
        // Includes constructor-success / useCustomInput failure, start throw,
        // and asynchronous rejection of the shutdown after an error.
        if (this.session === null && this.stopping === null) this.session = sdk;
        if (this.session === sdk) {
          void this.stop().catch(() => { /* Failure is surfaced as state. */ });
        }
      }
      return { ok: false, reason: runtimeLoaded ? 'sdk-error' : 'sdk-unavailable' };
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
    this.framesReceived += 1;
    try {
      if (this.session.sendFrame(data, width, height, width * 4, this.format, timestampUs)) {
        this.framesAccepted += 1;
      } else {
        // False is a rejected submission, not a successful measurement.
        this.framesRejected += 1;
      }
      this.reportTransport();
    } catch {
      this.framesRejected += 1;
      this.reportTransport(true);
      const failed = this.session;
      if (failed) this.failSession(failed, null);
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const sdk = this.session ?? this.pendingDestroy;
    this.session = null;
    this.decoder = null;
    if (!sdk) return;
    this.pendingDestroy = sdk;
    this.reportTransport(true);
    // Promise.resolve creates the teardown task before invoking native code;
    // even a synchronous destroy() throw must not strand the stopping lock.
    const task: Promise<void> = Promise.resolve().then(() => sdk.destroy()).then(() => {
      this.pendingDestroy = null;
      this.lastTimestamp = 0;
      this.emit({ kind: 'state', state: 'stopped' });
    }, () => {
      // Do not report a successful cleanup or permit a new SDK allocation.
      // A later explicit disarm may retry destroy() on this same instance.
      this.emit({ kind: 'state', state: 'error', errorCode: null });
      throw new Error('SmartSpectra native cleanup failed');
    }).finally(() => {
      if (this.stopping === task) this.stopping = null;
    });
    this.stopping = task;
    return task;
  }

}
