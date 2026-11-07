# M5 acceptance: offline automation and physical-camera checklist (Issue #17)

**Status (2026-11-07): Zorin Linux developer-build M5 matrix owner-reported
13/13 PASS (0 failures, 0 blocked, 0 errors observed). This is an owner
attestation, not independent inspection of private hardware evidence.
SDK-enabled packaged release remains NO-GO.** This file separates repeatable
automated tests from hardware observations. CI is headless and camera-free;
it cannot verify real webcam behavior or redistribution rights.

## NONPRODUCTION SYNTHETIC TEST DATA

`tests/m5-acceptance.test.cjs` uses a deliberately fake, in-memory native
SDK and fabricated pulse/breathing samples. They exist **only in Node tests**,
never in the shipped Electron/Angular runtime. They do not test clinical
accuracy, camera optics, model accuracy, Presage authentication, or native
packaging. The displayed forest falls back to neutral without validated
live measurements. Illustrative rhythm animations are **not SDK waveforms**.
No demo or mock vital-sign generator is enabled in the application. Do not
describe fixture output as a genuine camera measurement in a demo.

## Automated coverage and reproducibility

Use Node from `.nvmrc`, then run:

```sh
nvm use
npm ci
npm run quality
npm run test:acceptance
```

The pull-request Linux workflow runs `npm run quality` (lint, format,
secrets, both TypeScript typechecks, all Node tests and production build),
a sandboxed Electron smoke launch, and unsigned AppImage/deb packaging.
The explicit M5 step then reruns the camera-free acceptance suite and
surfaces its result separately in CI. No API key, networked SDK login or
webcam is required for these tests.

| Concern | Automated evidence | Remaining hardware evidence |
| --- | --- | --- |
| SDK adapter, schema and confidentiality | `camera.test.cjs`, `signals.test.cjs`, `m5-acceptance.test.cjs` | Real native SDK emits live samples |
| IPC trust, frame size, preview arm/disarm | `ipc.test.cjs`, `camera.test.cjs`, M5 lifecycle test | OS media permission behavior |
| Session stop, restart and failed teardown | `camera.test.cjs`, `camera-ui.test.cjs`, M5 lifecycle test | Camera LED off, no leaked handles |
| Signal confidence, warm-up, stale and invalid framing | `signals.test.cjs`, M5 pipeline test | Real quality loss/recovery |
| Renderer UI, consent and diagnostics | `camera-ui.test.cjs`, `metric-cards.test.cjs` | Actual window, accessibility, GPU |
| Scene neutral fallback, smoothing, reduced motion | `visualization.test.cjs`, `forest-scene.test.cjs`, M5 pipeline test | Frame rate and scene transitions |
| Nonproduction fixture disclosure | M5 disclosure test and app's How it works text | Demo uses only live camera for real results |

Linux/Windows CI quality and review packaging passed on the Issue #19 documentation candidate ([Linux #42313025737](https://github.com/jbrhinalyn/signalscape/actions/runs/42313025737), [Windows #42313025841](https://github.com/jbrhinalyn/signalscape/actions/runs/42313025841)).
Automated success does **not** satisfy the physical-camera items below.

## Physical camera evidence

**Baseline, not new M5 sign-off:** The owner previously reported a Zorin
Linux real-camera Electron session with 1,363 metric packets, breathing and
pulse both observed, 1,510 accepted frames and zero rejected frames. They
also confirmed a Stop measurement / restart / Stop camera / Electron exit
lifecycle with the webcam indicator off, as documented in
[SDK validation](sdk-validation.md) and [camera preview](camera-preview.md).
These observations predate Issue #17 and do not verify all M5 scenarios.

**M5 developer-build status (2026-11-07): 13/13 PASS, owner-reported.**
In [M5 Issue #5](https://github.com/jbrhinalyn/signalscape/issues/5),
the owner attested to all 13 Zorin Linux **developer-build** scenarios,
with 0 failures, 0 blocked cases and 0 errors observed. The private
`.m5-manual-reports/*.json` files, per-scenario timestamps, app commit SHA
and performance measurements were **not independently inspected here**.
The scenario statuses below summarize that aggregate owner attestation;
they do **not** constitute externally verified per-scenario evidence.
The earlier M2 packet/camera session above is separate historical evidence.

For any repeat or new platform/build, use the
[guided Zorin Linux hardware runbook](m5-physical-runbook.md) and
`npm run acceptance:manual -- --mode=developer` while observing the
actual Electron window. The recorder stores human-observed results locally:
it never starts the webcam, reads keys or fabricates SDK readings.

Run on the target packaged app **and** (separately) a developer build with
the optional native SDK installed. Do not use the browser-only page to
claim native SDK success. Capture only checkmarks, counts, sanitized reason
codes and environmental notes: **never** photos/video, face landmarks,
raw frames, SDK key, full traces, identifying camera IDs or biometric
measurements. Obtain consent before enabling preview.

| # | Manual scenario | Expected observable result | Zorin developer build (owner report) |
| --- | --- | --- | --- |
| 1 | Launch, enumerate cameras; no Preview click | Camera/OS indicator stays off; no permission request | PASS* |
| 2 | Deny first Preview permission; retry after allowing | Denied message; no auto-start; second explicit consent can open | PASS* |
| 3 | Preview then revoke permission in OS | Revoked/Unavailable guidance, stream closed, native disarmed, LED off | PASS* |
| 4 | Preview, Start measurement under even light/one face | Live SDK packets, pulse/breathing observations (when available), appropriate warm-up | PASS* |
| 5 | Cover camera, move away, change light or framing | Quality degrades; stale/unreliable values disappear; scene falls back toward neutral; recovery needs fresh samples | PASS* |
| 6 | Unplug USB camera while previewing/measuring | Stop and cleanup, no auto-retry; clear Unavailable/disconnected message and LED off | PASS* |
| 7 | Start, Stop measurement, start again | Preview stays up for Stop measurement; new measurement needs explicit Start | PASS* |
| 8 | Start, Stop camera, Preview again, Start | Camera and native resources released; new consent and Start; no stale values | PASS* |
| 9 | Stop while permission dialog or SDK startup is pending | Late completion cannot reopen video or start measurement | PASS* |
| 10 | Exit Electron while measuring | OS camera indicator off; app exits; no orphan capture process | PASS* |
| 11 | Switch among five forest looks during a live session | Readings/scene remain responsive; no camera ownership change or dropped consent | PASS* |
| 12 | Reduced motion, hidden/minimized window, narrow window, keyboard | Sparkles pause or reduce appropriately; readable status and controls; no overlap | PASS* |
| 13 | 15+ minute continuous capture with normal workload | Record FPS, CPU/GPU, RAM trend and camera/SDK errors; no observed leak or freeze | PASS* |

*PASS = the owner reported 13/13 scenarios passed as a group on the
developer build. These rows are **not independently verified** against the
private recorder output. This does not imply signed installers, SDK-enabled
packages or Windows hardware were tested.*

For each manual run record **date, OS/distro, app commit/PR SHA,
SDK version, packaged/developer build, scenario numbers, pass/fail/blocked,
camera LED result and sanitized observations**. Indicate unavailable
second-camera or OS permission-revocation capabilities as **BLOCKED**,
never PASS. Use a separate row per operating system and for developer versus unsigned packaged build. Generated local reports in `.m5-manual-reports/` are ignored by Git and must be reviewed before sharing. Never treat a `--template` (all NOT_RUN) report as physical evidence.

### Evidence ledger

| Date | Platform / build | Scope | Result | Follow-up |
| --- | --- | --- | --- | --- |
| 2026-11-06 | Zorin Linux, M2 developer workflow | Live packet presence and six owner-reported stop/restart checks | Historical PASS (M2 only) | Separate from M5 sign-off |
| 2026-11-07 | Zorin Linux, M5 developer build | M5 checks 1–13 | 13/13 PASS (owner-attested; private reports not inspected) | Retain private evidence; repeat on exact showcase build if modified |
| 2026-11-07 | Linux packaged AppImage/deb | M5 checks 1–13 | NOT RUN | SDK-free packages cannot demonstrate native measurement |
| 2026-11-07 | Windows packaged installer | M5 checks 1–13 | NOT RUN | Needs Windows packaging and test machine |

## Release blockers

| Priority | Blocker | Disposition / owner action |
| --- | --- | --- |
| **P0** | Shared API key is only supplied from a developer environment | **OPEN:** choose and review production-safe credential/token model; review installers now explicitly disable SDK measurement; see [Issue #24 release readiness](release-readiness.md) |
| **P0** | Native SmartSpectra 3.4.0 runtime is not bundled in AppImage/deb | **OPEN:** vendor licensing/redistribution permission and clean-machine SDK-enabled packaging; Issue #18 covers unsigned SDK-free review packaging only; see [Issue #24](release-readiness.md) |
| **P0** | SDK-enabled packaged-build physical acceptance not performed | **OPEN:** developer 13/13 is owner-reported, not verified on an SDK-enabled clean installer; retain private per-scenario evidence and test any approved distribution build |
| **P1** | Windows installer, permissions, camera path and test evidence | **OPEN:** unsigned packaging CI passes (#18 closed); still needs manual Windows hardware/installer UI evidence |
| **P1** | Provider authentication network path, disclosures and offline behavior | **OPEN:** privacy docs updated (#19 closed); independent provider network behavior verification remains |
| **P1** | Independently reviewed long-session performance, reduced-motion and five-look evidence | **OPEN:** developer scenarios 11–13 owner-reported PASS; detailed quantitative data not independently reviewed and packaged/Windows behavior untested |
| **P2** | Color looks #2–#5 reuse the approved forest artwork | **DOCUMENTED:** color grades, not distinct compositions; follow-up Issue #37 |

**Release decision: NO-GO for SDK-enabled public distribution.**
The owner-reported developer 13/13 PASS establishes the stated developer
acceptance milestone, **not** production credentials, native SDK
redistribution approval, signed packages or clean-machine measurement.
P0 release gates and applicable P1 platform checks remain open under
[Issue #24](release-readiness.md); CI and the developer acceptance report
cannot override them. Keep M5 parent Issue #5 open for release readiness.

## Verification links

- [M5 parent milestone #5](https://github.com/jbrhinalyn/signalscape/issues/5)
- [Issue #17](https://github.com/jbrhinalyn/signalscape/issues/17)
- [Packaging Issue #18](https://github.com/jbrhinalyn/signalscape/issues/18)
- [Documentation Issue #19](https://github.com/jbrhinalyn/signalscape/issues/19)
- [Guided physical acceptance runbook](m5-physical-runbook.md)
- [Existing physical SDK evidence](sdk-validation.md)
- [Camera setup and permission behavior](camera-preview.md)
