import { NEUTRAL_UNIFORMS, type SceneUniforms } from '../../../electron/signals/visualization';
import type { AmbientPose } from './scene-layout';

/** Presentation-only settings: no beats, respiratory cycle or new vital estimates. */
export interface ForestVisualPose {
  readonly foliageSway: number;
  readonly fireflyOpacity: number;
  readonly fireflySize: number;
  readonly pondEmission: number;
  readonly lanternIntensity: number;
  readonly rippleAmplitude: number;
}

function lift(value: number, neutral: number, range: number): number {
  // The visualization engine already validates incoming signal events and
  // smooths these unitless intensities. This clamps only artistic output.
  return Number.isFinite(value) ? Math.max(0, Math.min(1, (value - neutral) / range)) : 0;
}

/** Pure rate-to-art mapping. Decorative ambient motion has no physiological timing. */
export function forestVisualPose(
  uniforms: SceneUniforms,
  ambient: AmbientPose,
  motionEnabled: boolean,
): ForestVisualPose {
  const pulse = lift(uniforms.glow, NEUTRAL_UNIFORMS.glow, 0.67);
  const particles = lift(uniforms.particles, NEUTRAL_UNIFORMS.particles, 0.61);
  const breathing = lift(uniforms.sway, NEUTRAL_UNIFORMS.sway, 0.58);
  return {
    foliageSway: motionEnabled ? ambient.sway * (1 + 1.1 * breathing) : 0,
    fireflyOpacity: Math.min(0.90, ambient.sparkle *
      (0.72 + NEUTRAL_UNIFORMS.particles) + 0.30 * pulse + 0.12 * particles),
    fireflySize: 0.12 + 0.07 * particles,
    pondEmission: 0.31 + 0.11 * ambient.ripple + 0.55 * pulse,
    lanternIntensity: 28 + 14 * pulse,
    rippleAmplitude: motionEnabled ? 0.026 + 0.035 * breathing : 0,
  };
}
