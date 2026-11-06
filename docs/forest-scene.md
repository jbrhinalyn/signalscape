# M4 forest scene — Issue #14

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

In M4 #14, **the scene is always neutral**. Decorative, slow, phase-offset
motion is unrelated to pulse or breathing. There are no synthetic vital signs,
and the scene never starts or observes a camera session. Issue #15 will connect
quality-gated, unitless `VisualizationSignalEngine` output to scene effects.

## Verification

Run `npm ci && npm run quality` on Node 24.15+ / npm 11. The
`tests/forest-scene.test.cjs` tests deterministic placement, bounds,
motion-off behavior and essential lifecycle wiring.

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
