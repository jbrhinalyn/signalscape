# M4.1 immersive desktop shell — Issue #33

The forest now occupies the full Electron viewport behind accessible, translucent
interface controls. This is a visual polish pass, **not** a change to the
SmartSpectra SDK, camera permission policy, validation model, or scene mappings.

## Interaction architecture

- **Top bar:** brand, camera selection/setup, expandable technical diagnostics.
  Settings do not request camera permission and never start a measurement.
- **Left HUD:** pulse, breathing and tracking quality use the existing
  quality-gated Angular signals. Missing/invalid/stale values remain Not ready.
  Bars in the quality card represent *categorical state*, not quantitative
  sensor confidence or a sampled physiological waveform.
- **Local video preview:** an always-mounted video element presents a small
  positioning guide only after explicit consent. The preview is not recorded
  by SignalScape and never starts automatically.
- **Bottom dock:** Preview camera, Start measurement, Stop measurement and
  Stop camera retain their original lifecycle methods. Stop camera is shown
  during permission requests/native busy operations, including a pending start.
- **Live feedback:** one polite readiness region announces errors and states,
  while optional details preserve transport/packet counts and guidance.
- **Forest:** a full-viewport canvas with existing validated pulse and breathing
  mappings, neutral fallback, motion preference/override, and GPU cleanup.

## Manual acceptance

1. Launch Electron, confirm no camera starts automatically and forest fills window.
2. Open Camera setup, select an available camera, click Preview camera, grant
   video-only permission, and verify the picture-in-picture preview appears.
3. Start measurement separately. Check warm-up shows Not ready, with readings
   only when quality validation permits them. Low quality must hide readings.
4. Stop measurement and verify preview stays; Stop camera must release the
   webcam light. Repeat while start/stop is pending, and on permission denial.
5. Use Session details to confirm packet/frame counters still work.
6. Tab through topbar, menus, camera controls, How it works, and motion toggle.
   Verify live feedback, focus rings, and reduced-motion behavior.
7. Resize to 1280x720, 1024x768 and a narrow window. Check that no controls
   are obscured and that the scene remains interactive.
8. Verify camera frames/metric values are not logged or persisted by the UI.
   Never interpret signal estimates as medical readings.

The reference concept is an artistic target. This implementation uses the
existing real-time, procedurally rendered Three.js forest; it does not use a
static render pretending to be reactive.
