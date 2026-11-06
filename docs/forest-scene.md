# M4 forest scene — Issues #14 and #15

SignalScape renders a deterministic, atmospheric **Three.js** evergreen forest
in the same Angular desktop workspace as camera diagnostics. It opens without
camera permission, network access, SDK credentials or physiological input.

## Scene and performance

- 96 seeded pine trees share one trunk instanced mesh and three foliage
  instanced meshes, for a fixed, bounded number of draw calls.
- A low-poly ground and lakeshore, reflective pond, concentric surface rings,
  stones and a bounded set of 116 fireflies form the environment.
- Perspective camera, fog, hemisphere/moon/point lights and tone mapping.
- Device pixel ratio capped at **1.5**; viewport observes the container using
  `ResizeObserver`, with a window resize fallback, and updates camera aspect.
- The RAF loop runs outside Angular, stops while minimized/hidden or when reduced
  motion is active, and caps simulation steps after a stalled frame.
- All meshes, geometries and materials are cleaned on component destruction,
  and the WebGL renderer is disposed and its context released. Failed WebGL
  startup degrades to a user-visible message without affecting camera controls.

## Accessibility and privacy

The `Reduce motion` button turns off all animation and renders a static scene.
The default follows the OS `prefers-reduced-motion` preference; the in-session
button explicitly overrides it. No settings or metrics are persisted. WebGL
rendering does not require `getUserMedia`.

## Live signal mapping (Issue #15)

The root Angular app publishes only `SignalQualityMachine.snapshot(Date.now())`
to the forest's required `[signalView]` input. The forest does not request
camera permission, read video, subscribe to IPC or import the native SDK.
Its animation frame runs `VisualizationSignalEngine.step(view, Date.now())`
so a stale metric cannot remain active merely because the UI receives no
new event. The engine enforces quality = ready, per-signal freshness (3 seconds),
stability, correct units, valid ranges, confidence >= 70, and smoothing.

The pure `scene-effects.ts` turns *unitless, smoothed* scene intensities into:

- **Pulse:** subtle extra firefly opacity/size and pond/lantern illumination.
- **Breathing:** modest tree sway amplitude and pond ring size modulation.
- **Neutral:** decorative slow forest motion only, not simulated pulse/breath cycles.

The caption distinguishes warm-up, weak tracking, disconnected and
independently available pulse/breathing effects. On Stop measurement,
Stop camera, SDK failure or revoked permission, the upstream view becomes
`disconnected` and the scene resets to neutral immediately. Poor framing,
low-confidence, unstable or aged data stops driving effects and fades back
using the visualization engine's release time constant. No scene animation
frequency is inferred from physiological rates.

When reduced motion is on, animation remains stopped; input changes can
update static lighting without restarting RAF. No frames, biometric data,
or visualization settings are persisted.

## Verification

Run `npm ci && npm run quality` on Node 24.15+ / npm 11. Unit tests
cover deterministic forest layout, lifecycle bindings, reduced motion,
quality gating, real-rate-to-art mapping, metric loss, recovery and reset.
The synthetic test samples are test fixtures, not runtime demo signals.

Manual Electron smoke test (`npm run dev` or packaged Linux desktop):

1. Open the app without preview permission; the 3D forest renders and the
   camera stays off.
2. Resize desktop window narrow and wide: the canvas fills its panel without
   stretching or overflowing.
3. Check smooth, gentle movement and no continuously growing GPU resources in
   DevTools over a sustained session.
4. Select **Reduce motion**: tree/particle/water movement stops. Select
   **Enable gentle motion** to resume.
5. With the OS reduced-motion preference enabled, restart the app and confirm
   the preview starts static. It may be overridden with the button.
6. Minimize/restore to verify rendering pauses/resumes. Navigate away or close
   the Electron window to verify animation cancellation and teardown.
7. With WebGL/hardware acceleration unavailable, camera controls remain usable
   and the fallback message is visible.

Performance/OS behavior and GPU disposal need this manual smoke test in addition
to CI. Do not mark Issue #14 complete before review and confirmation.

### Issue #15 live-camera acceptance checklist (record results on the PR)

Perform in **Electron on a computer with SmartSpectra installed and configured**.
Automated tests cannot validate live sensor quality or the visible GPU effect.

1. **No permission:** launch fresh; the forest renders neutral without opening the camera.
2. **Stable:** select Preview camera, then Start measurement. Face + chest are in
   view with good lighting. Wait for warm-up, `ready` quality and real rates.
   Confirm pulse changes pond/firefly brightness and breathing changes tree/ring
   movement. The caption names each active effect; effects remain subtle.
3. **Partial availability:** briefly lose one metric while keeping the other
   eligible. Verify the missing effect fades back; the other keeps responding.
4. **Low quality:** obstruct your face, move out of framing, or reduce lighting.
   Confirm the quality state changes, the caption warns about tracking and
   both effects return to neutral (not simulated rates).
5. **Lost tracking/staleness:** move out of camera view, and verify that the
   scene stops responding to old readings even without fresh metric packets.
   Recover framing, then confirm only *new* validated readings reactivate it.
6. **Stop/restart:** Stop measurement (preview remains on): effects reset
   immediately. Start again: no effects before fresh warm-up readings.
   Stop camera or revoke permission: camera indicator off, no sensor effects.
7. **Accessibility/resilience:** turn on Reduce motion and verify static
   lighting can change while trees/rings stop moving. Minimize/restore; resize
   the window; close Electron. Verify no stuck webcam or WebGL error.

Record OS, SDK version, a stable/low-quality/lost-tracking observation, and
any limitations in the PR before marking Issue #15 complete.
