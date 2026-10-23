---
name: visual-review
description: Judge screenshots as a reader sees them — the LLM look pass in the visual definition of done. Review test screenshots after a major visual change, then refresh and review the guide and site screenshots and the videos. Invoke after a major change to anything a person sees (a page, a shared stylesheet, a rendered document, a receipt, a video), when a guide or site screenshot set is refreshed, or when the operator asks for a visual, look or screenshot review.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# visual-review

A test proves what the DOM holds. This pass proves what a person sees. The session or sub-agent
opens each PNG with its Read tool and judges it against the criteria below.

## When

Run it after the tests pass on a major visual change:

- a new page, a new journey, or a new rendered document (a filed iXBRL, a receipt, a record view);
- a change to a page's layout, or to `web/public/submit.css` or a shared widget;
- a change to the house style for submission records.

A copy change or a small fix inside one component does not need it. When unsure, run it on the
pages the change reaches.

## The four steps

1. **Test screenshots.** Take the screenshots from the passing run: the behaviour suite's
   `target/behaviour-test-results/` locally, or its CI artifact (`gh run download <run-id> -n
   <artifact>`). Judge every screenshot of a step the change reaches.
2. **Refresh the published screenshots.** After the change lands: `npm run video:walkthrough`
   for the guide's journey steps, the site screenshots (DS1's `scripts/site-screenshots.mjs` once
   it exists), and, for a major change, re-record the videos that show it
   (`.claude/skills/site-video-capture/SKILL.md`, then `.claude/skills/video-publish/SKILL.md`).
3. **Judge the refreshed screenshots** against the criteria.
4. **UX pass on the guide.** Run the `ui-ux-pro-max` skill over the guide's screenshots for the
   journeys the change reaches: is each step clear, in order, and enough to follow without the
   video.

## Criteria

Score each screenshot pass or fail on every criterion. A fail names the criterion and what is
wrong, in one line.

| # | Criterion | Fails when |
|---|---|---|
| 1 | Realistic data | Placeholder text, `test`, `foo`, `0` everywhere, `00000001`, lorem ipsum, a name or figure no business would have; figures that do not add up |
| 2 | Not a bug | Anything a real user would report: `undefined`, `null`, `NaN`, `[object Object]`, raw markup or JSON, an error where success is expected, a spinner that never ends, a developer section in normal mode |
| 3 | Clean edges | Text cut at a box or crop edge, a table wider than its card, an element under the crop line, a half-shown control |
| 4 | Fills the space usefully | Most of the frame is empty, chrome or a banner; the useful content is a strip in the middle |
| 5 | Readable | Text too small to read at the size the page shows it; low contrast; overlapping elements |
| 6 | Current | The UI in the image no longer matches the page |
| 7 | Nothing in the way | A cookie or consent banner, a toast, a tooltip, a focus ring or hover state that is not the point of the step |
| 8 | Safe | A real customer's name, reference, UTR or email; a token, password or secret |
| 9 | Alt text matches | The image's alt text does not describe what the image shows |
| 10 | Consistent | Width, theme or zoom differs from the rest of its set without a reason |

## Results

- Write the results as a table: screenshot, the failed criteria, the one-line reason.
- Fix a fail in the same change when the change caused it.
- A fail under criterion 2 that the change did not cause is a bug: add a `NEXT.md` row for it,
  with the screenshot paths, what a user sees, and the page and file that show it.
- Any other fail that the change did not cause goes on the row that owns that screenshot set
  (the guide, the site screenshots or the video), or on a new row.
