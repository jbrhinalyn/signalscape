# M3 visualization signal engine (Issue #13)

`electron/signals/visualization.ts` provides a **pure TypeScript** bridge
between the quality-gated `SignalQualityMachine.snapshot(nowMs)` output and
Three.js scene uniforms. There is no camera, native SDK, timer, DOM,
randomness, persistent state or new dependency in this module.

It deliberately does **not** create a heartbeat animation, simulate a
breathing waveform, interpolate physiological samples, or return rate values.
The only public output is unitless scene intensities and two source flags:

| Uniform | Neutral | Eligible source | Visual use |
| --- | ---: | --- | --- |
| `glow` | 0.18 | Pulse 40–110 bpm | Overall glow intensity |
| `particles` | 0.14 | Pulse 40–110 bpm | Abstract particle energy |
| `sway` | 0.12 | Breathing 5–40 breaths/min | Ambient foliage movement |

The visual targets are linearly scaled into **unitless 0–1 scene settings**,
not new rate readings. Higher SDK rate estimates select stronger abstract
visual effects; no beats, phases, breath cycle or prediction are inferred.
All three controls remain at neutral when no qualified measurements exist.

## Gates and interruptions

The engine accepts `SignalView`, **not** SDK packets or ungated events.
The upstream quality machine still owns consent, framing, warm-up,
confidence, stability and the 4-second maximum reading age. The engine
independently rechecks:

- Overall quality must be `ready` (never `warming`, `degraded` or
  `disconnected`).
- Each metric must have a valid typed `rate` event, the correct unit and
  value range, `stable: true`, and confidence **at least 70/100**.
- Receipt age must be within `maxAgeMs` (default **3000 ms**; configurable
  from 0 to the upstream 4000 ms maximum). At most **250 ms** of clock skew
  into the future is tolerated, matching the upstream quality machine.
- Pulse and breathing are independent: loss of one does not block the other.

If a metric becomes unreliable, missing or old, its `*Driven` flag turns
false **immediately**. Its visual intensity decays toward neutral with the
release time constant, but **the engine does not report the old reading as
valid or construct replacement physiological values**. A fresh eligible
event is required for the flag to become true again. `disconnected`,
`reset()`, invalid timestamps and backward clock jumps clear all state
immediately to neutral (including visual effects).

## Deterministic time-based smoothing

`step(view, nowMs)` is called by the scene renderer's animation loop. It
has no internal interval. For each uniform, it uses an exponential approach:

```text
alpha = 1 - exp(-elapsedMs / tauMs)
next = current + (target - current) * alpha
```

`attackMs` (default **800 ms**) governs motion toward a stronger effect;
`releaseMs` (default **500 ms**) governs motion toward a weaker or neutral
effect. Both accept finite values from 1 to 60000 ms. These are time
constants, not fixed-per-frame lerp percentages, so 30 Hz and 60 Hz updates
track the same target over the same elapsed time. At the first step the
current neutral state is retained until the next timestamp advances.

## M4 integration contract

Issue #15 wires these fields through `App.sceneView` to the live forest
component. Its RAF consumes the upstream `SignalView` via
`VisualizationSignalEngine.step(view, Date.now())` and sends only
unitless intensities to the pure `forestVisualPose` mapping. Camera consent
and SmartSpectra processing stay in the existing Electron/app boundaries.
The engine remains testable without a camera; no synthetic vital readings are
used in the production renderer.

```ts
import { SignalQualityMachine } from './model';
import { VisualizationSignalEngine } from './visualization';

const signalMachine = new SignalQualityMachine();
const visualEngine = new VisualizationSignalEngine({
  attackMs: 800, releaseMs: 500, maxAgeMs: 3000,
});

// During a running, consented session, once per scene animation frame:
const nowMs = Date.now();
const approved = signalMachine.snapshot(nowMs);
const { uniforms, pulseDriven, breathingDriven } =
  visualEngine.step(approved, nowMs);

// Apply only the unitless uniforms to Three.js materials/objects.
// Show actual bpm or breaths/min only from approved.pulse/breathing,
// never by reverse-calculating them from the visual uniforms.
// pulseDriven / breathingDriven reflect eligibility now, even during fade.

// When a measurement stops or camera access is removed:
visualEngine.reset();
```

Always use the **same local timebase** as `SignalQualityMachine`. The real
SDK supplies the time-stamped events upstream; `step` never starts
measurements or asks for webcam permissions. The application remains
non-medical, and scene controls must not be presented as clinical readings.

## Tests

Run `npm test` or `npm run quality`. The deterministic
`tests/visualization.test.cjs` suite covers variable frame cadence,
bursty jitter, invalid/unreliable inputs, per-metric staleness, interruptions,
recovery, clock jumps, neutral reset, option boundaries, and output isolation.
These unit tests do **not** constitute physiological accuracy validation.
