<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PARKED — discoveries held during cool-down, for the operator to triage

One line each. A line the operator picks becomes a board row; a line they drop is deleted.

- Guide frames: duplicate step headlines inside one journey in `web/public/videos/publish.json`: `view-return` steps 3 and 8 ("Back to activities") and 5 and 10 ("Same VAT number"), `itsa-year` steps 20 and 25 ("File with HMRC"), `accounting-diya-gl-profit` steps 15 and 23 ("Add the purchase"); SQ1's scope if the captions should differ (GJ1's review, 2026-10-24).
- Stripe: the confirmation statement's product takes its new catalogue display name "File Confirmation Statement (Companies House, sandbox)" on the next `stripe-catalogue-sync`; decide whether the sync strips the status suffix before naming a product (NM1, 2026-10-24).
- Companies House test service: all four accounts submissions (00004K, 00004L, 00004M, 00004N) answered PENDING at every poll on 2026-10-24; the workflow's concurrency group cancels a second queued poll, so polls go one at a time (AX4's remainder names the command).
- MCP harness: no tool returns a browser-step link yet, so the harness iframe is proven only by a mocked browser test; the ci lane forwards a caller bearer that nothing on the page supplies (MV1, 2026-10-24).
- iXBRL import (spreadsheets): the per-suite FRC concept lists (`generate-frc-taxonomy-concepts.js`) are not generated, so taxonomy suites 2014 to 2021 read as the current suite with unknown names going to `unmapped`; fixed-asset disposals are named in `differences` and not posted; a decreasing "other creditors" balance is not routed through 2400 (IX2a, 2026-10-24).
- ITSA pages: the annual submission edit pages (`annualSubmission.html`, `ukPropertyAnnualSubmission.html`) keep a plain "saved" message after saving and are not re-laid as records; the period views keep the field table (IR1, 2026-10-24).
- Visual pass leftovers for DS3 (`web/public/submit.css`): the feature status line has no visual distinction between production, sandbox and preview; the summary paragraph is a dense block on phones; `.footer-right` has no flex share so every `activity-boxed` and `full` footer sits right of centre; the hero header takes about 200 px of the first phone screen (AV1, VR1, IR1, 2026-10-24).
