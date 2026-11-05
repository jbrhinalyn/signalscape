# M2 SmartSpectra native validation (Issue #9)

**Status (2026-11-06): native load verified on Ubuntu 24.04; physical camera/auth measurements pending.**
This is a standalone Node.js experiment, **not an enabled feature** in
SignalScape. Electron's permission-deny policy and the Angular/IPC boundaries
remain unchanged. No camera opens on app launch.

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
| Real samples observed or SDK failure explained | **Pending physical validation**: no camera or key is available to this execution environment. The opt-in probe distinguishes missing camera, credentials, native loading, SDK errors and missing samples. |
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
Obtain per-session user consent, display capture state and a Stop button,
and review network disclosure and camera privacy before implementing a
renderer feature in a later issue. Do not change existing deny-by-default
camera permissions for this spike.

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
