# SignalScape

**SignalScape** is an Angular + Electron desktop experiment that turns **opt-in, quality-gated camera-derived pulse and breathing estimates** into responsive Three.js forest effects. Preview and measurement require separate consent, and the forest remains neutral without reliable live signals. **Experimental visualization only: not a medical device or a diagnostic, treatment, monitoring, or emergency-response service.**

## Developer-build acceptance snapshot (2026-11-07)

The owner reported **13/13 PASS** for the Zorin Linux developer-build M5
physical-camera acceptance matrix (**0 failures, 0 blocked cases, 0 errors
observed**). This is an **owner attestation**, not independent inspection of
the private local acceptance JSON. A prior successful SDK session separately
reported 1,363 metric packets, with pulse and breathing observed; these are
not clinical-accuracy claims. See the
[M5 evidence ledger and scenario matrix](docs/m5-acceptance.md) and
[Issue #5](https://github.com/jbrhinalyn/signalscape/issues/5).

**Distinct release boundary:** Linux/Windows review installers are SDK-free
and disable native measurement; no SDK-enabled clean-installer camera
acceptance has been claimed. Public SDK distribution stays **NO-GO** pending
[Issue #24 licensing, credential and installer gates](docs/release-readiness.md).
For an authentic live demonstration use the privately configured
**unpackaged Electron developer build**, not the review installer or
camera-free synthetic tests.

## Challenge showcase video

The **Showcase privacy** toggle masks the in-app camera image and numeric
pulse/breathing rates, while genuine SDK packet counters, signal availability
and quality-gated forest effects continue. It **does not** record video,
hide other windows or authorize SDK distribution. Enable it before using a
trusted external **window-only** recorder. The
[real-camera showcase storyboard and privacy review checklist](docs/challenge-demo-video.md)
explains how to produce and verify an authentic challenge clip without
publishing private imagery or readings.

## Recorded demonstration and technical article

- [Watch the owner's 3:32 SignalScape recording](https://share.zight.com/01a1b6e3-7a47-7080-8098-3c279ee75aba) — an opt-in, real-camera developer demo. The owner chose to show their own webcam and on-screen estimates; this video is **not privacy-masked**. It is not independent medical or SDK validation.
- [Read the standalone technical showcase article](docs/technical-showcase-article.md) — implementation details, demo and source links, responsive signals, limits, consent, and data handling. The article is a draft for review, **not a contest submission**.

## Prerequisites

- Linux desktop with an X11 or Wayland graphical session (tested target: Zorin / Ubuntu 24.04-compatible Linux); Windows x64 review builds are available but real-camera Windows acceptance is pending.
- **Node.js 24.15.0** (see `.nvmrc`), npm **11 or newer**.
- Standard Electron/Chromium system libraries, including GTK 3, NSS, and ALSA.
- Git and a working webcam for live measurement. Camera preview needs no API key. Optional SmartSpectra measurement requires an authenticated network session, privately supplied developer key and temporary install of the pinned native SDK (not part of `npm ci`).

Angular 22 requires Node.js `^22.22.3 || ^24.15.0 || ^26.0.0` and TypeScript `>=6.0.0 <6.1.0`. This workspace standardizes on Node 24.15 and TypeScript 6.0. Electron 45.x runs an embedded Chromium/Node runtime independent of the system Node used to build.

## Fresh install and development

```bash
git clone https://github.com/jbrhinalyn/signalscape.git
cd signalscape
nvm install
nvm use
npm ci
npm run dev
```

`npm run dev` starts Angular at **http://127.0.0.1:4200/** and then launches Electron pointing at that local development server. **Use the Electron window for camera/SDK features**; `npm run dev:renderer` is browser-only and cannot show real SmartSpectra measurements. Electron's main process must be restarted to see changes under `electron/`; Angular reloads automatically.

On Windows use matching Node 24.15/npm 11+ and `npm ci` in PowerShell; nvm is optional. For an authenticated **real-camera developer demonstration**, follow the [fresh-machine and live SDK walkthrough](docs/demo.md) rather than assuming a clean installation includes the native SDK.

> Use `npm ci` for clean, repeatable installations. Commit changes to `package-lock.json` alongside any intentional dependency updates.

## Quality gates

```bash
npm run lint           # TypeScript AST safety checks, JS syntax, JSON validity
npm run format:check   # Fail on inconsistent line endings and trailing whitespace
npm run format         # Apply safe whitespace normalization
npm run check:secrets  # Fail on tracked .env secrets and key files
npm run typecheck
npm test
npm run build
npm run quality        # Run the enforced gates together
```

GitHub Actions runs `npm run quality` for every pull request and push to
`main`, then performs a sandboxed Linux Electron smoke launch and creates
unsigned Linux release packages. The lint and formatter are intentionally
lightweight and use already installed tools; see [CONTRIBUTING](CONTRIBUTING.md)
for their scope and the pull-request checklist.

The additional M5 camera-free acceptance suite uses **NONPRODUCTION SYNTHETIC TEST DATA**
from fake native SDK fixtures, never real camera measurements. Run
`npm run test:acceptance` to check SDK event validation through signal gating,
visualization and consented stop/restart behavior. The app itself does **not**
generate simulated vital-sign readings. Green CI is not a substitute for
physical-camera acceptance; see the [M5 acceptance matrix and release blockers](docs/m5-acceptance.md).

For **human-observed Zorin Linux hardware acceptance**, see the [M5 physical runbook](docs/m5-physical-runbook.md). With Electron running separately, use `npm run acceptance:manual -- --mode=developer` for the 13-scenario guided checklist. The recorder does **not** operate a camera, authenticate to the SDK, or mark scenarios as passed automatically. Local evidence remains in ignored `.m5-manual-reports/`. The owner
has reported 13/13 PASS for the Zorin Linux **developer build**, while
SDK-enabled packaged hardware verification and distribution approval remain
pending.

## Build and Linux / Windows packaging

```bash
npm test
npm run typecheck
npm run build
npm run desktop
npm run package:linux    # Linux x64 AppImage + deb
npm run package:win      # Windows x64 NSIS installer, on Windows
```

- `npm run build`: Angular static renderer to `dist/renderer/`, Electron TypeScript to `dist/electron/`.
- `npm run desktop`: build and launch the local-file desktop build (no server needed).
- `npm run package:linux`: create unsigned AppImage and Debian packages under `release/`.
- `npm run package:win`: create an unsigned Windows x64 NSIS installer under `release/` on Windows.
- `npm run package:verify:linux` / `npm run package:verify:win`: validate app.asar, versioned installer names and secret-file exclusions, and produce SHA-256 checksums.
- `npm run smoke:desktop`: launch a **previously built** Electron app and exit automatically on successful renderer load (useful with `xvfb-run` on Linux CI).

**Packaging is for review only:** the native SmartSpectra SDK and credentials are not bundled, and Windows code signing is not configured. Packaged builds explicitly disable native measurement regardless of environment credentials; camera preview still works. See [Issue #24 public-release readiness and approval gates](docs/release-readiness.md). CI installs and smoke-launches the Linux .deb and smoke-launches the unpacked Windows app. See [M5 desktop packaging and distribution blockers](docs/packaging.md).

Built outputs, `node_modules/`, and `release/` are not committed. Use `npm ci` for repeatable installs and keep `package-lock.json` in version control.

## Typed desktop bridge and privacy

The browser-only renderer has no native camera bridge. Electron exposes a narrow, versioned `window.signalScape` API for public app status/configuration, SDK events, camera enumeration, explicit permission arm/disarm, measurement start/stop and validated transient frame delivery. There is **no general-purpose Node, filesystem, credentials, `ipcRenderer.invoke` or `ipcRenderer.send` interface**. Trusted-frame origin checks, limited event schemas, `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, navigation restrictions and a restrictive Content Security Policy remain in place. See [IPC security](docs/ipc-security.md).

Electron denies camera permission by default. **Preview camera · Allow access** requests video-only permission, while **Start measurement** separately begins the optional native SDK custom-input path. Frames are transient and passed locally from renderer to Electron main; **validated numeric pulse/breathing rates**, quality/status codes and aggregate packet counters return to Angular to drive cards and the forest. Raw frames, full SDK packets, face landmarks and API credentials are not sent to Angular or stored by SignalScape application code.

**Network disclosure:** SignalScape configures the SDK with aggregate telemetry **disabled** (`enableTelemetry: false`), but **Presage authentication/session traffic can still occur**. Do not present the app as completely offline. The optional SDK and key are absent from review packages; no public distribution decision has been made. Read [privacy and data handling](docs/privacy.md) before an actual-camera demo.

## Project layout

```text
electron/          Electron main, sandboxed preload, typed IPC and native handlers
src/               Angular standalone application, type-only desktop declaration and styles
public/            Static renderer assets
tests/             Node tests for foundation and isolated IPC contracts
docs/              Architecture, privacy, environment and IPC security
angular.json       Angular build / dev-server configuration
tsconfig*.json     Strict renderer and Electron TypeScript configurations
```

## Architecture, privacy and environment

- [Architecture and component boundaries](docs/architecture.md)
- [Privacy, SDK network/telemetry and data handling](docs/privacy.md)
- [Fresh-machine real-camera demo and troubleshooting](docs/demo.md)
- [Environment flags and secrets](docs/environment.md)
- [IPC security contract](docs/ipc-security.md)
- [M3 typed signals, units, freshness and quality state machine](docs/signals.md)
- [M3 unitless visualization smoothing, staleness and neutral fallback](docs/visualization.md)
- [M4 Three.js forest, live signal effects, reduced motion and desktop QA](docs/forest-scene.md)
- [Contribution guide](CONTRIBUTING.md)

Camera preview is opt-in in the Electron development prototype. The owner
reported a prior successful Zorin Linux SDK session (1,363 metric packets,
pulse and breathing present), and subsequently attested the 13/13 M5
developer-build scenarios PASS. Neither result was independently verified
from private hardware files. The optional native SDK is not bundled with
packaged releases; production credential delivery, platform packaging and
licensing remain pending.

## Scope and current limitations

The M1–M4 work includes sandboxed desktop IPC, explicit camera consent, optional SmartSpectra custom-input measurement, validated rate cards, and responsive forest looks. **Live SDK measurement works only in a configured development environment**, not in a plain `npm ci` installation or the unsigned release artifacts. A private developer key is required for the developer demo; an approved
production credential model, redistribution rights and SDK-enabled packaged
hardware acceptance are still required before public release.

## M2 SmartSpectra native validation spike

Issue #9 introduces an **isolated Node.js probe** for the official SmartSpectra native SDK. This does not enable camera access in the Electron app, add SDK code to Angular, or ship API keys. To check native loading on a supported machine, install the pinned SDK temporarily and run the probe:

```bash
npm ci
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
npm run spike:sdk -- --probe
```

An optional, explicitly consented camera/auth/metric test, native platform matrix, telemetry privacy settings, blocker evidence, and safe key-handling guidance are documented in [M2 SDK validation](docs/sdk-validation.md). The dedicated **SmartSpectra Native Probe (no credentials)** workflow runs on PRs that change the spike, and can also be manually dispatched after the workflow is present on the default branch. Live measurement **is available in an explicitly configured Electron developer session**, but the optional native SDK and credentials are **not** included in CI, a clean `npm ci` or packaged releases.

## Real-camera demo

Follow the [M5 demo guide](docs/demo.md) for a reproducible fresh-machine setup, consent sequence, real SDK measurement and sanitized verification. The local [camera preview guide](docs/camera-preview.md) has deeper troubleshooting. A browser-only Angular preview cannot demonstrate native SDK metrics. **Metric packets > 0** and visible **quality-gated rate cards** — not animated visuals alone — are evidence of real integration. The in-app rhythm curves are illustrations, not sampled medical waveforms. No mock readings ship with the app.
