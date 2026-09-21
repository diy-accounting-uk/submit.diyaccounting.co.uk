<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Parked during cool-down

One line each; the operator triages when cool-down lifts.

- eslint's global `ignores` covers `scripts/` and, since B49.15, `infra/google/`; the eight moved Google scripts carry 16 sonarjs/security findings nothing lints. Decide whether they are linted (`eslint.config.js`).
- The 09:16 UTC scheduled `deploy.yml` on `main` creates a new prod set for a docs-only head (prod-a15fe51 from a15fe519 on 2026-09-21), a full deploy and a destroy for no change; a paths or "head already deployed" guard on the schedule would skip it.
- `publish-filter`'s `finalMessageOnly` drops a leaked preamble only when a `---` precedes the answer; support-triage #1's comment on #100 kept one sentence of reasoning above its headings. A heading-based cut (`## ` first heading) would cover it.
- `PLAN_EVERYTHING_AS_CODE.md`'s Google Ads section (items 16 and 17) still describes the developer-token and manager-account design that Google sunset on 2026-09-09; `infra/google/ads/ads.toml` and `ads-inventory.js` carry the current one.
- `ads-inventory.js` reads GA4's `googleAdsLinks` only under federated credentials, so a run inside `google-apply.yml` would complete the inventory; no workflow step runs it today.
