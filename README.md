# SignalScape

**SignalScape** is a privacy-conscious Angular + Electron desktop experiment that maps validated camera-derived pulse and breathing measurements to a subtle Three.js forest. The optional SmartSpectra path uses explicitly consented local camera frames; the scene remains neutral without trustworthy measurements. No camera runs automatically, and clinical health measurement is not provided.

## Prerequisites

- Linux desktop with an X11 or Wayland graphical session (tested deployment target: Ubuntu 24.04-compatible Linux).
- **Node.js 24.15.0** (see `.nvmrc`), npm **11 or newer**.
- Standard Electron/Chromium system libraries, including GTK 3, NSS, and ALSA.
- Git. Camera preview needs no API key. Optional SmartSpectra measurement requires a developer key supplied privately to Electron's main process.

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

`npm run dev` starts Angular at **http://127.0.0.1:4200/** and then launches Electron pointing at that local development server. You can also run the browser-only preview with `npm run dev:renderer`. Electron's main process must be restarted to see changes under `electron/`; Angular reloads automatically.

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

## Build and Linux packaging

```bash
npm test
npm run typecheck
npm run build
npm run desktop
npm run package:linux
```

- `npm run build`: Angular static renderer to `dist/renderer/`, Electron TypeScript to `dist/electron/`.
- `npm run desktop`: build and launch the local-file desktop build (no server needed).
- `npm run package:linux`: create unsigned AppImage and Debian packaging under `release/`.
- `npm run smoke:desktop`: launch a **previously built** Electron app and exit automatically on successful renderer load (useful with `xvfb-run` on Linux CI).

Built outputs, `node_modules/`, and `release/` are not committed. Use `npm ci` for repeatable installs and keep `package-lock.json` in version control.

## Typed desktop bridge and privacy

The browser preview has no native API. In Electron, the renderer receives only these typed capabilities through `window.signalScape`:

- `apiVersion` — literal `1`.
- `getAppStatus()` — version, platform and readiness from the native process.
- `getPublicConfig()` — explicit non-sensitive feature flags and runtime mode.
- `onSdkStatus(callback)` — reserved subscription for strictly validated, allowlisted future SDK status events; returns an unsubscribe function.

The bridge has no arbitrary `invoke`/`send` capability, Node API, credentials or file access. Native handlers enforce that requests come from the active trusted main frame, and reject extra parameters. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, navigation restrictions and a restrictive renderer Content Security Policy remain enabled. See [IPC security contract](docs/ipc-security.md).

Electron denies camera permissions by default. Only the explicit **Preview camera** action arms video-only access for the trusted app frame; **Stop camera** revokes it and releases the stream. An optional Start measurement action sends bounded in-memory frames to SmartSpectra in Electron main, without sending SDK credentials to Angular. This prototype does not store or log frames or biometric values; SDK authentication may communicate with Presage. See [local preview setup](docs/camera-preview.md).

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
- [Privacy and camera consent baseline](docs/privacy.md)
- [Environment flags and secrets](docs/environment.md)
- [IPC security contract](docs/ipc-security.md)
- [M3 typed signals, units, freshness and quality state machine](docs/signals.md)
- [M3 unitless visualization smoothing, staleness and neutral fallback](docs/visualization.md)
- [M4 Three.js forest, live signal effects, reduced motion and desktop QA](docs/forest-scene.md)
- [Contribution guide](CONTRIBUTING.md)

Camera preview is opt-in in the Electron development prototype. The owner verified the live Zorin Linux SDK pipeline (1,363 metric packets, pulse and breathing present) and the Stop/reopen lifecycle. The optional native SDK is not bundled with packaged releases; production credential delivery, platform packaging, and licensing remain pending.

## Scope

Issues #6 and #7 establish the desktop foundation and allowlisted IPC contract. Issue #8 establishes repeatable quality gates and project documentation. SmartSpectra, camera permissions, and real-time visualization come later in the roadmap.

## M2 SmartSpectra native validation spike

Issue #9 introduces an **isolated Node.js probe** for the official SmartSpectra native SDK. This does not enable camera access in the Electron app, add SDK code to Angular, or ship API keys. To check native loading on a supported machine, install the pinned SDK temporarily and run the probe:

```bash
npm ci
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
npm run spike:sdk -- --probe
```

An optional, explicitly consented camera/auth/metric test, native platform matrix, telemetry privacy settings, blocker evidence, and safe key-handling guidance are documented in [M2 SDK validation](docs/sdk-validation.md). The dedicated **SmartSpectra Native Probe (no credentials)** workflow runs on PRs that change the spike, and can also be manually dispatched after the workflow is present on the default branch. Live measurement is **not** included in the app or its standard CI suite.

## Try the M2 camera preview

See [Camera preview setup and privacy notes](docs/camera-preview.md) for the optional SDK install, secure main-process key prompt, and Preview / Start / Stop controls. A browser-only Angular preview cannot request native camera permission. The app does not record raw frames or transmit the key through IPC.
