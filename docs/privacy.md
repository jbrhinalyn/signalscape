# Privacy baseline and camera policy

> **M2 development branch:** SignalScape supports an opt-in local camera preview and optional native SDK measurement. The webcam never opens automatically; no audio, recording, raw-frame upload, or application telemetry is implemented. Presage SDK authentication may access its service.

## Camera and consent flow (M2 development prototype)

1. The app explains what the camera is used for **before** requesting access.
2. The user actively opts in; no automatic capture on launch.
3. A persistent, understandable indicator shows when capture is active.
4. A visible Stop control ends capture, stops SDK processing and releases
   camera resources immediately.
5. Permission denial, device loss and processing failure all result in
   recoverable, clearly communicated states without silent retries.

## Data minimization and local processing

- The SDK test path can detect whether pulse and breathing samples arrive; it does not yet drive finished Three.js visuals. Only metric-presence flags and bounded packet counts are exposed to Angular.
- Raw camera frames should **not** be stored, uploaded, logged, or included
  in analytics. Do not add a cloud API without a separate opt-in design and
  documented safeguards.
- The public IPC configuration returns only fixed, non-sensitive values. Native SDK keys are read from the Electron main-process environment and never placed in the Angular bundle or renderer messages.
- The code has no accounts, application telemetry pipeline, recording, data retention service or cloud sync. SDK aggregate telemetry is disabled, but authentication may require network access.
- If still-image export is introduced, make it an explicit user-initiated
  action and avoid including source camera imagery or physiological metadata.

## Sensitive context and limitations

Camera-derived pulse and breathing signals are potentially sensitive
personal/health-related data. Only collect and retain what is necessary
for the chosen visual response. Clearly distinguish experimental graphics
from clinical measurement. SignalScape is **not** a medical device or
a diagnostic, monitoring or emergency-response service.

Before publishing a production release, review SDK data handling, network behavior, permissions, OS indicators, licensing, consent design, frame rates and a non-extractable credential strategy. This M2 preview is a developer-only capability; optional SDK native binaries are not included in CI packages.

Security design: [IPC security contract](ipc-security.md).

See [M2 camera preview](camera-preview.md) for the precise local single-stream and stop flow.
