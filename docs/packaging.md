# M5 desktop packaging — Issue #18

**Status: review builds only. NOT APPROVED FOR PUBLIC DISTRIBUTION.**
The build pipeline prepares reproducible, **unsigned** Linux and Windows
packages. App startup and camera preview are separate from SmartSpectra
measurement: the optional SmartSpectra 3.4.0 runtime is **not** included,
and no API credentials are bundled. Native SDK measurement is also blocked in packaged Electron builds irrespective of process environment credentials, while video-only Preview remains available. Do not advertise the packaged app as a
working real-measurement release. See the [SDK-enabled public-release approval gates](release-readiness.md) and `npm run release:status` (currently NO_GO).

## Versioned builds and outputs

Use Node 24.15.0 (`.nvmrc`), npm 11+, the checked-in `package-lock.json`
(`npm ci`, **not** `npm install`), and a supported native build machine.
Do not build while `SMARTSPECTRA_API_KEY` is in the environment.

**Linux x64 (Ubuntu 24.04 or compatible desktop):**

```sh
npm ci
npm run package:linux
npm run package:verify:linux
```

This creates `release/SignalScape-<version>-linux-x64.AppImage`, a Debian
`release/SignalScape-<version>-linux-x64.deb` (the architecture field may be
`amd64`), and `release/SHA256SUMS-linux.txt`.

**Windows x64 (PowerShell on Windows build machine):**

```powershell
npm ci
npm run package:win
npm run package:verify:win
```

This creates `release/SignalScape-<version>-win-x64.exe` (NSIS installer)
and `release/SHA256SUMS-win.txt`.

`<version>` is taken from `package.json`; `0.1.0` is the current
version. Increment the package version and regenerate the lockfile for a
future release. The package verifier fails if artifact filenames omit
the expected version, if the ASAR lacks its executable entry points, or
if the ASAR metadata version does not match.

CI: `foundation-linux.yml` uses `npm ci`, runs existing quality and M5
tests, then packages the Linux formats, **installs the generated .deb** and
smoke-launches the installed app under Xvfb with Chromium sandboxing on.
`package-windows.yml` uses a native Windows x64 runner, runs tests and
checks, creates an NSIS installer and smoke-launches the unpacked Windows
executable. Both workflows verify the archive and produce SHA-256 files
before uploading short-lived review artifacts. Neither uses or needs API
keys, SDK credentials, code-signing certificates or release publication
permissions. They run on PRs and `main` pushes.

## Local installation and manual acceptance

The automated smoke test only confirms the built Electron application
opens its local renderer and exits cleanly. It is **not** a physical-camera
test or Windows installer UI validation.

On Linux, install the .deb with `sudo apt install ./release/*.deb`, launch
SignalScape from the application menu, and verify UI navigation, Preview
camera opt-in, Stop camera, close, and webcam indicator off. Also test
the AppImage on a matching Linux host; do not disable Chromium sandboxing
to bypass setup problems. If the AppImage cannot establish its sandbox,
record the host distribution and failure rather than invoking
`--no-sandbox`.

On Windows, run the unsigned NSIS installer in a disposable test machine,
check its installation path/version, launch from Start, confirm consented
camera preview, Stop camera and complete exit. Uninstall and confirm the
application is removed. Record Windows version, x64 architecture, SmartScreen
warnings, installation logs **without secrets**, app version and result.

Use the [M5 guided hardware runbook](m5-physical-runbook.md) and
[M5 acceptance checklist](m5-acceptance.md) for actual physical camera
matrix evidence and owner sign-off. The recorder does not make any claims
about real SDK readings in unsigned review packages. A successful CI build alone does **not** close
those release gates.

## Security and distribution limitations

- Electron remains sandboxed with context isolation, disabled Node
  integration, restricted IPC and navigation. The build does not ship keys,
  developer `.env` files, private certificates, source maps, the SDK, or
  telemetry test fixtures. The preflight rejects a developer SDK key in
  the environment, forbidden build files and private-key markers.
- Each packaged `app.asar` is inspected for expected entry points,
  version consistency, forbidden secret-like filenames and native SDK
  dependencies. The SHA-256 list allows review artifacts to be checked
  against CI; a checksum **does not provide signing/authenticity**.
- **Linux builds are unsigned. Windows installers are unsigned.** GitHub
  artifacts are for trusted internal validation only. Windows may show
  SmartScreen/unknown publisher warnings. No production signing identity,
  certificate, secret or auto-update endpoint is configured. Do **not**
  add a PFX, PEM, `CSC_LINK` value or private key to the repository or
  app bundle. A future signing workflow must use a dedicated protected
  release environment and secret store, with permissions audited.
- SmartSpectra is intentionally absent. Native runtime closure on both
  platforms, redistribution permission/licensing, valid SDK authentication,
  production-safe user-scoped credentials and real-camera validation all
  remain release blockers. Developer credentials can be supplied privately
  to an **unpackaged** local development process for SDK testing only.
  **Never ship a reusable shared API key**: an Electron ASAR can be extracted
  by anyone who receives it.
- No implicit publish occurs: `--publish never` is used and GitHub jobs
  have `contents: read` only. Release tags/production distribution require
  a separate explicit decision after hardware, privacy and licensing sign-off.

Related: [SDK validation](sdk-validation.md),
[camera setup](camera-preview.md), [privacy](privacy.md),
[M5 acceptance](m5-acceptance.md).
