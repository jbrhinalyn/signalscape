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
   telemetry is disabled. Main emits bounded state, validation codes, and
   packet-count/metric-presence flags, never physiological values or images.
5. Stop and app close release the stream, disarm permission and await native
   SDK `destroy()` best-effort. An SDK error does not silently restart camera
   capture. The camera LED remains the authoritative OS indication.

This is a development test tool for diagnosing the SDK's intermittent
`Starting` state. It is **not** a shipped production camera integration or
clinical measurement feature. Frame IPC is transient and local to the
Electron process, but native SDK authentication may contact Presage servers.

## Local setup on Zorin / Linux

The SDK remains a *temporary native dependency* for this spike. Run from
the feature branch on your development machine:

~~~sh
git fetch origin
git switch feat/m2-smartspectra-native-spike
git pull --ff-only
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
- Only status codes, packet counts and presence flags return to Angular.
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
