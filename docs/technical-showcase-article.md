# SignalScape: Turning Camera-Derived Signals into a Living Forest

*A standalone engineering showcase inspired by the possibilities of the Presage SmartSpectra SDK. This article describes a prototype, not an entry or claim of eligibility for any competition.*

## What I Built

I built **SignalScape**, an experimental desktop experience where a virtual forest reacts to live, camera-derived pulse and breathing estimates. Rather than presenting those estimates as a health dashboard, I wanted to make human signals feel like part of a living landscape.

The project combines **Angular, TypeScript, Electron, Three.js, and Presage SmartSpectra Node SDK 3.4.0**. The visuals feature an illustrated forest with atmospheric lighting, fireflies and water effects, selectable background looks, and a reduced-motion option.

Two choices shaped the experience from the beginning:

- **Consent is explicit.** Opening the application does not turn on the camera. Preview and measurement are separate user actions.
- **Unreliable data is not turned into certainty.** Missing, stale, unstable or otherwise invalid estimates are withheld. The forest can remain calm without active measurements.

This is creative visualization, **not a medical device**, diagnosis, treatment, monitoring, or emergency-response tool.

## Demo

**Watch the SignalScape desktop recording:** [SignalScape — Turning Live SmartSpectra Signals into an Interactive Forest](https://share.zight.com/01a1b6e3-7a47-7080-8098-3c279ee75aba)

The **3 minute 32 second** Zight video shows the desktop interface, the opt-in webcam workflow, pulse and breathing estimates appearing on screen when available, visual backgrounds, quality-status changes and session shutdown.

The video intentionally shows the developer's own webcam and numeric estimates with their consent. The separate **Showcase privacy** switch can mask the camera preview and numeric readings in future recordings. The video does **not** display the **Session details** packet counter throughout, so I do not treat the screen recording alone as independent verification of every native SDK event or any physiological accuracy.

A live desktop demonstration requires the **unpackaged developer build** with the privately installed, authenticated SDK. The downloadable review installers are intentionally **SDK-free** and cannot perform native measurements.

## Code

The source is public: **[jbrhinalyn/signalscape on GitHub](https://github.com/jbrhinalyn/signalscape)**.

To get the interface running locally:

```bash
git clone https://github.com/jbrhinalyn/signalscape.git
cd signalscape
nvm install
nvm use
npm ci
npm run dev
```

Open the **Electron window**. A clean `npm ci` intentionally excludes the proprietary native SmartSpectra SDK and developer credentials, so these steps show the interface and local camera preview, **not** authenticated live measurement.

For a real authorized developer session, use the repository's [SDK and camera setup guide](https://github.com/jbrhinalyn/signalscape/blob/main/docs/demo.md). It covers the optional pinned SDK, private key configuration, quality checks and live verification without committing a key.

Other useful references: [architecture](https://github.com/jbrhinalyn/signalscape/blob/main/docs/architecture.md), [privacy and data flow](https://github.com/jbrhinalyn/signalscape/blob/main/docs/privacy.md), and [release boundaries](https://github.com/jbrhinalyn/signalscape/blob/main/docs/release-readiness.md).

## How It Responds to Human Signals

SignalScape currently uses **pulse rate** and **breathing rate**, not HRV or expression recognition. The main flow is:

1. The person chooses **Preview camera · Allow access**, granting local video-only access. No microphone is requested.
2. **Start measurement** is a second explicit action. The Electron renderer captures bounded video frames and sends them through a constrained, typed IPC bridge to the main process.
3. The main process supplies those frames to SmartSpectra's custom-input interface. It decodes SDK events, adapts the rate estimates into a narrow data contract and returns sanitized events to the renderer.
4. A signal-quality state machine checks framing status, warm-up, numeric validity, confidence, stability and freshness. The UI shows a reading only while it passes these gates.
5. Only approved, fresh estimates feed the visualization engine. **Pulse** can influence water illumination and firefly glow; **breathing** can influence gentle movement. The decorative rhythm curves are animations based on rate estimates, **not sampled physiological waveforms**.

The distinction between *frames received* and *metric packets produced* matters. Receiving camera frames proves data transport, not successful SDK measurement. SignalScape exposes separate counters in **Session details** so a tester can check this boundary. Likewise, an attractive animated forest is not proof of measurement accuracy.

The forest still works as a visual experience when measurement is unavailable. Its ambient animation is separate from signal-driven effects, and reduced-motion settings remain available.

## Design Choices and Trade-offs

One surprisingly important UX decision was making **Stop measurement** different from **Stop camera**. Stopping the SDK leaves the already-consented local preview running; stopping the camera releases the video tracks. Camera errors, permission loss, device disconnection and app exit also have explicit cleanup paths.

I added a manual **Showcase privacy** control for demonstrations. It overlays an opaque cover on the in-app video and hides numeric rates without altering measurement, consent or forest state. It is not a recorder, does not hide other desktop windows, and cannot substitute for reviewing the finished video.

The app is also intentionally conservative about packaging. Native SDK redistribution permissions, production credential handling, signed releases and physical-camera testing of SDK-enabled installers have **not** been established. Review installers therefore disable native measurement. A private developer key must **never** be embedded in a public Electron package.

## Consent and Data Handling

Camera privacy is part of the interaction design rather than a last-minute dialog:

- **Collection and consent:** Camera access starts Off. The user explicitly previews the camera, then separately starts measurement. No microphone access is requested. Anyone shown should agree to being recorded or shared.
- **Processing and sharing:** SignalScape application code keeps the video preview local and passes temporary frame bytes through local Electron IPC to the native SDK. The UI receives only narrowed rate, status and aggregate-counter events, not raw SDK packets or the private API key.
- **Storage and retention:** SignalScape has no built-in recording, measurement database, user account, cloud synchronization or application analytics endpoint. Camera frames and current estimates are kept transiently in application memory. Stopping the session releases the camera and clears in-memory measurement state; this does not erase OS or provider-side logs.
- **SDK telemetry and network:** SmartSpectra's optional aggregate session telemetry is explicitly disabled with `enableTelemetry: false` and the SDK log level is set to none. **SDK authentication/session authorization may still contact Presage services**. SignalScape must not be described as fully offline, and the provider's internal behavior has not been independently audited.
- **Optional AI services:** No AI service processes the live camera stream or generates the reported pulse/breathing estimates in SignalScape's application code.
- **External recording:** The Zight demo is a separate, intentionally shared screen recording. Zight's storage, sharing permissions and retention are governed by that service, not by SignalScape's in-memory data policy.
- **Deletion and control:** **Stop camera** stops video capture within SignalScape; closing the desktop app also releases the stream. Users manage any external video recordings with the recording provider. OS camera permissions and third-party logs have separate controls.

These are implementation and boundary disclosures, not claims about the SDK being clinically accurate or independently security-certified.

## What I Learned

The most interesting part was not drawing trees. It was building an honest bridge between an imperfect live sensing pipeline and an inviting interface. A camera can be active before data is useful; packets can arrive before estimates are stable; one signal can be valid while another is unavailable. Those states should be visible, understandable and harmless to the experience.

SignalScape explores a simple idea: **a responsive environment can feel personal without turning sensitive signals into medical conclusions or silently collecting camera data.**

If you're interested in the implementation, see the [source code](https://github.com/jbrhinalyn/signalscape) and [recorded demo](https://share.zight.com/01a1b6e3-7a47-7080-8098-3c279ee75aba).
