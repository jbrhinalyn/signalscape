# SignalScape desktop IPC security contract (Issue #7)

The Angular renderer is an untrusted, sandboxed UI. Electron main owns native
operations and any future credentials. Preload exposes only a frozen
`window.signalScape` object; browser-only previews have no such object.

## Renderer API (v1)

| Method | IPC channel | Result / behavior |
| --- | --- | --- |
| `apiVersion` | none | literal `1` |
| `getAppStatus()` | `signalscape:app-status` | Promise of `{ apiVersion, version, platform, ready }` |
| `getPublicConfig()` | `signalscape:public-config` | Promise of mode and explicit, non-sensitive feature flags |
| `onSdkStatus(listener)` | `signalscape:sdk-status` | Receive validated status/error-code events; returns unsubscribe |

The typed source of truth is `electron/ipc/contracts.ts`.
`src/types/desktop.d.ts` and the preload import **types only**, so the
native contract file is not included in Angular's JavaScript bundle.
Electron's sandboxed preload does not support `require` of local modules,
so it mirrors the small fixed channel and event allowlists; tests check their
agreement with the central contracts. Preload never exports `ipcRenderer`,
`send`, arbitrary `invoke`, Node globals, or filesystem/OS methods.

## Security invariants

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and
  `webSecurity: true` remain enabled. Renderer navigation, popups and
  webviews are blocked.
- Main checks **every** IPC request against the currently active main
  window, its top-level frame, and the exact approved application URL.
  Calls from other frames/windows and calls with extra parameters are rejected.
- Main registers only two request handlers. There is no channel name argument
  or generic native command dispatcher exposed to Angular.
- Public configuration is **constructed from an explicit allowlist** in
  `electron/ipc/handlers.ts`. Never spread `process.env`, `app`, SDK
  objects, storage contents or local paths into IPC responses. Credentials,
  when introduced, must stay in Electron main and never enter `src/` or
  `public/`.
- `onSdkStatus` is reserved for a later milestone. Preload drops malformed
  events and forwards frozen copies containing only known primitive fields.
  SDK events are not emitted yet and camera permission remains denied.
- Do not introduce `--no-sandbox` or turn off `contextIsolation` to make a
  local setup or CI pass.

## Verification

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
`tests/ipc.test.cjs` exercises the TypeScript contract, trusted/untrusted
main handlers, public-config redaction, the frozen preload surface, malformed
SDK events, and unsubscribe behavior. The existing Linux workflow additionally
checks the desktop smoke launch and packages.

Every new native capability must add a dedicated channel, a typed contract,
main-frame authorization, runtime validation, negative tests and a security
review before the preload or renderer calls it.
