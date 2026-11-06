/** Pure, deterministic geometry and animation decisions for the M4 forest. */
export interface PinePlacement {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly width: number;
  readonly shade: number;
  readonly phase: number;
}

export const FOREST_PINE_COUNT = 96;

export function forestLayout(seed = 14026, count = FOREST_PINE_COUNT): PinePlacement[] {
  if (!Number.isInteger(count) || count < 0 || count > 256) {
    throw new RangeError('Forest tree count must be an integer between 0 and 256.');
  }
  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pines: PinePlacement[] = [];
  for (let tries = 0; pines.length < count && tries < count * 80; tries += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 5.5 + Math.sqrt(random()) * 16.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Keep the foreground clearing and lakeshore visible.
    if (Math.abs(x) < 3.7 && z > -7 && z < 9) continue;
    if (((x - 4.3) / 5.3) ** 2 + ((z + 0.6) / 3.4) ** 2 < 1.2) continue;
    pines.push({
      x, z, height: 2.8 + random() * 3.1,
      width: 0.75 + random() * 0.48,
      shade: random(), phase: random() * Math.PI * 2,
    });
  }
  if (pines.length !== count) throw new Error('Unable to place forest without obscuring the clearing.');
  return pines;
}

export function clampPixelRatio(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio)
    ? Math.max(1, Math.min(1.5, devicePixelRatio)) : 1;
}

export interface AmbientPose {
  readonly sway: number;
  readonly sparkle: number;
  readonly ripple: number;
}

/** Decorative motion only: not a heartbeat, breath cycle, or inferred sensor value. */
export function neutralAmbient(seconds: number, enabled: boolean): AmbientPose {
  if (!enabled || !Number.isFinite(seconds)) {
    return { sway: 0, sparkle: 0.45, ripple: 0 };
  }
  return {
    sway: Math.sin(seconds * 0.47) * 0.024,
    sparkle: 0.45 + Math.sin(seconds * 0.53) * 0.08,
    ripple: (1 + Math.sin(seconds * 0.34)) / 2,
  };
}
