# SignalScape architecture (M1)

SignalScape is a local-first **desktop application**, not a hosted wellness
service. Its intended future purpose is to convert consented,
camera-derived pulse and breathing estimates into abstract, generative scenes.
The current M1 implementation is a shell with **no camera or SmartSpectra
integration**; a browser preview is also available.

## Component boundaries

```text
Angular renderer (src/)
    | typed, fixed capabilities via window.signalScape
    v
sandboxed Electron preload (electron/preload.ts)
    | allowlisted IPC channels, validated payloads
    v
Electron main process (electron/main.ts, electron/ipc/)
    | native app status and public configuration only (M1)
    v
Future consent + SmartSpectra adapter (NOT IMPLEMENTED)
    | derived metrics only after explicit user consent (planned)
    v
Future Three.js generative scene (NOT IMPLEMENTED)
```

- **Angular:** standalone UI, state and visualization. It must not import
  Node/Electron runtimes or receive raw credentials.
- **Preload:** narrow versioned bridge, frozen public API and SDK status event
  validation. Do not expose generic `ipcRenderer` methods.
- **Electron main:** controls OS permissions, trusted-window IPC authorization,
  native SDK lifecycle and any future private configuration.
- **SDK adapter (future):** isolated lifecycle; initialize only after consent,
  stop and release the camera on user request, and expose minimal validated
  derived signals rather than raw video.
- **Scene renderer (future):** consumes approved values, not camera frames;
  graphics and exports should be separate from acquisition.

## Current security baseline

The renderer uses `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`, and `webSecurity: true`. Navigation/popups are denied and
the HTML Content Security Policy blocks remote scripts and embedding.
Electron denies permission requests including camera today.
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
