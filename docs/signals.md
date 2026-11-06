# M3 signal data contract and quality gate (Issue #12)

SignalScape uses SmartSpectra's pulse and breathing **rate estimates** as
experimental generative-art inputs. They are not diagnostic measurements.
This document describes the event boundary and deterministic quality machine
from Issue #12. The separate [visualization engine](visualization.md) (Issue #13)
projects approved rates into unitless scene controls.

## End-to-end route

`@smartspectra/node-sdk/messages` decodes native metric packets **inside
Electron main**. `adaptSmartSpectraRates()` inspects only the latest
`cardio.pulseRate[]` and `breathing.rate[]` samples. It returns a strict
union without raw SDK payloads, frames, faces, credentials, video timestamps,
and other measurements:

| Event | Fields | Meaning |
| --- | --- | --- |
| `rate` | `kind, signal, value, unit, confidence, stable, timestampMs` | Candidate numerical estimate, not necessarily suitable for display |
| `unavailable` | `kind, signal, reason, timestampMs` | A supplied value was rejected (`invalid`) or explicitly unavailable (`missing`) |
| `state` (existing) | `kind, state, errorCode?` | Native camera/SDK lifecycle |
| `validation` (existing) | `kind, code` | Camera framing guidance, code 0 means OK |
| `metrics` (existing) | `kind, packets, breathingObserved, pulseObserved` | Aggregate packet counters and metric presence only |
| `transport` (existing) | `kind, framesReceived, framesAccepted, framesRejected, framesForwarded` | Camera frame transport diagnostics, not health measurements |

`signal` is `pulse` or `breathing`. Their units are **bpm (beats per
minute)** and **breaths/min**, respectively. The SDK confidence scale is
**0–100**, and `stable` is a strict boolean. Native code assigns
`timestampMs = Date.now()` when decoding the SDK callback. This is a local
wall-clock receipt timestamp, **not** the SDK's own timestamp or an implied
medical sample time. All `SignalQualityMachine` tests inject timestamps
using this same clock, so behavior is reproducible.

Only rate samples inside the SDK's documented intended ranges are eligible:
pulse **40–110 bpm**, breathing **5–40 breaths/min**. Non-finite, zero,
non-number, missing-confidence, out-of-range, wrong-unit or missing-stability
samples become `unavailable: invalid`. A packet with an *absent* metric
array produces no rate event for that metric; the previous event simply ages
out. The last array entry is authoritative: never fall back to an older
value. The fixed preload bridge revalidates and copies each allowed field;
extra keys (including camera or face data) are rejected.

## Signal quality state machine

`SignalQualityMachine` is pure TypeScript without timers or dependencies.
It is created separately from the native camera and advances from explicit
`connect`, `validate`, `accept`, `snapshot`, and `disconnect` calls.

- **disconnected:** before Start measurement and immediately on stop, camera
  closure, SDK fatal error or destruction. No numeric readings survive.
- **warming:** measurement has started but one or both windows have not yet
  produced a usable sample. SDK analysis takes about **12 seconds** for
  pulse and **30 seconds** for breathing. No value is shown prematurely.
- **ready:** at least one supported rate has passed all current checks.
  Each metric is gated independently; an unavailable breathing rate does
  not invent a breathing rate or hide an independently valid pulse rate.
- **degraded:** poor framing (nonzero SDK validation), stale/missing samples
  after warm-up, or low-quality/unstable measurements. Hide affected values.
  A new successful validation and fresh qualifying sample are required to
  recover after poor framing.

An individual rate is exposed to the UI only when the metric's warm-up
window has elapsed, the SDK has reported validation code 0, confidence is
at least **70/100**, `stable` is true, and receipt age is at most **4
seconds**. The 70-point threshold and four-second freshness are
**conservative application UX policies**, not medical or provider-certified
cutoffs. A sample arriving later than the age limit, from an earlier
session, out of order, or too far in the future is ignored. A periodic
one-second `snapshot(Date.now())` invalidates previously displayed values
even if the SDK stops publishing samples. All readings reset before native
stop completes.

SDK `metrics` presence flags and frame counts remain diagnostics, never a
substitute for a validated rate. The UI uses `—` for any unsupported
number, rather than zero, an estimate, or a retained stale reading.

## Development tests and follow-up

Run `npm run quality` (including `tests/signals.test.cjs`). Tests
cover validated typed events, malformed data, absent metrics, out-of-range
and old values, warm-up, confidence/stability, framing degradation,
out-of-order events, recovery and disconnect. These are simulated unit
cases, **not** clinical signal accuracy validation.

Issue #13 adds a decoupled, time-based visual smoothing engine; see
[visualization smoothing and neutral fallback](visualization.md). Issue #12
itself does not smooth metrics, add health interpretations, or persist values.

Official documentation:
- https://smartspectra.presagetech.com/docs/nodejs/metrics/
- https://smartspectra.presagetech.com/docs/measurement-quality/
- https://smartspectra.presagetech.com/docs/model-cards-and-limitations/
