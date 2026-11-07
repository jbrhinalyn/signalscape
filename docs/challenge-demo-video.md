# SignalScape — genuine SmartSpectra showcase video

This is a **recording plan, not a video and not proof of a live run**.
Use the real Electron developer build on the owner's Zorin Linux machine,
with a consenting subject and a privately configured SmartSpectra Node
SDK v3.4.0. Do not label camera-free synthetic fixtures, stock animations,
or prerecorded data as genuine measurements.

## Showcase privacy controls

- Select **Showcase privacy · On** in the top bar **before** starting the
  screen recorder. It is Off by default after each launch.
- While On, SignalScape draws an **opaque cover** over its in-app webcam video,
  replaces available numeric pulse/breathing rates with
  **Hidden for showcase** in both cards and Session details, suppresses the
  illustrative rate-driven rhythm diagrams, and labels selectable cameras
  generically. Signal availability, **Metric packets**, status, quality
  guidance, and forest effects still use real SDK state.
- The mask **does not** stop video acquisition, alter SDK processing, request
  permission, record video, hide other applications, redact OS dialogs, or
  stop external screen capture. Camera and measurement remain separate
  opt-in actions. To frame the camera, use the unmasked local preview **before
  recording**, turn privacy On, then begin external capture.
- **SignalScape itself does not save frames or values.** An external
  recorder does save what appears in its capture region. Use a capture
  source limited to the SignalScape window and review the final video.

## Setup and test capture

1. Follow [the real-camera developer guide](demo.md): `npm ci`,
   quality checks, a privately installed `@smartspectra/node-sdk@3.4.0`,
   authenticated SDK, then `npm run dev`. Use the **Electron window**,
   not the browser tab or unsigned SDK-free review installer. Never expose
   or record the terminal while entering `SMARTSPECTRA_API_KEY`.
2. Obtain consent for webcam use and separately for any external video
   recording, including from anyone who might enter the scene.
3. Close unrelated applications and suppress desktop notifications. Set
   **Showcase privacy · On**. Open the camera and, if needed, position the
   subject with the mask temporarily Off **before** recording, then restore
   the mask On.
4. Use a trusted external screen recorder (e.g. OBS Studio) configured for
   **Electron window capture**, not full-desktop capture. On Wayland,
   confirm the screen-sharing portal actually selects only that window.
   Avoid recording menus or device-selection dialogs outside the app.
5. Make a brief **test recording** and play it back. Check for unmasked
   webcam imagery, physiological numbers, camera names, API keys, terminal
   output, system notifications, other applications and private identifiers.
   If anything sensitive appears, correct the capture source or remove
   that section. Do not publish the test clip.
6. Record the main clip only with the mask On, leaving Session details
   visible while demonstrating the real packet count and observed flags.
   Do not switch privacy Off while recording.

## Suggested 2–3-minute video outline

| Approx. time | Actual UI action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Camera off; neutral forest and design | SignalScape is a local-first experimental visualization, not medical software |
| 0:20–0:40 | Showcase privacy On, then Preview camera · Allow access | Camera and measurement are separately opt-in; the in-app video is hidden from recording |
| 0:40–1:15 | Start measurement; open Session details | Wait for genuine **Metric packets > 0**, observed pulse/breathing flags and available quality-gated signals; frame counters alone are not evidence of measurements |
| 1:15–1:45 | Show subtle forest response; change color look | Pulse can affect water/firefly glow; breathing can affect gentle movement; these are illustrative effects, not sampled medical waveforms |
| 1:45–2:05 | Observe normal degradation/recovery if it happens | Invalid/stale signals are withheld; never invent an outcome or force an unsafe change |
| 2:05–2:30 | Stop measurement, Stop camera, close Electron | Stop measurement leaves preview; Stop camera releases the stream; verify the OS camera indicator is off locally |
| 2:30–2:45 | Title/end card and public GitHub repository | Angular + Electron + TypeScript + Three.js + Presage SmartSpectra |

**Truthfulness standard:** A successful real SDK demo requires actual
nonzero metric packets **and** a fresh quality-gated pulse or breathing
reading observed locally (the showcase UI shows signal availability,
not numeric values). If either is missing, acknowledge that the session
was not ready instead of overlaying or inserting synthetic results.

## Manual recording acceptance checklist

- [ ] SDK v3.4.0 running in an authenticated unpackaged **developer** build.
- [ ] Actual opt-in, signal availability and forest reactions shown.
- [ ] Metric packets are genuinely nonzero when claiming SDK data.
- [ ] Showcase privacy was On for the entire screen recording.
- [ ] No webcam image, numeric vital estimates, device names, tokens, keys,
      SDK debug traces, system notifications or unrelated windows visible.
- [ ] Stop measurement, Stop camera and camera-off state demonstrated.
- [ ] All captured frames and audio checked by a person before publishing.
- [ ] Experimental, non-medical disclaimer and network/authentication caveat
      are accurate and present.
- [ ] Link to final video is added only **after** manual review.

**No video is generated or uploaded by this repository change.** External
recording must be performed by the owner on real hardware. Existing
unpackaged developer testing does not approve shipping an SDK-enabled
installer; public SDK distribution remains **NO-GO** under
[Issue #24](release-readiness.md).
