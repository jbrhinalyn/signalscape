# Environment and configuration

## Toolchain

- Node.js **24.15.0** via `.nvmrc`, npm **11+** (the repository uses
  `engine-strict=true`).
- Install with `npm ci`. Never hand-edit the dependency lockfile.
- Linux desktop session and Electron/Chromium system libraries are required
  to launch the native window. Typecheck/tests/build do not need a camera.

## Runtime flags

The Electron main process recognizes only these two optional development
flags at M1:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIGNALSCAPE_DEV_SERVER` | unset | When `1`, Electron loads the local Angular server at `http://127.0.0.1:4200/`. |
| `SIGNALSCAPE_SMOKE_TEST` | unset | When `1`, Electron exits on first successful renderer load (or fails on load error). |

Use `npm run dev` and `npm run smoke:desktop`; the npm scripts set these
flags automatically. `.env.example` is an *informational template* and is
not automatically loaded by Electron, Angular or npm.

**No API keys or SDK credentials are needed yet.** In future, any private
keys must stay in the Electron main process or secure OS storage, never in
Angular environment files, `src/`, `public/`, build arguments or renderer IPC.

## Secrets policy

- `.gitignore` excludes `.env` and `.env.*` other than the documented,
  non-secret `.env.example` template.
- `npm run check:secrets` fails on committed .env override files, key/cert
  files, `secrets/` folders and private key markers in **all tracked text files**,\n  including `.env.example` (binary assets are skipped).
- The CI check also catches files forcibly added despite `.gitignore`.
- Never paste SDK tokens, camera frames or physiological readings into issues,
  logs, pull requests or tests. If a credential leaks, revoke and rotate it;
  removing it from the latest commit alone is not enough.

See [privacy baseline](privacy.md) and [architecture](architecture.md).

## M2 native SDK spike (isolated from Electron UI)

`npm run spike:sdk -- --probe` is a Node-only diagnostic script. The official SDK is temporarily installed at the pinned version `3.4.0` for a machine-level probe, not included in the application dependency lockfile. No key is required to probe native loading. An opt-in measurement requires an explicitly provided `SMARTSPECTRA_API_KEY` in the **local Node process environment**, `--measure --consent`, and a physical camera. The script does not print metrics or credentials and disables SDK telemetry; the key must never be shipped in distributed builds. See [SDK validation](sdk-validation.md).
