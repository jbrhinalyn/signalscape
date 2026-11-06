import {
  isSignalEvent, MAX_SIGNAL_AGE_MS, MIN_CONFIDENCE,
  type RateEvent, type SignalName, type SignalView,
} from './model';

/**
 * Scene parameters are unitless visual intensities in [0, 1].
 * These are NOT heartbeats, respiratory waveforms, rates, or estimates.
 */
export interface SceneUniforms {
  readonly glow: number;
  readonly particles: number;
  readonly sway: number;
}

export interface VisualizationFrame {
  readonly uniforms: SceneUniforms;
  /** True only if this frame's target uses a currently eligible real rate. */
  readonly pulseDriven: boolean;
  readonly breathingDriven: boolean;
}

export interface VisualizationOptions {
  /** Time constant when moving toward a stronger effect. */
  readonly attackMs?: number;
  /** Time constant when relaxing an effect, including on signal loss. */
  readonly releaseMs?: number;
  /** Independent freshness limit; cannot exceed the upstream quality gate. */
  readonly maxAgeMs?: number;
}

export const NEUTRAL_UNIFORMS: Readonly<SceneUniforms> = Object.freeze({
  glow: 0.18,
  particles: 0.14,
  sway: 0.12,
});

export const DEFAULT_VISUALIZATION_OPTIONS = Object.freeze({
  attackMs: 800,
  releaseMs: 500,
  maxAgeMs: 3000,
});

const RATE_RANGES = {
  pulse: { min: 40, max: 110 },
  breathing: { min: 5, max: 40 },
} as const;

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function checkedOption(value: number, name: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function eligible(
  event: RateEvent | null,
  name: SignalName,
  nowMs: number,
  maxAgeMs: number,
): event is RateEvent {
  if (!event || !isSignalEvent(event) || event.kind !== 'rate' ||
    event.signal !== name || !event.stable || event.confidence < MIN_CONFIDENCE) return false;
  const ageMs = nowMs - event.timestampMs;
  // Same bounded clock-skew allowance as SignalQualityMachine. A missing or
  // outdated event is never promoted by extrapolation or historical caching.
  return ageMs >= -250 && ageMs <= maxAgeMs;
}

function normalized(value: number, name: SignalName): number {
  const { min, max } = RATE_RANGES[name];
  return (value - min) / (max - min);
}

function ease(current: number, target: number, elapsedMs: number,
  attackMs: number, releaseMs: number): number {
  if (elapsedMs <= 0) return current;
  const tau = target > current ? attackMs : releaseMs;
  return current + (target - current) * -Math.expm1(-elapsedMs / tau);
}

/**
 * Deterministic, animation-clock-driven projection of an already quality-gated
 * SignalView. No SDK, camera, DOM, timers, storage, or random inputs.
 *
 * Call step() from the future scene's render loop using the same local
 * Date.now() timebase as SignalQualityMachine.snapshot(). Call reset() on stop.
 */
export class VisualizationSignalEngine {
  private readonly options: Required<VisualizationOptions>;
  private lastStepMs: number | null = null;
  private current: SceneUniforms = { ...NEUTRAL_UNIFORMS };

  constructor(options: VisualizationOptions = {}) {
    const merged = { ...DEFAULT_VISUALIZATION_OPTIONS, ...options };
    this.options = {
      attackMs: checkedOption(merged.attackMs, 'attackMs', 1, 60000),
      releaseMs: checkedOption(merged.releaseMs, 'releaseMs', 1, 60000),
      maxAgeMs: checkedOption(merged.maxAgeMs, 'maxAgeMs', 0, MAX_SIGNAL_AGE_MS),
    };
  }

  reset(): VisualizationFrame {
    this.lastStepMs = null;
    this.current = { ...NEUTRAL_UNIFORMS };
    return this.frame(false, false);
  }

  step(view: SignalView, nowMs: number): VisualizationFrame {
    if (!validTime(nowMs) ||
      (this.lastStepMs !== null && nowMs < this.lastStepMs) ||
      view?.quality === 'disconnected') return this.reset();

    // A quality-degraded view must never drive visuals, even if it contains a
    // well-formed rate object. Separate metric eligibility allows one signal
    // to continue when only the other is unavailable.
    const ready = view?.quality === 'ready';
    const pulse = ready && eligible(view.pulse, 'pulse', nowMs, this.options.maxAgeMs)
      ? view.pulse : null;
    const breathing = ready && eligible(view.breathing, 'breathing', nowMs, this.options.maxAgeMs)
      ? view.breathing : null;

    const target: SceneUniforms = {
      glow: pulse ? 0.25 + 0.60 * normalized(pulse.value, 'pulse') : NEUTRAL_UNIFORMS.glow,
      particles: pulse ? 0.20 + 0.55 * normalized(pulse.value, 'pulse') : NEUTRAL_UNIFORMS.particles,
      sway: breathing ? 0.18 + 0.52 * normalized(breathing.value, 'breathing') : NEUTRAL_UNIFORMS.sway,
    };
    const dt = this.lastStepMs === null ? 0 : nowMs - this.lastStepMs;
    this.lastStepMs = nowMs;
    this.current = {
      glow: ease(this.current.glow, target.glow, dt,
        this.options.attackMs, this.options.releaseMs),
      particles: ease(this.current.particles, target.particles, dt,
        this.options.attackMs, this.options.releaseMs),
      sway: ease(this.current.sway, target.sway, dt,
        this.options.attackMs, this.options.releaseMs),
    };
    return this.frame(pulse !== null, breathing !== null);
  }

  private frame(pulseDriven: boolean, breathingDriven: boolean): VisualizationFrame {
    // Never leak a mutable reference to internal engine state.
    return { uniforms: { ...this.current }, pulseDriven, breathingDriven };
  }
}
