# SignalScape independent publication checklist

This kit turns the approved [SignalScape technical showcase article](technical-showcase-article.md)
into a standalone developer blog post. **It is not a Presage SmartSpectra
SDK Challenge entry** and must not be labeled as one. The competition has
an age-eligibility restriction; only independent publication that complies
with the chosen platform's ordinary account terms is contemplated here.

## Ready-to-publish materials

- **Article source of truth:** [Technical showcase article](technical-showcase-article.md)
- **Cover illustration:** [SignalScape 1000×420 SVG](assets/signalscape-showcase-cover.svg).
  Export or use the separately provided 1000×420 PNG for an article-cover
  upload. The cover is **illustrative artwork**, not a screenshot or SDK
  measurement evidence. It intentionally contains no sample pulse rates.
- **DEV Markdown:** [Generated draft](dev-community-draft.md), containing
  `published: false`, a neutral technical title/description and four
  technology tags; no competition submission text or prize categories.
- **Real video:** [Zight recording](https://share.zight.com/01a1b6e3-7a47-7080-8098-3c279ee75aba).
  The owner has consented to publishing their own visible webcam preview and
  numeric estimates. Check that the sharing permissions are intended.
- **Public code:** [SignalScape repository](https://github.com/jbrhinalyn/signalscape).

## Publishing to DEV or another permitted technical blog

1. Review the draft under `docs/dev-community-draft.md`, including the
   experimental/non-medical disclosure and the SDK-enabled installer **NO-GO**.
2. Open a new ordinary article in the platform's editor, if eligible under
   its general account terms. Use the technical showcase Markdown rather
   than the competition's submission template. Do **not** add a challenge
   submission statement, challenge tags or prize categories.
3. Upload the 1000×420 PNG as the **cover image** using the article editor.
   The Markdown draft does not include a `cover_image` URL because the
   image host supplies that address after upload; do not use a nonexistent URL.
4. Paste the draft contents, checking whether the editor requires front
   matter removal or uses metadata fields for title, tags and description.
   Use **Preview** to check heading hierarchy, code fences, link targets and
   image crop. Leave the post unpublished while reviewing.
5. Check the Zight recording and README links in a private or unlisted
   article preview if available. Zight is a third-party cloud recorder and
   its retention/sharing is separate from SignalScape's local app behavior.
6. Confirm the privacy statements are accurate: app starts with camera Off;
   preview and measurement are separate; SmartSpectra aggregate telemetry
   was disabled in the tested implementation; provider authentication may
   still use the network. The video does not show the SDK metric packet
   counter throughout; do not describe it as independent packet verification.
7. When you are satisfied with the article and the platform's account terms,
   **publish it yourself** using the platform's publishing controls. No DEV
   account connection or publication action is included in this repository PR.
8. After publication, add the real URL to README in a separate reviewed
   commit. Do not invent a DEV post URL in advance.

## Regenerating the draft

The source of truth is `docs/technical-showcase-article.md`. After any
approved edits, run:

```bash
npm run showcase:draft
npm run quality
```

The first command rewrites `docs/dev-community-draft.md` deterministically.
The regression test rejects stale Markdown, missing disclosures, accidental
challenge claims or invented rate examples. It does not publish to DEV.

**Release distinction:** This is publication of documentation and video
only; it does not package, redistribute, authenticate or grant permission
for public native SDK builds. See [release readiness](release-readiness.md).
