/**
 * M3 measurement contract. Only these narrow numeric rate samples cross to
 * the renderer; the raw SDK object, face data and camera frames never do.
 * Timestamps are local arrival time in milliseconds (Date.now()), not
 * unverified SDK sample timestamps or video-frame timebases.
 */
export type SignalName = 'pulse' | 'breathing';
export type SignalQuality = 'disconnected' | 'warming' | 'ready' | 'degraded';
export type UnavailableReason = 'invalid' | 'missing';

export interface RateEvent {
  readonly kind: 'rate';
  readonly signal: SignalName;
  readonly value: number;
  readonly unit: 'bpm' | 'breaths/min';
  readonly confidence: number; // Presage: 0..100; never a medical accuracy claim
  readonly stable: boolean;
  readonly timestampMs: number;
}

export interface UnavailableEvent {
  readonly kind: 'unavailable';
  readonly signal: SignalName;
  readonly reason: UnavailableReason;
  readonly timestampMs: number;
}

export type SignalEvent = RateEvent | UnavailableEvent;
export interface SignalView {
  readonly quality: SignalQuality;
  readonly pulse: RateEvent | null;
  readonly breathing: RateEvent | null;
}

const LIMITS = {
  pulse: { min: 40, max: 110, unit: 'bpm', warmupMs: 12000 },
  breathing: { min: 5, max: 40, unit: 'breaths/min', warmupMs: 30000 },
} as const;
export const MIN_CONFIDENCE = 70; // conservative visualization policy, not a clinical cutoff
export const MAX_SIGNAL_AGE_MS = 4000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isSignalEvent(raw: unknown): raw is SignalEvent {
  const data = record(raw);
  if (!data) return false;
  const name = data['signal'];
  if (name !== 'pulse' && name !== 'breathing') return false;
  const keys = Object.keys(data);
  if (!validTimestamp(data['timestampMs'])) return false;
  if (data['kind'] === 'unavailable') {
    return keys.length === 4 && keys.every((key) =>
      ['kind', 'signal', 'reason', 'timestampMs'].includes(key)) &&
      (data['reason'] === 'invalid' || data['reason'] === 'missing');
  }
  if (data['kind'] !== 'rate') return false;
  const limits = LIMITS[name];
  return keys.length === 7 && keys.every((key) =>
    ['kind', 'signal', 'value', 'unit', 'confidence', 'stable', 'timestampMs'].includes(key)) &&
    data['unit'] === limits.unit &&
    typeof data['value'] === 'number' && Number.isFinite(data['value']) &&
    data['value'] >= limits.min && data['value'] <= limits.max &&
    typeof data['confidence'] === 'number' && Number.isFinite(data['confidence']) &&
    data['confidence'] >= 0 && data['confidence'] <= 100 &&
    typeof data['stable'] === 'boolean';
}

/** Only inspect the last SDK measurement; never revive earlier valid samples. */
export function adaptSmartSpectraRates(decoded: unknown, timestampMs: number): SignalEvent[] {
  if (!validTimestamp(timestampMs)) return [];
  const result: SignalEvent[] = [];
  const root = record(decoded);
  for (const [signal, section, field] of [
    ['pulse', 'cardio', 'pulseRate'],
    ['breathing', 'breathing', 'rate'],
  ] as const) {
    const samples = record(root?.[section])?.[field];
    // A packet can legitimately omit a requested metric. Aging in the state
    // machine handles that without marking another metric invalid.
    if (!Array.isArray(samples) || samples.length === 0) continue;
    const sample = record(samples[samples.length - 1]);
    const candidate = {
      kind: 'rate', signal, value: sample?.['value'],
      unit: LIMITS[signal].unit, confidence: sample?.['confidence'],
      stable: sample?.['stable'], timestampMs,
    };
    if (isSignalEvent(candidate)) {
      result.push(candidate);
    } else {
      result.push({ kind: 'unavailable', signal, reason: 'invalid', timestampMs });
    }
  }
  return result;
}

/**
 * Deterministic state machine. All times are injected by the caller and must
 * use the same clock. No timer, camera, SDK instance or storage is retained.
 * Samples are not displayed until framing, warm-up, confidence, stability and
 * freshness gates all pass.
 */
export class SignalQualityMachine {
  private startedAt: number | null = null;
  private validationSeen = false;
  private framingOk = false;
  private latest: Partial<Record<SignalName, RateEvent>> = {};
  private lastTimestamp: Record<SignalName, number> = { pulse: -1, breathing: -1 };

  connect(nowMs: number): void {
    if (!validTimestamp(nowMs)) return;
    this.startedAt = nowMs;
    this.validationSeen = false;
    this.framingOk = false;
    this.latest = {};
    this.lastTimestamp = { pulse: -1, breathing: -1 };
  }

  disconnect(): void {
    this.startedAt = null;
    this.validationSeen = false;
    this.framingOk = false;
    this.latest = {};
    this.lastTimestamp = { pulse: -1, breathing: -1 };
  }

  validate(code: number): void {
    if (this.startedAt === null || !Number.isInteger(code) || code < 0 || code > 17) return;
    this.validationSeen = true;
    this.framingOk = code === 0;
    if (!this.framingOk) this.latest = {}; // Never retain a reading across bad framing.
  }

  accept(event: SignalEvent, nowMs: number): void {
    if (this.startedAt === null || !validTimestamp(nowMs) || !isSignalEvent(event)) return;
    if (event.timestampMs <= this.lastTimestamp[event.signal]) return;
    this.lastTimestamp[event.signal] = event.timestampMs;
    if (event.timestampMs < this.startedAt ||
      event.timestampMs > nowMs + 250 ||
      nowMs - event.timestampMs > MAX_SIGNAL_AGE_MS ||
      event.kind === 'unavailable') {
      delete this.latest[event.signal];
      return;
    }
    // An invalid/unstable reading replaces the last one, never a cached
    // earlier value that happened to pass the quality checks.
    this.latest[event.signal] = event;
  }

  snapshot(nowMs: number): SignalView {
    if (this.startedAt === null || !validTimestamp(nowMs) || nowMs < this.startedAt) {
      return { quality: 'disconnected', pulse: null, breathing: null };
    }
    const elapsed = nowMs - this.startedAt;
    const usable = (name: SignalName): RateEvent | null => {
      const sample = this.latest[name];
      if (!sample || !this.framingOk || !this.validationSeen ||
        elapsed < LIMITS[name].warmupMs ||
        sample.timestampMs > nowMs + 250 ||
        nowMs - sample.timestampMs > MAX_SIGNAL_AGE_MS ||
        sample.confidence < MIN_CONFIDENCE || !sample.stable) return null;
      return sample;
    };
    const pulse = usable('pulse');
    const breathing = usable('breathing');
    const quality: SignalQuality = this.validationSeen && !this.framingOk
      ? 'degraded' : pulse || breathing ? 'ready'
        : elapsed < LIMITS.breathing.warmupMs ? 'warming' : 'degraded';
    return { quality, pulse, breathing };
  }
}
