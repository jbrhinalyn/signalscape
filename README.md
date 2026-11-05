# SignalScape

**SignalScape** is a privacy-conscious desktop experiment that will turn camera-derived pulse and breathing signals into generative landscapes. This repository currently contains only the secure **Angular + Electron foundation** (Issue #6). There is no camera capture, Presage SmartSpectra SDK integration, or health measurement in this milestone.

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
npm run test
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

## Security and camera privacy baseline

- Angular runs as an unprivileged renderer: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.
- The preload process currently exposes only a constant `signalScape.apiVersion` marker. **No raw Electron IPC, Node, file-system, or shell access** is available to the renderer. Issue #7 will design typed, allowlisted APIs.
- Renderer navigation and pop-up windows are blocked. The HTML enforces a restrictive Content Security Policy. Production mode loads local application files, not remote websites.
- All Electron permission requests (including camera permission) are denied for now. Future milestones must add explicit camera consent and a visible stop/disconnect experience before any video or physiological signal processing.
- No camera frames, health readings, tokens, or credentials are collected or transmitted by this foundation.

## Project layout

```text
electron/          Electron main and minimal sandboxed preload
src/               Angular standalone application and styles
public/            Static renderer assets
tests/             Node built-in test runner for foundation invariants
angular.json       Angular build / dev-server configuration
tsconfig*.json     Strict renderer and Electron TypeScript configurations
```

## Scope

Issue #6 establishes the desktop foundation. Issue #7 will add secure typed IPC and app configuration; Issue #8 covers comprehensive linting, formatting and persistent CI quality gates. SmartSpectra, camera permissions and real-time visualization come later in the product roadmap.
