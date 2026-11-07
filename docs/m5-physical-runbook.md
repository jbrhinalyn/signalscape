# M5 Zorin Linux physical camera acceptance — guided runbook

**Status: execution pending on the owner's physical Zorin Linux machine.** This
runbook and its recorder do not grant access to the machine or perform the
13 camera tests automatically. A passing CI workflow is not physical-camera
evidence and cannot certify SDK accuracy, camera OS permission behavior or
production release readiness.

SignalScape is an **experimental visualization**, not a medical device. Never
publish personal camera footage, biological rates, API keys, native dumps or
device identifiers as test evidence. Ask everyone in view for consent.

## Step 1: developer build with real SDK

Use a supported Zorin/Ubuntu-compatible x64 host with graphical desktop,
webcam, network connectivity, Node 24.15.0, npm 11+ and private Presage developer
credentials. Run the acceptance-runner branch until the PR merges; after that,
use `main` and capture the exact commit SHA.

~~~bash
git fetch origin
git switch test/m5-zorin-physical-acceptance
git pull --ff-only
nvm install
nvm use
npm ci
npm run quality
npm run test:acceptance
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
npm run spike:sdk -- --probe
~~~

The probe shows that the native library loaded, **not** that real metrics work.
For a live test on this trusted developer machine, enter the developer key
privately. Launch Electron **in terminal A**, not the browser-only renderer:

~~~bash
read -rs -p 'Presage API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run dev
# After closing Electron:
unset SMARTSPECTRA_API_KEY
~~~

Keep terminal A open. Do not export the key in terminal B, screenshots or
GitHub. Do not run measurement without the subject's consent.

## Step 2: observe each scenario and record results

In **terminal B** in the same checkout:

~~~bash
npm run acceptance:manual -- --mode=developer
~~~

The guided recorder displays every scenario and expected behavior. Perform
each action in the Electron window, and then enter one of:

- **PASS**: personally observed the scenario's full expected behavior.
- **FAIL**: observed incorrect behavior, including missing/invalid SDK rates.
- **BLOCKED**: could not perform the check (for example no removable USB
  camera, no OS permission-revocation control, or SDK provider unavailable).
- **NOT RUN**: did not try this test.

The recorder rejects a **PASS** for live SDK scenario #4 without **both**
nonzero real SDK metric packets **and** at least one fresh, quality-gated live
pulse/breathing rate shown in the Electron UI. It refuses PASS for relevant
stop/permission cases unless the user personally confirms the OS webcam
indicator was off. Scenario #13 requires at least 15 minutes of real runtime
and separate private notes of FPS, CPU/GPU and RAM trend.

**Do not fabricate readings or use camera-free synthetic SDK fixtures.** The
app's illustrative rhythm curves and an active preview do not prove real
native rates. SDK aggregate telemetry is opted out, but Presage authentication
still requires network connectivity; see [privacy](privacy.md).

For scenario #13, record FPS when measurable, CPU usage, GPU usage when
supported, memory at start/end, elapsed time and any SDK status/error codes
**locally** using your OS tools (e.g. Zorin System Monitor). Do not gather raw
camera content or invasive system traces. Mark a missing required observation
BLOCKED rather than silently assuming a pass.

The tool writes a **local, private** JSON file under
`.m5-manual-reports/` (ignored by Git, restrictive permissions). It stores
only fixed-choice outcomes, build mode, platform, commit SHA, and the specific
minimum evidence for #4 and #13. It never starts the camera, loads the SDK,
checks your API key, sends network requests, or uploads any report.

To generate an all-NOT_RUN skeleton without claiming a manual test:

~~~bash
npm run acceptance:manual -- --mode=developer --template
~~~

This is only a template, **not** a completed run. An incomplete report is
expected until you personally perform the checks.

## Step 3: separate packaged-app review checks

The **unsigned** Linux AppImage/deb packages deliberately exclude the native
SmartSpectra runtime and API key. They can be used to verify package install,
startup, explicit preview, camera release and GUI behavior, but must **not**
be marked PASS for measurement-dependent SDK scenarios. Mark such cases
BLOCKED and identify the missing SDK as the cause. Do not add a shared key to
the package or bypass Electron's sandbox.

~~~bash
# After the developer test and after closing Electron:
unset SMARTSPECTRA_API_KEY
# Recreate the clean locked dependency tree; remove temporary SDK before packaging.
npm ci
npm run package:linux
npm run package:verify:linux
# Install the .deb or launch the AppImage on this same trusted host.
# Then in terminal B, while testing the packaged application:
npm run acceptance:manual -- --mode=packaged-linux
~~~

For Windows physical acceptance, use the unsigned review installer on a
separate Windows x64 test machine, following [packaging](packaging.md). Record
the physical check results separately:

~~~powershell
npm run acceptance:manual -- --mode=packaged-windows
~~~

Do not mark Windows hardware checks as completed merely because CI
successfully smoke-launched the packaged executable.

## Step 4: report only safe conclusions

The terminal prints `PASS / FAIL / BLOCKED / NOT RUN` counts. Share those
counts, scenario numbers, build mode, commit SHA and sanitized reason
categories in [M5 parent Issue #5](https://github.com/jbrhinalyn/signalscape/issues/5).
Inspect local JSON **before** sharing any part of it. Do not commit the
`.m5-manual-reports/` directory, and do not share camera frames, facial
landmarks, biometric values, secret keys or full SDK logs.

**M5 closure is still blocked**, even if all developer-build scenarios pass,
until production-safe credential issuance, native SDK licensing/bundling,
platform/installer acceptance and signing/distribution decisions are handled.
Neither the runner nor its report sets `releaseApproved: true`.

See the [full M5 matrix](m5-acceptance.md), [real-camera demo](demo.md),
[SDK validation](sdk-validation.md), and [distribution limitations](packaging.md).
