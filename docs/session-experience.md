# M4 session UX and accessibility — Issue #16

SignalScape provides three explicit, keyboard-accessible stages: **preview and
position**, **start measurement**, then **view available signals**. The three-step
guide and a single polite live readiness region display what is happening without
treating a sensor value as a medical conclusion. The camera never opens merely
because the workspace or 3D forest renders.

## Visual feedback

- **Camera off**: no video or signal measurement; the user must explicitly choose
  Preview camera and allow video-only access.
- **Preview ready**: local video is visible but SDK measurement remains off;
  Start measurement is a separate explicit action.
- **Starting**: measurements are not ready; the user can cancel immediately.
  Cancel measurement closes the camera as a safe fallback if native startup
  has not finished.
- **Warming up**: measurements are withheld pending SDK framing, confidence,
  stability and per-signal warm-up validation.
- **Tracking weak**: hints advise repositioning and lighting without diagnosis.
  Unusable/outdated readings are not displayed or used for effects.
- **Partial signal**: one validated rate is available; the other is explicitly
  shown as not ready. The forest only responds to the validated signal.
- **Both signals available**: quality-gated pulse and breathing estimates may
  affect the forest. These are experimental wellness inputs only.
- **Camera error or permission denied**: descriptive message explains how to
  retry. No automatic re-authorization or restart occurs.
- **Releasing**: the OS video stream is closed synchronously before native SDK
  teardown finishes. Stop camera remains clickable during pending operations.

An unobtrusive overlay on the video preview gives textual **Pulse / Breathing:
Ready or Not ready** indicators. The dark palette uses readable text and borders;
status is never conveyed by color alone. One readiness region announces state
changes politely, while detailed metrics remain available without duplicate
live announcements.

## Stop and race safety

Stop camera is always available when a preview or permission/SDK operation is
active, even when other controls are disabled. A new Stop measurement action
during native **Starting** cancels the operation and releases the camera instead
of calling the normal native stop API on an incompletely started SDK. If Stop
camera occurs during a pending Stop measurement response, the earlier response
cannot overwrite the later stop state or reopen the camera. A failed native
stop triggers full camera release rather than leaving an ambiguous preview.

The OS webcam indicator must be verified on actual hardware. The automated
tests exercise mocked streams, not the physical camera or the native SDK.

## Keyboard and reduced-motion accessibility

- All actions use native buttons and the camera selector uses a labelled
  native select, so Tab and Shift+Tab navigate them and Enter/Space activate
  buttons; visible keyboard focus remains in the CSS.
- The three steps expose current progress with `aria-current="step"`.
- Consent context is linked to preview/start buttons with `aria-describedby`.
- Readiness and errors use a textual `role="status"`, `aria-live="polite"`
  region; the video overlay is decorative for assistive technology.
- The forest motion toggle remains keyboard-operable and announces whether
  animation is paused. Initial preference follows `prefers-reduced-motion`;
  users can override it during the current session. With reduced motion,
  the forest presents static lighting changes, not a running animation.

## Verification

Run `npm ci && npm run quality` on supported Node 24.15+ and npm 11.
Automated tests cover readiness transitions, degraded framing, independent
signal availability, permission errors, stop-while-starting, stop race
priority, and structural accessibility contracts.

Manual Electron acceptance on Linux:

1. Launch from a clean session. The camera must be off; tab through the
   progress/status area, camera selector and Preview button.
2. Click Preview camera and grant access; verify the text says measurement is
   off. Deny or revoke permission and verify a clear actionable error.
3. Start measurement, observe warm-up and **Not ready** overlay labels;
   once a validated signal is available, verify only that signal is marked
   Ready. Obstruct framing and verify **Tracking weak**.
4. Cancel during SDK start and verify the webcam indicator turns off. Start
   again; test Stop measurement (preview remains active), then Stop camera.
5. Stop camera while a slow startup or stop is pending; make sure no
   delayed response changes the stopped UI or reopens the camera.
6. Use keyboard only for every active action; verify focus visibility on
   dark panels and a readable layout in a narrow window.
7. Enable OS reduced motion and restart: the forest starts static. Override
   using the motion toggle; verify the label and resumed/paused motion.
8. Confirm the UI never claims medical accuracy, diagnosis, or healthy/
   unhealthy status. Review the webcam LED and SDK lifecycle on hardware.

This change does not alter the native SDK contract, store biometric data, or
enable camera access without explicit permission.
