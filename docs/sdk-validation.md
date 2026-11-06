# M2 SmartSpectra native validation (Issue #9)

**Status (2026-11-06): native load, on-device SDK metrics, and stop/restart lifecycle verified for the M2 development prototype.**
The standalone Node.js probe below remains available for diagnostics. SignalScape also has an opt-in Electron camera preview and separate main-process SDK custom-input integration (see [camera preview](camera-preview.md)). Camera access remains disabled on launch and requires explicit user action.

## Official prerequisites

| Target | Support |
| --- | --- |
| Linux x64 / ARM64 | Supported, glibc >=2.35 (Ubuntu 22.04+, Debian 12+) |
| macOS ARM64 | Supported |
| Windows x64 | Supported |
| Other targets | Not listed as supported |

Presage documents Node.js >=20 and Electron >=28. SignalScape uses Node
24.15.0 and Electron 45.2.x. The official `@smartspectra/node-sdk` package
uses koffi FFI with per-platform native packages, without native-addon
rebuilding. Version **3.4.0** is pinned for this spike. A developer API key
and an authenticated network session are required for measurement. **Offline
auth/processing is not established.** SDK aggregate diagnostic telemetry
defaults to ON; this spike explicitly sets `enableTelemetry: false` and
`logLevel: kNone`.

Sources:
- https://smartspectra.presagetech.com/docs/nodejs
- https://smartspectra.presagetech.com/docs/nodejs/api-reference
- https://smartspectra.presagetech.com/docs/nodejs/metrics
- https://smartspectra.presagetech.com/docs/telemetry-and-privacy/

## Native load check (no camera or credentials)

On an internet-connected machine with supported Node and platform:

~~~sh
nvm use
npm ci
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
npm run spike:sdk -- --probe
~~~

This opt-in install is temporary and deliberately does not modify the
tracked application dependency lockfile. The probe imports the official SDK
and prints a small JSON summary of OS target, native load status and SDK
version. Success **does not** verify camera availability, authentication
or sample measurements.

GitHub Actions workflow **SmartSpectra Native Probe (no credentials)** runs
automatically on PRs that change this spike. It installs the exact SDK
version on Ubuntu 24.04 and checks native load without camera or credentials.
Once this workflow exists on the default branch, it also supports manual
dispatch; GitHub does not expose new feature-branch-only manual workflows.
The regular application CI never downloads this large optional native runtime.

## Explicit opt-in measurement on a physical camera machine

Only run this with permission from the person in view and a valid Presage
developer key. Close other camera software and use comfortable lighting.
For a local bash terminal, enter the key without echo or a command argument:

~~~sh
read -rs -p 'SmartSpectra API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run spike:sdk -- --measure --consent --seconds 45
unset SMARTSPECTRA_API_KEY
~~~

The script requires `--consent` and a non-empty runtime environment key.
It uses the **native Node camera**, not Electron's renderer camera. It
requests breathing and cardio bundles, disables SDK telemetry, and tears
down processing and camera resources when complete or stopped with Ctrl+C.
The command prints only the metric packet count and booleans indicating
whether at least one valid breathing or pulse observation was decoded.
It does **not** print health values, raw frames, camera names/IDs, SDK
error text, paths or keys. A successful measurement result is an
observation of SDK output, not clinical or accuracy validation.

Failures use short reason codes such as `unsupported-platform`,
`glibc-2.35-required`, `sdk-not-loadable`, `api-key-not-configured`,
`camera-unavailable`, `camera-discovery-failed`, `sdk-error` (numeric
code only), `sdk-cleanup-failed`, and `no-valid-metric-samples`.
Only share sanitized output; do not post credentials or SDK traces.

## Acceptance matrix

| Criterion | Evidence / disposition |
| --- | --- |
| Native module installs on a supported machine, or precise blocker | **VERIFIED:** Ubuntu 24.04 native CI [run #42111208318](https://github.com/jbrhinalyn/signalscape/actions/runs/42111208318) installed and imported SmartSpectra **3.4.0** on Linux x64 with `ok:true`. |
| Real samples observed or SDK failure explained | **VERIFIED on physical Zorin Linux camera in the Electron M2 preview:** 1,363 SDK metric packets, breathing and pulse presence observed, framing valid, 1,510 frames accepted, 0 rejected. Owner also confirmed Stop measurement, Stop camera and reopen/restart work. Initial headless probe experiments and errors remain documented below as historical diagnostic evidence. |
| API key security | **Spike implemented**: runtime Node environment only, no key in app source, Angular, IPC, repo, logs, CLI argument or package. SDK telemetry disabled. **Production credential strategy remains a blocker.** |
| Platform support | **Documented**: runtime matrix, glibc floor, Node/Electron minimums, native packaging caveats. |

## Production deployment and privacy decision

Never embed a shared, long-lived API key in an Electron installation, Angular
assets, source maps or bundled config: local users can extract it even if it
is kept in the Electron main process. A local environment variable is
suitable only for a developer test, **not secure key distribution**.
Before shipping, confirm a Presage-supported short-lived OAuth/token
exchange with a trusted backend or an end-user-provided credential saved
in OS secure storage, and assess the provider's licensing and allowed
redistribution. Future Electron packaging must include the correct
`@smartspectra/node-sdk-<platform>-<arch>` native library closure via
`electron-builder` extraResources, along with relevant OS camera permissions.

Authentication may communicate with Presage over the network even with SDK
aggregate telemetry disabled, so do not claim an offline-only service.
The renderer camera/measurement feature now exists as an opt-in development
prototype, but does **not** remove the production release blockers. Preserve
deny-by-default permissions, review actual SDK network behavior and require
consent and a visible Stop control on every session. For current end-user
disclosures and evidence use [privacy](privacy.md) and the
[real-camera demo workflow](demo.md).

## First physical-camera test and invalid-state troubleshooting

The owner reported a real Zorin Linux x64 SDK 3.4.0 session with
**1,009 metric packets**, `breathingObserved: true`, `pulseObserved: false`,
and `sdkErrorCode: 1`. The breathing metric provides successful real
measurement evidence, but this run was **not a clean success** because the
SDK emitted a failure.

Per the official Node.js API reference, error code `1` means
`kInvalidState`; invalid credentials instead use `kAuthenticationFailed`
(code `2`). The cause is not yet known. Do not assume that
`kInvalidState` is an authentication problem or simply discard it because
metric packets were received.

The updated spike returns `sdkErrorStage` (initializing / starting /
measuring / stopping / destroying), `sdkErrorRetryable` (when an error
event was emitted), and `packetsAtError`. It also returns sanitized
`lastProcessingStatus` and `lastValidationCode` for camera guidance.
The error reason still counts as a failed run regardless of metric packets.
Validation statuses are **not** the same as SDK error codes: validation
code `1` is "no face found", while SDK error code `1` is invalid state.

To retry with the updated diagnostic spike in a local clone:

~~~sh
git fetch origin
git switch feat/m2-smartspectra-native-spike
git pull --ff-only
read -rs -p 'SmartSpectra API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run spike:sdk -- --measure --consent --seconds 60
unset SMARTSPECTRA_API_KEY
~~~

Do not run more than one SDK process simultaneously. Keep one centered,
forward-facing, evenly lit face in frame, with stable camera framing and
minimal movement. Presage documents a roughly 12-second pulse analysis
window; the 60-second retry gives room for camera stabilization and
capture diagnostics. Do not paste the key or other private logs in issues.

References:
- https://smartspectra.presagetech.com/docs/nodejs/api-reference
- https://smartspectra.presagetech.com/docs/nodejs/migration-guide/
- https://smartspectra.presagetech.com/docs/measurement-quality/

### Second physical-camera result and follow-up fix

The owner reported a second Zorin Linux 60-second run with **0 metric
packets**, `lastProcessingStatus: 1` (Idle),
`lastValidationCode: 16` (**FaceTooLow**),
`sdkErrorCode: 1` (**InvalidState**) at the `stopping` stage,
and `sdkErrorRetryable: false`. The `lastProcessingStatus` alone
is insufficient to say whether processing ever ran; it may have become
Idle during shutdown. The face-low validation does not prove it caused
the zero packets. Authentication failure is error code 2, not 1.

This prompted two additional spike fixes:

- Use `@smartspectra/node-sdk/messages` for `decodeMetrics`; the
  root export may return the raw Buffer unless a metrics class has
  been registered. This is documented in Presage's Node headless
  testing guide. The first run's breathing observation is retained as
  reported, but the new test no longer relies on the root decoder.
- Record bounded, **numeric-only** `processingStatusesSeen` and
  `validationCodesSeen` histories, plus `processingStatusBeforeStop`.
  Skip `stopAsync()` only when the graph is already Idle, then always
  call `destroy()`. This avoids an unnecessary state transition while
  preserving actual SDK errors for investigation.

On the next consented test, first center the face higher in the
camera's field of view or tilt the webcam downward slightly (code 16
is "Face Too Low"). Only use the sanitized output. We need to see
whether `processingStatusesSeen` includes `3` (Running), and whether
the graph was already `1` (Idle) before cleanup. A new nonzero
`packets` count would show capture actually progressed. Do not
mistake a clean teardown for successful biometric measurement.

Sources:
- https://smartspectra.presagetech.com/docs/nodejs/api-reference
- https://smartspectra.presagetech.com/docs/nodejs/headless-testing-in-ci/
- https://smartspectra.presagetech.com/docs/measurement-quality/

### Third physical-camera result and isolated teardown experiment

The owner's third Zorin Linux x64 test (SDK 3.4.0) reported:

- `packets: 0`; no breathing or pulse observations.
- `processingStatusesSeen: [1,2,3,4,1]` — Idle, Starting,
  Running, Stopping, Idle. This confirms the pipeline reached Running,
  **not** that it emitted usable metrics.
- `processingStatusBeforeStop: 3` (Running). Therefore the earlier
  stopAsync call was **not demonstrably redundant**.
- `validationCodesSeen: [0,7,2]` — OK, Chest Not Visible, Multiple
  Faces Found. These are separate from SDK error codes.
- `sdkErrorCode: 1` (Invalid State) reported at
  `sdkErrorStage: stopping`, with `sdkErrorRetryable: false`.

The next diagnostic variant replaces the explicit
`stopAsync(); destroy()` sequence with **`await sdk.destroy()` only**.
Per the official Node SDK API, `destroy()` is an idempotent full
teardown. This isolates whether the stop transition correlates with
`kInvalidState`; the root cause is not established. Do not suppress or
reclassify errors to force a successful result. A new failure during
`destroying` must also be investigated.

For a consented local re-test, use the branch's latest version and
the documented secure credential prompt. Keep **one face** in view and
include the **upper chest**. Avoid reflective backgrounds, photos or
screens showing faces, and maintain stable, even illumination. The
script should return clean metric-packet evidence before the SDK
integration can be treated as validated. If no metrics appear again,
capture only the sanitized JSON and compare the status history and
validation codes.

Sources:
- https://smartspectra.presagetech.com/docs/nodejs/api-reference
- https://smartspectra.presagetech.com/docs/measurement-quality/

### Fourth physical-camera result: startup never reached Running

A fourth local Zorin Linux run on SDK 3.4.0 reported zero packets and:

- Processing history `[1,2,4,1]` — Idle, Starting, Stopping, Idle.
- Processing state **2 (Starting)** at the end of the measurement window.
- Validation history `[0,1,7]` — OK, No Face Found, Chest Not Visible.
- Error code **1 (Invalid State)** during `destroy()`.

The code-1 callback happened in teardown. It does not by itself explain why
the SDK spent the measurement window in Starting. In contrast to the earlier
run, this session did not report Running. Avoid treating the cleanup error
as proof of invalid credentials (that has a different error code), and do
not assert that the camera or API key is fully validated.

The diagnostic script now emits `captureOutcome: "startup-incomplete"`
for a session with zero packets, no observed Running state, and Starting
at the end of the measurement window. It retains the SDK error and stage
separately rather than masking either finding. It also prints
`cameraCount`, without exposing device identifiers. The optional
`--camera-index N` allows selection of one discovered camera by its
zero-based index; internally it resolves the opaque native camera ID
using `CameraSelection.byId()`. An out-of-range index fails safely.

**Before another consented camera test:** Use your operating system's
camera preview to confirm the intended camera actually shows a single,
well-lit face and upper chest. Close that preview and any conferencing
apps before starting the SDK. If multiple cameras or virtual cameras are
installed, you can explicitly select an index after discovering the count:

~~~sh
npm run spike:sdk -- --measure --consent --seconds 60
# Only when cameraCount > 1 and the first camera failed:
npm run spike:sdk -- --measure --consent --seconds 60 --camera-index 1
~~~

Set the private runtime key using the secure input instructions above,
and unset it after testing. Do not perform repeated tests with the camera
covered or with another application holding the device. Continue only
if willing to test the camera. If no metric packets appear even with
a verified camera preview, report the sanitized lifecycle/validation
results and investigate with Presage support instead of changing native
stop/destroy behavior again.

Official references:
- https://smartspectra.presagetech.com/docs/nodejs/api-reference
- https://smartspectra.presagetech.com/docs/nodejs
- https://smartspectra.presagetech.com/docs/measurement-quality
