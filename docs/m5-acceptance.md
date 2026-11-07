# M5 acceptance: offline automation and physical-camera checklist (Issue #17)

**Status: IN PROGRESS — not release-approved.** This file separates repeatable
automated tests from hardware observations. CI is a headless, camera-free
verification; it is **not** evidence that a physical camera works or that the
SmartSpectra SDK is distributable.

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

**M5 status (2026-11-07): PENDING physical re-test.** Linux and Windows CI passed, but no current M5 physical-camera results are recorded. Use the [guided Zorin Linux hardware runbook](m5-physical-runbook.md) and `npm run acceptance:manual -- --mode=developer` while testing the actual Electron window. This recorder only captures human-observed results: it never starts the webcam, reads secret keys or fabricates SDK readings.

Run on the target packaged app **and** (separately) a developer build with
the optional native SDK installed. Do not use the browser-only page to
claim native SDK success. Capture only checkmarks, counts, sanitized reason
codes and environmental notes: **never** photos/video, face landmarks,
raw frames, SDK key, full traces, identifying camera IDs or biometric
measurements. Obtain consent before enabling preview.

| # | Manual scenario | Expected observable result | Status |
| --- | --- | --- | --- |
| 1 | Launch, enumerate cameras; no Preview click | Camera/OS indicator stays off; no permission request | PENDING |
| 2 | Deny first Preview permission; retry after allowing | Denied message; no auto-start; second explicit consent can open | PENDING |
| 3 | Preview then revoke permission in OS | Revoked/Unavailable guidance, stream closed, native disarmed, LED off | PENDING |
| 4 | Preview, Start measurement under even light/one face | Live SDK packets, pulse/breathing observations (when available), appropriate warm-up | PENDING |
| 5 | Cover camera, move away, change light or framing | Quality degrades; stale/unreliable values disappear; scene falls back toward neutral; recovery needs fresh samples | PENDING |
| 6 | Unplug USB camera while previewing/measuring | Stop and cleanup, no auto-retry; clear Unavailable/disconnected message and LED off | PENDING |
| 7 | Start, Stop measurement, start again | Preview stays up for Stop measurement; new measurement needs explicit Start | PENDING |
| 8 | Start, Stop camera, Preview again, Start | Camera and native resources released; new consent and Start; no stale values | PENDING |
| 9 | Stop while permission dialog or SDK startup is pending | Late completion cannot reopen video or start measurement | PENDING |
| 10 | Exit Electron while measuring | OS camera indicator off; app exits; no orphan capture process | PENDING |
| 11 | Switch among five forest looks during a live session | Readings/scene remain responsive; no camera ownership change or dropped consent | PENDING |
| 12 | Reduced motion, hidden/minimized window, narrow window, keyboard | Sparkles pause or reduce appropriately; readable status and controls; no overlap | PENDING |
| 13 | 15+ minute continuous capture with normal workload | Record FPS, CPU/GPU, RAM trend and camera/SDK errors; no observed leak or freeze | PENDING |

For each manual run record **date, OS/distro, app commit/PR SHA,
SDK version, packaged/developer build, scenario numbers, pass/fail/blocked,
camera LED result and sanitized observations**. Indicate unavailable
second-camera or OS permission-revocation capabilities as **BLOCKED**,
never PASS. Use a separate row per operating system and for developer versus unsigned packaged build. Generated local reports in `.m5-manual-reports/` are ignored by Git and must be reviewed before sharing. Never treat a `--template` (all NOT_RUN) report as physical evidence.

### Evidence ledger

| Date | Platform / build | Scope | Result | Follow-up |
| --- | --- | --- | --- | --- |
| 2026-11-06 | Zorin Linux, M2 developer workflow | Live packet presence and six owner-reported stop/restart checks | Historical PASS (M2 only) | Repeat full M5 matrix |
| 2026-11-07 | Linux packaged AppImage/deb | M5 checks 1–13 | NOT RUN | Test after CI candidate |
| 2026-11-07 | Windows packaged installer | M5 checks 1–13 | NOT RUN | Needs Windows packaging and test machine |

## Release blockers

| Priority | Blocker | Disposition / owner action |
| --- | --- | --- |
| **P0** | Shared API key is only supplied from a developer environment | **OPEN:** choose and review production-safe credential/token model; review installers now explicitly disable SDK measurement; see [Issue #24 release readiness](release-readiness.md) |
| **P0** | Native SmartSpectra 3.4.0 runtime is not bundled in AppImage/deb | **OPEN:** vendor licensing/redistribution permission and clean-machine SDK-enabled packaging; Issue #18 covers unsigned SDK-free review packaging only; see [Issue #24](release-readiness.md) |
| **P0** | Physical M5 camera, cleanup and quality matrix not re-run | **OPEN:** obtain run-by-run real hardware evidence before release |
| **P1** | Windows installer, permissions, camera path and test evidence | **OPEN:** unsigned packaging CI passes (#18 closed); still needs manual Windows hardware/installer UI evidence |
| **P1** | Provider authentication network path, disclosures and offline behavior | **OPEN:** privacy docs updated (#19 closed); independent provider network behavior verification remains |
| **P1** | Long-session performance, reduced-motion and multiple looks | **OPEN:** complete checks 11–13 and track regressions |
| **P2** | Color looks #2–#5 reuse the approved forest artwork | **DOCUMENTED:** color grades, not distinct compositions; follow-up Issue #37 |

**Release decision: NO-GO** until P0 items pass and applicable P1 items
are tested or formally dispositioned. A successful headless Linux CI job
does not override these gates. Do not close M5 parent Issue #5 merely
because Issue #17's code/tests are merged.

## Verification links

- [M5 parent milestone #5](https://github.com/jbrhinalyn/signalscape/issues/5)
- [Issue #17](https://github.com/jbrhinalyn/signalscape/issues/17)
- [Packaging Issue #18](https://github.com/jbrhinalyn/signalscape/issues/18)
- [Documentation Issue #19](https://github.com/jbrhinalyn/signalscape/issues/19)
- [Guided physical acceptance runbook](m5-physical-runbook.md)
- [Existing physical SDK evidence](sdk-validation.md)
- [Camera setup and permission behavior](camera-preview.md)
