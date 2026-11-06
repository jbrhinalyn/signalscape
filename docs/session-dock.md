# Session dock implementation notes

The bottom controls match the approved cinematic reference while retaining the original
consent and teardown behavior.

- **Camera:** indicator is lit only when a real browser camera preview is active.
- **Stop:** illuminated red square appears only for a running or starting native
  measurement. It calls the existing `stopMeasurement()`; pending native startup
  still cancels and releases the camera as before.
- **Stop camera:** separate explicit button always remains visible while the
  camera is active or a permission/start/teardown operation is pending.
- **Live measurement timer:** monotonic elapsed time starts only after the
  SmartSpectra native start returns success. No fake 02:14 value is supplied.
  `qualityTimer` already runs once per second; it drives clock updates, so no
  extra interval is created. Stop measurement, Stop camera, SDK failure and
  disconnect all clear the elapsed time.
- **Status:** Live green indicator only when `measuring()` is true; preview
  only and idle states are visually neutral.
- **Accessibility:** Stop has a concrete aria-label; timer has a descriptive
  aria-label; keyboard focus rings remain; no camera starts automatically.

Hardware verification on the owner's Zorin Linux machine is still required.
