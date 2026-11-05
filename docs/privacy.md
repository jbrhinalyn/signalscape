# Privacy baseline and camera policy

> **M1 status:** SignalScape currently does not open a camera, process
> biometric data, integrate SmartSpectra, record videos, or send telemetry.

## Intended user experience (not yet implemented)

1. The app explains what the camera is used for **before** requesting access.
2. The user actively opts in; no automatic capture on launch.
3. A persistent, understandable indicator shows when capture is active.
4. A visible Stop control ends capture, stops SDK processing and releases
   camera resources immediately.
5. Permission denial, device loss and processing failure all result in
   recoverable, clearly communicated states without silent retries.

## Data minimization and local processing

- The planned SDK integration will extract pulse, breathing and
  signal-quality estimates to drive visualizations locally.
- Raw camera frames should **not** be stored, uploaded, logged, or included
  in analytics. Do not add a cloud API without a separate opt-in design and
  documented safeguards.
- The current public IPC configuration returns only fixed, non-sensitive
  feature flags; environment variables and credentials remain in main.
- The current code has no accounts, telemetry pipeline, recording feature,
  data retention service or cloud sync.
- If still-image export is introduced, make it an explicit user-initiated
  action and avoid including source camera imagery or physiological metadata.

## Sensitive context and limitations

Camera-derived pulse and breathing signals are potentially sensitive
personal/health-related data. Only collect and retain what is necessary
for the chosen visual response. Clearly distinguish experimental graphics
from clinical measurement. SignalScape is **not** a medical device or
a diagnostic, monitoring or emergency-response service.

Before implementing acquisition, review SDK data handling, network behavior,
permissions, retention, platform-specific camera indicators, third-party
licenses, consent text, and negative tests. These are requirements for a
future milestone, **not** current product capabilities.

Security design: [IPC security contract](ipc-security.md).
