# SignalScape privacy, permissions and data handling

**Applies to the development prototype (0.1.0).** SignalScape is a local-first, experimental visual experience, **not a medical device** or a diagnostic, treatment, monitoring, or emergency-response service. Camera-derived pulse and breathing estimates can be sensitive. Do not use the readings to make health decisions.

## Consent and camera lifecycle

1. Camera access is **off on launch**. Listing available cameras does not start capture.
2. **Preview camera · Allow access** explicitly requests video-only permission for the trusted Electron window; no microphone permission is requested.
3. **Start measurement** is a separate, explicit choice after preview. Previewing alone does not launch the native SmartSpectra measurement session.
4. **Stop measurement** stops SDK processing but leaves the local video preview active. **Stop camera** stops the video tracks, disarms permission and tears down measurement. Closing Electron also releases the capture stream and attempts bounded native cleanup.
5. Denial, revocation, device loss and SDK failure require a new user action; the app must not silently restart measurement. The OS webcam indicator is the authoritative device-level signal. Stopping this app cannot revoke permissions granted independently in OS settings.

The browser-only Angular page has no Electron native bridge: it cannot demonstrate SmartSpectra integration or verified camera-derived rates.

## Data flow and retention in this repository

| Stage | Information processed | Boundary / storage |
| --- | --- | --- |
| Video preview | Camera video in a temporary browser `MediaStream` | Held in the local Electron renderer, not intentionally recorded, saved or uploaded by SignalScape application code |
| Custom-input frames | Transient 640×480 RGBA frame bytes, bounded timestamps | Passed through restricted local IPC to the Electron main process and the native SmartSpectra SDK via `sendFrame()`; not persisted by app code |
| SDK measurements | Decoded pulse and breathing rates, confidence, stability, validation/status codes | SDK processes input; a strict adapter sends only validated, bounded rate events plus status and aggregate counters to the renderer |
| Display | Latest accepted rates, signal quality, forest animation and illustrative rhythm curves | In-memory application state; invalid, stale, low-confidence or unstable values are withheld; no app database or sync |
| Diagnostics | Aggregate frame and metric packet counts, status/error numbers | Visible locally; no application analytics or remote logging pipeline is implemented |

**Important distinction:** earlier documentation said only metric-presence flags reached Angular. That is outdated. **Validated numeric pulse/breathing rate estimates do reach the renderer** to drive the readouts and forest, but raw frames, full SDK metric packets, face landmarks, arbitrary SDK error strings and credentials are not intentionally sent to the renderer. There is no application feature to export camera photos or readings.

These statements describe the reviewed **SignalScape application source**, not a guarantee about all internals of a proprietary third-party SDK, host OS, crash tooling or modified builds. Confirm SDK behavior with Presage and independent network testing before distribution.

## SDK network traffic and telemetry: do not describe this as fully offline

- A real measurement needs the separately installed `@smartspectra/node-sdk@3.4.0` and a privately supplied Presage developer API key. The SDK uses a network service for authentication/session authorization. **Offline authentication or offline-only operation has not been verified.** Connectivity, account status and provider availability can affect measurement startup. Local visualization without measurement does not need the SDK key.
- The official SDK **enables aggregate session telemetry by default**. SignalScape explicitly creates the native SDK with `enableTelemetry: false` and `logLevel: SmartSpectraLogLevel.kNone`; the isolated native probe also opts out. Presage documents that this switch disables its optional aggregate session telemetry, **not all network communications**.
- If that telemetry is enabled in another build, Presage says it may send a per-session diagnostic summary including SDK/runtime environment, frame/metric counts, quality-state counts and session outcome. Their telemetry documentation says it does *not* include raw video, physiological metric values, personal identifiers or free-form messages. These are **vendor statements**, not an independent security audit of SDK/network behavior.
- The application does not intentionally send raw frames to any SignalScape server, and no SignalScape server-side measurement or telemetry endpoint exists. Do **not** infer from this that the SDK makes zero external requests or assert that no frame bytes ever cross the network without a separate SDK/network assessment.
- No production credential delivery, SDK redistribution/licensing approval, app-store privacy declaration or network inspection has been completed. **Do not distribute a shared long-lived API key** in an Electron package; it can be extracted.

References: [Presage SDK telemetry & privacy](https://smartspectra.presagetech.com/docs/telemetry-and-privacy/), [Node SDK options](https://smartspectra.presagetech.com/docs/nodejs/api-reference), [native validation](sdk-validation.md).

## Demo, screenshots and deletion

Use the webcam only with the informed consent of everyone visible. Do not capture screenshots/video containing faces, health-related readings, keys, camera device IDs or SDK traces for bug reports or public demos. Record only sanitized aggregate counters and pass/fail observations. The app has no account, measurement history, data-retention service, cloud synchronization or built-in recording feature, so stopping a session clears its in-memory measurement state; the app does **not** manage OS/provider logs or third-party retention.

Illustrative pulse/breathing curves are **not** sampled medical waveforms. Synthetic values in `tests/` are nonproduction, in-memory fixtures only and must never be presented as actual SDK output. See the [real-camera demonstration checklist](demo.md).

## Scope and release blockers

This is documentation of current implementation, **not** a blanket legal privacy policy or security certification. Before public release, review provider data processing and network behavior, consent and accessibility, SDK licensing, production-safe short-lived credentials, signed distribution, native platform support and the full physical camera acceptance matrix. See [M5 acceptance](m5-acceptance.md) and [packaging restrictions](packaging.md).


**Distribution safeguard:** current unsigned review installers disable native SDK measurement, even if an environment API key is set. A full SDK-enabled installer is not approved; see [release-readiness gates](release-readiness.md) for the outstanding vendor, credential and privacy reviews.
