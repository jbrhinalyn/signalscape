# SignalScape architecture (M1)

SignalScape is a local-first **desktop application**, not a hosted wellness
service. Its intended future purpose is to convert consented,
camera-derived pulse and breathing estimates into abstract, generative scenes.
The M2 feature branch adds a consented local webcam preview and a development-only SmartSpectra custom-input path; a browser-only preview remains available without native camera capabilities.

## Component boundaries

```text
Angular renderer (src/)
    | typed, fixed capabilities via window.signalScape
    v
sandboxed Electron preload (electron/preload.ts)
    | allowlisted IPC channels, validated payloads
    v
Electron main process (electron/main.ts, electron/ipc/, electron/camera/)
    | video-only permission check + start/stop + SDK key from main environment
    v
Angular opt-in getUserMedia preview -> bounded RGBA frames via fixed IPC
    | one webcam stream; SDK useCustomInput/sendFrame in Electron main
    v
Minimal metric presence, packet counts, status / framing codes only
    | future Three.js generative scene (NOT IMPLEMENTED)
```

- **Angular:** standalone UI, state and visualization. It must not import
  Node/Electron runtimes or receive raw credentials.
- **Preload:** narrow versioned bridge, frozen public API and SDK status event
  validation. Do not expose generic `ipcRenderer` methods.
- **Electron main:** controls OS permissions, trusted-window IPC authorization,
  native SDK lifecycle and any future private configuration.
- **M2 SDK adapter:** isolated native lifecycle; initialize only after the user starts measurement, accept transient frames from a single consented webcam preview, and emit only validated status/metric-presence indicators. SDK native runtime remains an optional developer installation, not a packaged application dependency.
- **Scene renderer (future):** consumes approved values, not camera frames;
  graphics and exports should be separate from acquisition.

## Current security baseline

The renderer uses `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`, and `webSecurity: true`. Navigation/popups are denied and
the HTML Content Security Policy blocks remote scripts and embedding.
Electron denies camera by default; explicit user Preview action temporarily arms video-only permission for the trusted main frame.
See [IPC security contract](ipc-security.md).

## Builds and quality gates

`npm run quality` covers formatting, source-level lint checks, tracked-secret
protection, TypeScript typechecking, unit tests and production builds. The
Linux pull-request workflow additionally launches Electron under a virtual
display with sandboxing enabled and creates unsigned Linux packages.

These checks are lightweight and deliberately avoid introducing unpinned
M1 dependencies. `lint` checks TypeScript syntax/AST safety rules, JavaScript
syntax and JSON parsing; `format` normalizes line endings/trailing whitespace.
It is **not** a full ESLint/Prettier style configuration.

## Future changes

Any native bridge or camera permission change requires a reviewed contract,
runtime validation, explicit user consent, negative tests, privacy review and
document updates. Never weaken renderer sandboxing to make development easier.

## M2 camera boundaries

For implementation details, packet streaming limits, key handling and release blockers see [camera preview](camera-preview.md). Never put Presage keys in the renderer or enable camera permission globally. The native custom-frame SDK path is developmental and requires physical webcam verification before release.
