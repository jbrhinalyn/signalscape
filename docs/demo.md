# M5 real-camera demo and reproducible setup (Issue #19)

**Purpose:** show real, opt-in SmartSpectra SDK measurements driving SignalScape's forest. This is an experimental wellness visualization, **not medical measurement, diagnosis, treatment, monitoring or emergency response**.

**Status:** developer demo only; not approved for public distribution. The SDK and API key are **not** in clean installs or review packages. A developer must install the optional native SDK privately. Linux/Zorin camera success was previously owner-reported; repeat the checks on the actual demo build. CI uses **NONPRODUCTION SYNTHETIC TEST DATA**, and cannot validate real camera readings.

## 1. Fresh-machine prerequisites

- A supported x64 Linux desktop with a graphical session (Zorin Linux / Ubuntu 24.04-compatible), camera and working OS permissions. Native SDK Linux needs glibc 2.35 or later. Close conferencing and other camera apps. Network connectivity is needed for SDK authentication/session authorization.
- Git, Node **24.15.0**, npm **11+** and a Node version manager such as nvm. Standard Electron/Chromium Linux dependencies (GTK3, NSS, ALSA) must be available. For Windows x64, use matching Node/npm and the packaging guide; live SDK/camera acceptance on Windows is **not yet verified**.
- A **private, valid Presage developer API key** from an authorized developer account; do not hard-code, commit, record or share it. Anyone shown on camera must consent.

On a new Linux clone:

~~~bash
git clone https://github.com/jbrhinalyn/signalscape.git
cd signalscape
nvm install
nvm use
npm ci
npm run quality
npm run test:acceptance
~~~

If the source is checked out to a review feature branch, use the PR's exact branch/commit before starting. `npm ci` uses the committed lockfile and is repeatable, but installs **no SmartSpectra SDK**. Running `npm run dev` at this point is a valid **camera preview only** demonstration; Start measurement will fail with an SDK-setup message.

For a **live SDK** developer test, add the pinned optional SDK after the clean install:

~~~bash
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
npm run spike:sdk -- --probe
~~~

The probe confirms native load only; it does not test camera permission, authenticated measurement or values. The temporary installation is not committed to the lockfile and must be repeated after another `npm ci`.

## 2. Launch with a private key

On the Linux developer machine:

~~~bash
read -rs -p 'Presage API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run dev
# After Electron exits:
unset SMARTSPECTRA_API_KEY
~~~

The shell prompt does not echo the key or embed it in command-history arguments. The process environment is still only a **developer-test** secret delivery mechanism, not a secure end-user credential design. Never put the key in a command-line argument, Angular build, `.env.example`, screenshots, release archives or issue comments.

Open the **Electron window**, not the browser at localhost:4200. The browser-only preview has no native IPC/SDK and cannot prove measurements. The Electron window should start with Camera **off** and no permission prompt.

## 3. Script for an authentic live demonstration

1. Explain the consent and privacy limitations from [privacy.md](privacy.md); confirm all people visible agree. Show that the camera indicator is off on launch and the forest is neutral.
2. Open **Camera setup**, select **System default** or another available video input and choose **Preview camera · Allow access**. Grant video-only permission if prompted. Confirm the actual live self-preview and OS camera indicator. Preview alone does **not** measure.
3. Center **one consenting person** and their upper chest in even light, with minimal movement. Choose **Start measurement** separately. Watch **Frames received by SDK bridge**, **Frames accepted by SDK** and **Frames forwarded through SDK**. These counters only confirm capture/delivery; they do **not** prove rates.
4. Wait through warm-up and observe the **Metric packets** counter become nonzero. Confirm the **Breathing signal / Pulse signal** observed indicators and the separate **Validated readings** or Pulse/Breathing cards become available when framing, confidence, stability and freshness checks permit. One rate may arrive before the other; blank/Not ready is correct when data is unreliable. Never invent numbers if readings are absent.
5. Demonstrate the forest's response while real readings are present. The water glow/fireflies can follow validated pulse; gentle movement can respond to validated breathing. The colored rhythm curves are **illustrative animations derived from rate estimates, not measured SDK waveforms**. Scene motion alone is **not** evidence of biometric accuracy.
6. Demonstrate a normal change in framing or an unavailable signal; stale/low-quality values must disappear and the scene return toward neutral. Do not intentionally endanger or strain the participant to change their measurements.
7. Click **Stop measurement**: readouts cease updating and preview stays visible. Click **Stop camera**: video disappears and webcam indicator turns off. Optionally repeat Preview + Start to show a fresh, explicitly consented session. Exit Electron and confirm the OS indicator is off.
8. Record only sanitized **pass/fail**, build SHA, OS, SDK version, observed/nonzero metric packet counter, quality/readiness states, and camera indicator off. Do not publish identifying webcam imagery, real health readings, API key, device IDs or native traces.

**Evidence standards:** A healthy preview, frame counter, or animated forest does **not** prove that real SDK metric samples were produced. Success requires actual native SDK metric packets **and** quality-gated live pulse or breathing readings in the Electron UI; record which signals were actually observed, without posting numeric values. If absent, mark the demo as **BLOCKED/FAIL** and show troubleshooting, **never** substitute the tests' fabricated readings.

## 4. Common troubleshooting and recovery

| Symptom | Verify / action |
| --- | --- |
| **Preview camera · Allow access** is visible, camera off | Expected before opt-in; choose Preview and grant video permission |
| No camera preview / Busy / Denied | Confirm OS camera access, close other camera applications; retry **manually**, optionally choose System default / Refresh cameras |
| Camera preview works, Start measurement reports SDK unavailable | `npm ci` did not install the native SDK; install pinned 3.4.0 in the same developer workspace and restart Electron |
| API key not configured / auth fails | Check the **local Electron main-process** environment key and an active Presage account; do not paste the key into chat/logs |
| Frames accepted but **Metric packets = 0** | Frame delivery is not SDK measurement; check lighting, one centered face and chest, validation guidance and SDK status; wait through initialization |
| Metric packets nonzero, readings **Not ready** | Warm-up, confidence, stability, framing and freshness are independent quality gates; do not present withheld rates as success |
| Network/offline failure | Provider authentication requires connectivity; `enableTelemetry: false` does **not** make SDK authentication offline |
| Camera unplugged/revoked, SDK error, teardown failure | Capture should fail closed. Retry only with explicit Preview; restart Electron if native cleanup fails, never force a hidden restart |
| Browser at localhost instead of Electron | Browser-only Angular view cannot access trusted native integration |

Do not circumvent Electron sandbox or permission policy to fix demo setup. See [camera/SDK debugging](camera-preview.md) and [native SDK validation](sdk-validation.md).

## 5. Evidence ledger and acceptance

Complete the [M5 physical-camera checklist](m5-acceptance.md) **on each target platform**. The Linux happy-path demo is **not** a substitute for the 13-scenario permission, lifecycle, long-session, accessibility and packaged-build matrix.

| Field | Record privately |
| --- | --- |
| Date, OS, architecture | (fill in) |
| Commit SHA and app mode | (fill in) |
| SDK version and authenticated network | (fill in; **never** the key) |
| Camera opt-in and OS indicator result | PASS / FAIL / BLOCKED |
| Native metric packets and signal(s) observed | Nonzero / zero; pulse / breathing / none |
| Fresh, quality-gated readout(s) shown | Pulse / breathing / both / none |
| Scene neutral fallback and stop/restart | PASS / FAIL / BLOCKED |
| Hardware/packaging exceptions | Sanitized notes only |

**Do not use** fake SDK packets, fabricated pulse/breathing values, screen mockups or prerecorded camera imagery as evidence of a real-camera session. The repo tests deliberately use **NONPRODUCTION SYNTHETIC TEST DATA** and are labeled accordingly. Live metrics are not a clinical accuracy assessment.

Before public release: obtain Presage licensing/redistribution approval, complete secure credential delivery, verify third-party network behavior/privacy, package the native SDK, sign builds, and finish M5 physical acceptance. See [packaging](packaging.md), [privacy](privacy.md) and [M5 acceptance](m5-acceptance.md).
