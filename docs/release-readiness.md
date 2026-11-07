# Issue #24 — Presage SDK public-release readiness (P0)

**Decision: NO-GO for public SDK-enabled distribution as of 2026-11-07.**
The existing Linux AppImage/deb and Windows NSIS packages are **unsigned,
SDK-free internal review builds**, not working biometric measurement releases.
This issue is a separate approval gate from M5 physical acceptance Issue #5.

## Implemented safety boundary

- A real SmartSpectra session needs an **unpackaged Electron developer
  process**, an explicitly consented camera session, a local privately
  supplied developer `SMARTSPECTRA_API_KEY`, and a temporary pinned SDK
  installation.
- `electron/main.ts` provides `nativeMeasurementAllowed: !app.isPackaged`
  to the camera IPC bridge; IPC **defaults to false** when not opted in.
  Start measurement returns the existing sanitized `sdk-unavailable` code
  in distributed review builds. Preview still works without SDK.
- Packaged builds ignore `SIGNALSCAPE_DEV_SERVER=1`; they load the bundled
  renderer rather than a potentially hostile localhost server. Load failures
  log sanitized codes, not exception objects or URL descriptions.
- Packaged builds do not pass camera frames to native processing even when
  preview is armed. A caller cannot enable this through renderer IPC,
  command-line options or an environment feature flag. An externally
  injected `SMARTSPECTRA_API_KEY` does **not** unlock measurement in packages.
- Existing packaging preflight prohibits a build while
  `SMARTSPECTRA_API_KEY` is set, or while SmartSpectra is declared in the
  review build manifest. The unsigned archive verifier scans both `app.asar`
  and the **entire unpacked application tree**, including `app.asar.unpacked`,
  sibling native libraries and `extraResources`, for forbidden secrets and
  unapproved SDK dependencies;
  `--publish never` remains in the build commands.
- `npm run release:status` prints a fixed-choice, sanitized status of all
  open release gates without printing evidence links, credentials or camera
  data. `npm run release:assert-ready` fails until each gate has a
  separately reviewed approval reference; **even if it passes**, an actual
  public release requires a separate explicit owner action. Neither command
  builds, uploads, signs or releases anything.

**Owner attestation (2026-11-07):** Zorin Linux developer-build physical
camera acceptance passed 13/13 scenarios (Issue #5); private evidence was
not independently inspected. This does **not** validate packaged SDK-enabled
installers or Windows camera behavior, and it does not approve distribution.

## Credential models to decide with Presage

The local developer key-in-process-environment path is a **development
diagnostic only**. Never ship a reusable shared vendor API key in an
Electron installer or Angular asset. Electron desktop packages can be
inspected and their archives extracted.

| Candidate | Requirements before implementation | Status |
| --- | --- | --- |
| Server-issued, user-scoped short-lived credentials | Presage must confirm permitted delegated authentication, token scope/TTL, revocation, rate limits, desktop device binding, audit, and whether the SDK `apiKey` API accepts such credentials. A protected backend would authenticate users and issue ephemeral credentials, with abuse prevention. | **UNVERIFIED**; no issuer endpoint exists |
| User-provided key (BYOK) | Presage must permit end-user accounts and desktop use. Define secure per-user entry, opt-in storage policy, rotation and revoke UX, no renderer/network exfiltration, plus support for key handling. | **UNVERIFIED**; do not enable based on assumption |
| Shared developer/service API key embedded in app | Recoverable from app/process/installer and cannot be safely revoked per user. | **REJECTED** |

**No production credential mechanism has been approved or coded.**
Avoid adding local-storage tokens, fake auth schemes, test tokens or
background network services without vendor and owner review. The
current `SMARTSPECTRA_API_KEY` remains developer-only.

## Licensing and native distribution evidence to obtain

Presage's public Node/Electron guide documents per-platform npm native runtime
packages and Linux glibc >=2.35, but the general documentation does not
establish **SignalScape's specific 3.4.0 redistribution rights** or a
Node/Electron user-scoped delegated credential mechanism. The SDK examples
still pass `apiKey` to the SDK constructor. See the [vendor review request](presage-vendor-review.md)
for a written decision and test evidence record.

Before bundling any SDK code in installers, obtain official written
Presage confirmation for the exact SmartSpectra SDK version **3.4.0**:

1. Whether redistributing the Node SDK, compiled native binaries and
   transitive libraries in **commercial/public Electron** packages is
   permitted, and any attribution, license or pricing requirements.
2. Platform and ABI matrix for Linux x64 initially, and Windows x64/
   macOS ARM64 only if planned; native Electron compatibility and required
   glibc/platform system libraries.
3. Supported production credential model, per-user rights and permitted
   authentication/session behavior; verify outbound provider domains,
   retention, telemetry settings and updates.
4. Runtime closure on an **SDK-enabled clean install** with no temporary
   `npm install` or debug-only dependencies; verify native modules in ASAR
   unpack paths when legally approved. Check full startup/stop/restart,
   uninstall, and process cleanup on actual target hardware.
5. Third-party license notices, supply-chain inventory, signature/trust
   chain, signing process and OS warning behavior.

**Do not redistribute or bundle SmartSpectra now.** Existing clean review
packages intentionally do not include the SDK, and native load checks on
a developer machine do not prove redistribution rights.

## Data flow and privacy posture

Explicit **Preview** opens video-only getUserMedia in trusted renderer
memory. An explicit **Start measurement** starts native custom-input
processing in an allowed unpackaged developer build. Fixed-size transient
RGBA frames travel within the app from renderer to Electron main, then
to the native SDK; typed, validated pulse/breathing rate events return to
the renderer for scene effects. SignalScape does not implement recording,
file persistence, or uploading raw frames. No developer key is exposed by
preload/IPC. SDK `enableTelemetry: false` disables the optional aggregate
telemetry path; it does **not** mean that provider authentication/session
traffic is offline or that undocumented vendor network behavior is proven
absent. See [privacy](privacy.md) and [architecture](architecture.md).
The displayed values are **not clinical measurements** and must not be
used for diagnosis or health decisions.

## Release readiness criteria

The machine-readable `config/release-readiness.json` starts with all
seven gates **unapproved**. An approved gate must cite a relevant
reviewed GitHub issue or PR; references are **documentation**, not
cryptographic proof. The gate command does not determine the legal
validity of vendor permissions and **never** authorizes publishing.

| Gate ID | Required evidence |
| --- | --- |
| `providerRedistributionRights` | Vendor written authorization and license review |
| `supportedNativePlatformRuntime` | Clean-machine native SDK installer tests on supported targets |
| `productionCredentialArchitecture` | Security review and approved delegated/BYOK credential path |
| `privacyAndNetworkReview` | Provider network/privacy validation and clear user disclosures |
| `physicalCameraAcceptance` | M5 human-observed, per-platform camera/consent/lifecycle evidence |
| `signedInstallerValidation` | Signed artifacts and install/uninstall checks on supported targets |
| `explicitOwnerDistributionApproval` | Separate owner approval after reviewing all of the above |

CI may test code, produce SDK-free packages and check the manifest, but
cannot grant licensing approval, physically test a personal camera or
sign installers. Owner sign-off and release decisions happen **separately**.

### Local checks

~~~bash
npm run quality
npm run release:status
npm run release:assert-ready  # expected nonzero exit while NO_GO
npm run package:linux        # ONLY an SDK-free unsigned internal review build
~~~

For an authentic private developer run see [demo](demo.md); for
hardware acceptance use [M5 physical runbook](m5-physical-runbook.md).
Keep [Issue #24](https://github.com/jbrhinalyn/signalscape/issues/24)
and [M5 #5](https://github.com/jbrhinalyn/signalscape/issues/5)
open until independently verified criteria are met.
