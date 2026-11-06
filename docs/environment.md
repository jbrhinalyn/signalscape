# Environment, prerequisites and secrets

## Reproducible toolchain

- Node.js **24.15.0** (pinned by `.nvmrc`) and npm **11+**. `.npmrc` sets `engine-strict=true`; an older Node/npm will fail installation.
- Git, a working desktop session and a physical camera for camera/SDK testing. On Linux use Ubuntu 24.04-compatible/Zorin Linux x64 with Electron/Chromium GTK3, NSS and ALSA system libraries. Native SmartSpectra Linux also requires **glibc >= 2.35**; supported SDK platforms are Linux x64/ARM64, Windows x64 and macOS ARM64, though this project validates Linux first.
- Build from the checked-in lockfile: `nvm install && nvm use && npm ci` on Linux/macOS with nvm installed. On Windows install compatible Node/npm first (nvm is optional) and use `npm ci` from PowerShell. **Do not hand-edit `package-lock.json`.**
- `npm run dev` launches Angular at `http://127.0.0.1:4200/` and then the Electron window. `npm run dev:renderer` is browser-only and cannot demonstrate the native SDK.

## Runtime values

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIGNALSCAPE_DEV_SERVER` | unset | `1` loads Angular's local development server; set by development npm scripts |
| `SIGNALSCAPE_SMOKE_TEST` | unset | `1` exits Electron after a renderer smoke launch; set by test scripts |
| `SMARTSPECTRA_API_KEY` | unset | **Developer-only** Presage credential read in Electron main at measurement startup; needed only for actual SDK measurements |

`.env.example` is informational only: it is **not automatically loaded** by Angular, npm or Electron. Do not put real keys in `.env.example` or any tracked file.

## Native SDK is optional and not packaged

A clean `npm ci` installs the application, **not** `@smartspectra/node-sdk@3.4.0`. Camera preview works without that SDK; Start measurement does not. For local development on a supported target, after `npm ci` use:

~~~sh
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
~~~

For a Linux developer test only, enter your key without a shell-history argument:

~~~sh
read -rs -p 'Presage API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run dev
unset SMARTSPECTRA_API_KEY
~~~

Run the last command **after** exiting the app. Do not use this method to distribute builds: process environment keys are developer-test credentials and can be exposed on a compromised host. Production requires a reviewed, user-scoped credential/token design.

## Secrets and privacy

- `.gitignore` excludes local `.env` overrides and key/certificate files; `npm run check:secrets` checks tracked files. Do not use Angular environment files, renderer IPC, build flags, command-line arguments, issue screenshots or logs to carry SDK keys.
- SmartSpectra SDK telemetry defaults to enabled upstream. SignalScape deliberately sets `enableTelemetry: false` and `logLevel: kNone`. **Provider authentication still needs network access; do not promise offline measurement.**
- No SDK binary or credential is included in the unsigned AppImage, Debian package or Windows installer; see [packaging](packaging.md). For a safe, repeatable private demonstration see [demo](demo.md), [privacy](privacy.md) and [native SDK validation](sdk-validation.md).
