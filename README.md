# SignalScape

**SignalScape** is a privacy-conscious desktop experiment that will turn camera-derived pulse and breathing signals into generative landscapes. The current **Angular + Electron M1 foundation** includes typed desktop IPC and public app configuration (Issues #6–#7). There is no camera capture, Presage SmartSpectra SDK integration, or health measurement yet.

## Prerequisites

- Linux desktop with an X11 or Wayland graphical session (tested deployment target: Ubuntu 24.04-compatible Linux).
- **Node.js 24.15.0** (see `.nvmrc`), npm **11 or newer**.
- Standard Electron/Chromium system libraries, including GTK 3, NSS, and ALSA.
- Git. No API keys or `.env` file are required for this milestone.

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

All Electron permission requests (including camera) are still denied. Future milestones must add explicit camera consent and a visible stop/disconnect experience before any video or physiological signal processing. No camera frames, health readings, tokens or credentials are collected or transmitted by this foundation.

## Project layout

```text
electron/          Electron main, sandboxed preload, typed IPC and native handlers
src/               Angular standalone application, type-only desktop declaration and styles
public/            Static renderer assets
tests/             Node tests for foundation and isolated IPC contracts
docs/              IPC security contract and extension rules
angular.json       Angular build / dev-server configuration
tsconfig*.json     Strict renderer and Electron TypeScript configurations
```

## Scope

Issues #6 and #7 establish the desktop foundation and allowlisted IPC contract. Issue #8 covers linting, formatting and persistent quality gates. SmartSpectra, camera permissions, and real-time visualization come later in the roadmap.
