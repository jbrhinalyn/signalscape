# SignalScape architecture and trust boundaries

SignalScape is an Angular 22 + Electron 45 desktop prototype with a Three.js generative forest, optionally controlled by live, consented camera-derived SmartSpectra pulse and breathing estimates. It is a **local-first experimental visualization**, not a medical or fully offline measurement service.

## Current processing flow

~~~text
User explicitly chooses Preview camera (video only)
   |
   v
Angular renderer: getUserMedia -> on-screen MediaStream preview
   |                      |
   |                      +--> Stop camera releases stream/tracks
   | 640x480 RGBA frames, bounded rate / size
   v
Sandboxed preload with typed, allowlisted IPC
   |
   v
Electron main: verify trusted frame, permission, shape, timestamps
   |
   v
Optional native SmartSpectra 3.4.0 SDK: useCustomInput / sendFrame
   |                         |
   |                         +--> Provider authentication/session network requests
   |                                (aggregate SDK telemetry disabled by config)
   v
Decoded SDK events -> validated rate/status/counter events only
   |
   v
Angular signal quality machine: framing, warm-up, freshness,
confidence and stability -> bounded pulse/breathing readouts
   |
   v
Visualization signal engine -> Three.js forest effects and
illustrative rhythm curves (NOT raw measured waveforms)
~~~

**No camera access starts on app launch.** Preview is distinct from Start measurement. Without an Electron bridge, a browser-only preview shows a neutral scene and cannot provide live SDK measurements. Without fresh trustworthy signals, the forest returns toward neutral rather than fabricating biometric rates.

## Component responsibilities

| Location | Responsibility |
| --- | --- |
| `src/app/` | Angular UI, consent controls, camera preview, quality gating and visible signal cards |
| `src/app/forest/` | Three.js forest presentation, selectable looks, scene motion and reduced-motion behavior |
| `electron/preload.ts` and `electron/ipc/contracts.ts` | Frozen, versioned, allowlisted desktop bridge; event schema and frame validation |
| `electron/main.ts` and `electron/camera/ipc.ts` | Trusted-frame checks, permission arming, session teardown and camera IPC |
| `electron/camera/capture.ts` | Optional native SmartSpectra session, SDK event decoding, telemetry opt-out and sanitized events |
| `electron/signals/model.ts` and `electron/signals/visualization.ts` | Unit/range checks, freshness and confidence/stability gates; neutral scene parameters |
| `tests/` | Node-based negative path, quality, lifecycle and **nonproduction synthetic** acceptance fixtures |

Raw frames travel only through the bounded local renderer-to-main application IPC path before being handed to the SDK. The renderer receives validated numeric rate events and limited state/counters; it never receives the native SDK API key, raw SDK metric packets, face landmark objects or internal error strings. Application code has no persistence/database, capture recording, account, cloud sync or analytics endpoint.

## Security and failure containment

- Electron is configured with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true` and a restrictive renderer Content Security Policy.
- Window opening and arbitrary navigation are denied. Incoming camera/desktop IPC is checked against the active trusted top-level frame; input sizes and event shapes are constrained.
- OS media requests are denied except explicit, video-only preview from the authorized window. Audio is not requested.
- Failure, stop, device change, permission loss and app exit clear stale in-memory signals and release browser video tracks; native teardown is attempted without making late SDK callbacks look like fresh measurements.
- Presage SDK authentication may use the network even with `enableTelemetry: false`. The SDK is third-party native code; no claim is made that it has been independently audited for data egress.

## Builds and verification

`npm run quality` checks lint, formatting, tracked secrets, strict TypeScript, all Node tests and production compilation. `npm run test:acceptance` exercises the SDK adapter and visualization using **synthetic test fixtures only**. CI headless smoke and packaging checks do not prove physical camera behavior.

The optional native SDK is **not included** in the repository dependencies, clean `npm ci` install or unsigned Linux/Windows packages. An internet-connected, authenticated developer session can demonstrate the real integration after a temporary SDK install. No production signing, credential issuance, SDK redistribution or full M5 hardware acceptance is approved.

For setup, consent, practical demo and privacy disclosure: [README](../README.md), [environment](environment.md), [camera instructions](camera-preview.md), [real-camera demo](demo.md), [privacy](privacy.md), [M5 acceptance](m5-acceptance.md), [IPC security](ipc-security.md).
