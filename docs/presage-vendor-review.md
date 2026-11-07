# Presage SmartSpectra v3.4.0 — vendor decision and release evidence request

**Status: awaiting written vendor confirmation.** This is a review checklist,
not proof of licensing, production credentials, or platform compatibility.
Do not include credentials, authentication responses, proprietary binaries,
private device identifiers, images or physiological samples in GitHub issues.

## Request to Presage support (support@presagetech.com)

Subject: SignalScape Electron distribution — SmartSpectra Node SDK 3.4.0 license and auth review

Hello Presage team,

We are developing SignalScape, a local-first Electron desktop application that
uses a consented camera stream and the SmartSpectra Node SDK for on-device
pulse/breathing estimates. Our development prototype uses
`@smartspectra/node-sdk@3.4.0` on Zorin Linux, but public distribution is
blocked pending written confirmation of the following:

1. May we redistribute the Node SDK, its Linux x64 native runtime packages
   and transitive libraries inside a public/commercial Linux AppImage and
   Debian package? Please identify applicable agreements, license limits,
   fees, attributions, update policy, and any review/approval steps.
2. For **Node.js/Electron SDK 3.4.0 specifically**, is there a supported
   user-scoped, short-lived token or delegated OAuth authentication model
   usable with `SmartSpectraSDK({ apiKey })`? If so, please share the exact
   protocol, documented SDK version, TTL, scopes, rotation/revocation,
   offline behavior and rate-limit rules. Does BYOK with individual end-user
   Presage accounts comply with your terms if delegation is unavailable?
3. Please confirm Linux x64 glibc/ABI and system library requirements for
   the packaged SDK, Windows x64 and macOS ARM64 terms if supported, and
   recommended electron-builder `asarUnpack`/`extraResources` layout.
4. With `enableTelemetry: false` and `logLevel: kNone`, what network calls
   still occur (authentication, metrics, metadata, updates)? Which domains,
   user/device identifiers and retention periods apply? Are frames or rate
   values ever transmitted? Please share the relevant data-processing terms.
5. Are there contractual, branding, consent/disclaimer or medical/wellness
   restrictions we must follow in the installer and end-user interface?

We will not embed a shared developer API key or bundle native SDK files in
public installers until the permitted model and license terms are reviewed.

Thank you.

## Review record (fill only with non-sensitive evidence)

| Decision | Required evidence | Current state |
| --- | --- | --- |
| Redistribution | Written permission referencing Node 3.4.0, Linux formats, transitive licenses | Pending |
| Authentication | Documented delegated token API or permitted BYOK model | Pending |
| Native closure | Approved platform list, ABI, packaging layout, notices | Pending |
| Network and privacy | Vendor documented network endpoints, retention and opt-outs, independent observation | Pending |
| Installer | Signed build plus clean target-machine install, measure, stop, restart and uninstall | Pending |
| Final authorization | Owner explicitly approves the exact version and distribution method after evidence review | Pending |

Save a sanitized vendor response or decision summary in a restricted evidence
location; cite a reviewed GitHub issue/PR without posting license documents or
user credentials. Keep `config/release-readiness.json` gates false until the
corresponding evidence is reviewed. A passing status check is not an action
to publish or release software.

Public platform documentation: https://smartspectra.presagetech.com/docs/nodejs/
