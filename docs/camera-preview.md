# M2 consented live camera preview (development-only)

SignalScape now offers a **local, single-camera preview** in Electron with an explicit
two-step flow: **Preview camera** (grants video-only permission) and
**Start measurement** (starts the SmartSpectra custom-input pipeline). A
persistent **Stop camera** button releases the browser stream and SDK
resources. **Stop measurement** stops just native measurement and keeps
the preview visible for positioning.

## Why this implementation

Presage's Electron reference uses `streamAvailable` from the renderer SDK
and passes the API key to the renderer constructor. SignalScape deliberately
**does not** do that. Instead:

1. Electron starts with camera permission denied. A validated IPC request from
   the trusted app frame arms video-only permission when the user clicks
   **Preview camera**.
2. The Angular renderer calls `getUserMedia({ video: ..., audio: false })`
   **once**, displays its local MediaStream in a video element, and samples
   it into an in-memory 640×480 RGBA canvas at up to 30 fps.
3. The sandboxed preload sends only validated transient frame bytes on a fixed
   `signalscape:camera-frame` channel. The main process revalidates origin,
   dimensions, byte count, authorization and monotonic timestamps; the native
   SmartSpectra session consumes the frame via `useCustomInput()` /
   `sendFrame()`. No second camera is opened.
4. The API key is read only from the Electron **main process environment**;
   it is never returned through IPC or bundled into Angular. SDK aggregate
   telemetry is disabled. Main emits bounded state, validation codes,
   packet-count/metric-presence flags **and validated numeric pulse/breathing
   rates** for the UI and forest; raw frames, full SDK metric packets and
   face landmarks never return to Angular.
5. Stop and app close release the stream, disarm permission and await native
   SDK `destroy()` best-effort. An SDK error does not silently restart camera
   capture. The camera LED remains the authoritative OS indication.

This is a development test tool for diagnosing the SDK's intermittent
`Starting` state. It is **not** a shipped production camera integration or
clinical measurement feature. Frame IPC is transient and local to the
Electron process, but native SDK authentication may contact Presage servers.

## Local setup on Zorin / Linux

The SDK remains a *temporary native dependency* for this spike. Run from the current main or review-feature checkout on your development machine:

~~~sh
git fetch origin
git switch main
git pull --ff-only
nvm install
nvm use
npm ci
npm install --no-save --package-lock=false --ignore-scripts @smartspectra/node-sdk@3.4.0
read -rs -p 'Presage API key: ' SMARTSPECTRA_API_KEY; echo
export SMARTSPECTRA_API_KEY
npm run dev
~~~

Open the **Electron window**, not the browser-only Angular preview.
Click **Preview camera**, grant camera permission, center your face and
upper chest, then click **Start measurement**. Stop measurement or camera
from the window controls. After exiting the app, clear the key with
`unset SMARTSPECTRA_API_KEY`.

If you only want to position your camera, you can use Preview without
installing the SDK or configuring an API key. The app displays a clear
`sdk-unavailable` or `api-key-not-configured` message if measurements
cannot start.

### Privacy and security guarantees / limits

- No automatic camera access, microphone, recording or upload of frames.
- The renderer is sandboxed; no Node/Electron objects or SDK key are exposed.
- IPC only accepts frames from the trusted top-level frame, when permission
  is armed, at one fixed 640×480 RGBA size with strictly increasing time.
- Only validated rate estimates, status/quality codes, packet counts and presence flags return to Angular; no raw frames, full SDK packets, face landmarks or API key are exposed.
- Closing the window stops the camera even if native SDK teardown fails.
- This prototype uses a local environment key, **not** a solution for safe
  production distribution. Do not package or distribute a shared API key.
- Electron packages created by existing CI do **not** bundle the optional
  SmartSpectra native runtime. Production native closure, licensing and
  key delivery remain future work.

## Troubleshooting

- **No preview:** confirm webcam works in the OS camera utility, close it
  fully, check system webcam/privacy permission, then click Preview.
- **Preview works, SDK stays Starting:** position one face and upper chest
  within the guide, keep lighting even, and check the validation guidance.
  If it persists, capture sanitized status codes and contact Presage.
- **No native SDK:** re-run the temporary SDK install above after `npm ci`.
- **Browser-only view:** native IPC and camera permission controls are
  intentionally unavailable outside the Electron window.

## References

- [Official Node/Electron integration](https://smartspectra.presagetech.com/docs/nodejs)
- [Custom-input API and PixelFormat](https://smartspectra.presagetech.com/docs/nodejs/api-reference)
- [Privacy](privacy.md)
- [IPC security contract](ipc-security.md)

## Camera selection, denial and revocation (Issue #10)

The app discovers video inputs without activating the camera. **System default**
is always available in the selector; camera names may be hidden by the operating
system until permission is granted. **Refresh cameras** re-enumerates inputs
without capturing video. Choosing a camera while the preview is off does not
request access. **Preview camera · Allow access** is the explicit, video-only
consent action.

While previewing, choose another input and click **Switch camera**. SignalScape
stops measurement and the current MediaStream, disarms native capture, and
then requests the chosen video device. **Measurement never restarts automatically**
after switching. If the selected input vanishes, the app clears the selection
and explains that the device is unavailable.

The status panel differentiates **Not requested**, **Requesting access**,
**Allowed for preview**, **Denied**, **Revoked**, **Busy**, **Unavailable**, and
**Released**. These are app/session states, not an assertion that system-wide
permissions have been permanently changed. Some Electron/Linux configurations
do not support the browser Permissions API; active stream loss and device-list
changes still trigger cleanup. Stop camera remains clickable even while a
permission prompt or camera open is pending: a delayed stream is immediately
closed instead of resurrecting a canceled preview.

### Manual resilience checks on physical hardware

1. Launch Electron and verify the camera indicator is off and the list/refresh
   action does not illuminate the webcam.
2. Select a second camera, if available. Click **Preview camera · Allow access**
   and verify the selected input opens; use **System default** when unsure.
3. Deny the permission request (or block it through system settings). Verify
   the status says Denied and offers an actionable retry. Re-enable access and
   click Preview again; no automatic retry occurs.
4. Start a measurement, change inputs, and click **Switch camera**. The old
   stream must stop, the preview should reopen on the new camera, and
   measurement must remain off until explicitly started.
5. Unplug the active external camera or revoke camera permission. Verify the
   video closes and the interface reports an unavailable/revoked state.
6. Start opening a camera and immediately click **Stop camera**. Verify no
   delayed permission result reopens the webcam. Reopen only by clicking
   Preview again.

CI tests mock these scenarios, but an actual Linux webcam and OS permissions
are needed to verify device labels, hot-unplug and LED behavior.

## M2 preview-to-SDK measurement verification (Issue #9)

The owner has verified the local webcam preview on Zorin Linux. The next
acceptance step is to determine whether the **same consented browser video
stream** reaches the native SDK through the bounded custom-input IPC path
and produces any metric packets.

The SmartSpectra panel now distinguishes:

| UI reading | Meaning |
| --- | --- |
| Frames received by SDK bridge | Input frames passed the main-process size, sender, rate, and timestamp gates |
| Frames accepted by SDK | `sendFrame()` returned `true` |
| Rejected frames | `sendFrame()` returned `false` or threw; the error text is discarded |
| Frames forwarded through SDK | Confirmed by the optional native `frameSentThrough` callback |
| Metric packets | SDK actually emitted `metrics` events |
| Breathing / Pulse observed | Decoded positive measurement fields were present; values remain private |

All counters are aggregate non-sensitive integers, reset on each new
measurement, sent at most once per second (plus final snapshot at stop).
**Accepted frames are not equivalent to successful measurement.** One can
have many accepted frames without metrics if framing or SDK readiness is
insufficient. Raw pixel data, individual timestamps, and vital values are
never included in the events or log messages.

The status message is now synchronized with starting, receiving frames,
measurement stopping and native teardown. **Stop measurement** clears the
live-frame timer and leaves the preview on. **Stop camera** stops all local
MediaStream tracks and removes the video source *before awaiting native SDK
cleanup*, so a slow or failed SDK shutdown cannot leave the webcam active.
The native session still requires successful physical-device verification.

### Owner acceptance checks

1. Start SignalScape in Electron from the feature branch with the optional
   SDK installed and key configured **only** in the local main-process
   environment. Use the private key prompt documented above.
2. Click **Preview camera**; verify you can see yourself and the camera-on
   indicator. Center one face and the upper chest in even lighting.
3. Click **Start measurement** (explicit consent). Observe **Frames received**,
   **Frames accepted**, and **Frames forwarded** counters. Non-zero counts
   demonstrate delivery stages; only **Metric packets > 0** demonstrates
   SDK measurement output. Do not share the video image or private key.
4. Click **Stop measurement** and confirm the button returns to **Start
   measurement**, the message reads **Measurement stopped**, and the preview
   remains available. Start another measurement only if the SDK cleaned up.
5. Click **Stop camera**. The video disappears, camera indicator turns off,
   and the webcam/device indicator should turn off. The screen should report
   **Camera stopped**. Reopen the preview to verify resources were released.
6. Share only these aggregate counters, SDK state and validation numbers if
   measurement packets remain at zero. If the SDK accepts frames but produces
   no metrics, investigate validation/lighting/SDK readiness instead of
   changing API key distribution or disabling the sandbox.

A CI virtual-display smoke launch cannot verify physical camera hardware.
See the [M5 real-camera demonstration workflow](demo.md) for current live-rate acceptance and the distinction from nonproduction synthetic tests.
**Physical-device acceptance confirmed (2026-11-06):** On Zorin Linux, the owner observed 1,363 SDK metric packets, both breathing and pulse present, 1,510 accepted frames (0 rejected), and confirmed Stop measurement, Stop camera, and reopen/restart work. This verifies the development prototype, not the medical accuracy of the readings or release-ready packaging. Production credential delivery and native redistribution/licensing remain separate prerequisites.

Presage SDK API reference: https://smartspectra.presagetech.com/docs/nodejs/api-reference


## M2 SDK failure containment and recovery (Issue #11)

A failed **Start measurement** is now treated as a failed camera session, not as
a preview-only state. Whether the failure is a missing development key, absent
native SDK, a thrown native start, a synchronous SDK error, or a later
`processingStatus: error` / SDK error callback, Angular immediately stops
all browser camera tracks and clears the video element **before** awaiting
Electron IPC or native cleanup. Permission is disarmed and **Preview camera**
must be explicitly selected again before retrying. Normal user-requested
**Stop measurement** still leaves preview on; failure cleanup is different.

The main-process bridge suppresses stale callbacks from dead sessions, stops
native frame acceptance upon fatal SDK errors, and calls `destroy()` exactly
once per active teardown attempt. It prevents a second SDK allocation while
teardown is pending. If native `destroy()` fails, that instance remains
quarantined; the UI warns that native cleanup failed and advises restarting
the app. The bridge may retry teardown when explicitly disarmed but does
not declare the failure successful or silently create another instance.
Closing the app also disarms the SDK and attempts native cleanup, with a
five-second cap so a hung native teardown cannot block the process from
exiting indefinitely. The OS/Chromium camera stream closes with the window.

### Negative-path verification matrix

| Failure / interruption | Expected result |
| --- | --- |
| API key absent or SDK package missing | No metric session; webcam turns off; actionable setup message; explicit preview needed for retry |
| `useCustomInput()` or `start()` throws | Allocated SDK instance is disposed; no new instance until cleanup completes |
| Error/status emitted synchronously from `start()` | Start returns failure, never a false success; SDK cleanup begins |
| Error callback or frame exception after startup | Frame submission stops; browser camera closes; late callbacks from old SDK are ignored |
| Native `destroy()` fails | Error reported, no false `stopped` status or new SDK allocation; restart app if cleanup cannot complete |
| Stop camera while startup response is pending | Pending response is ignored; no delayed frame timer or camera resurrection |
| App quit while SDK is active | Camera window closes and bridge disarms; native destroy is awaited best-effort with bounded exit |

Run `npm run quality` and `npm test` for automated contract and mocked
negative-path coverage. Those tests **cannot** verify that a physical webcam
LED turns off under every native SDK failure. On the owner's Linux machine,
also test missing-key failure, successful measurement followed by Stop,
and interruption while starting; verify the device indicator turns off on
failed starts and Stop camera. Do not deliberately expose private
credentials, real vital signs, or camera images when sharing test results.
The previously verified 1,363 metric packets prove the successful path on
the earlier build, not the new negative paths in this change.

Production key distribution and native redistributable packaging remain
out of scope here (Issue #24).
