# Open questions from issue plans

Each question is tagged `Qnnn.x` where `nnn` is the **current** GitHub issue number and `x` is the order.

Grouped by theme rather than issue number so related decisions can be made together.

Issue numbers were renumbered when the repo migrated orgs in 2026-05 (old #425–#746 → new #3–#20; each plan file under `plans/issues/` carries its pre-migration number in parentheses). 8 pre-migration plan files (580b, 580c, 645, 646, 648, 651, 652, 655) have no matching current issue and moved to `plans/archive/pre-migration/`; their open questions are dropped from this index.

---

## 1. Product strategy / scope

- **Q15.1** — **Which "limited company" endpoints?** HMRC Corporation Tax (pre-mandate, no production API), Companies House reads (available now), or Companies House filings (requires accreditation)? This is the #1 blocker.
- **Q15.2** — Are we willing to apply for Companies House filing accreditation?
- **Q15.3** — Bundle pricing for limited-company access: new `resident-company` bundle, or fold into `resident-pro`?
- **Q15.4** — Would Companies House integration help existing VAT/ITSA users, or is this a new market entirely?
- **Q16.1** — Confirm MTD ITSA mandate date and income threshold — still April 2026 / £20k? (Product timing.)
- **Q16.5** — Which bundles unlock self-employment? Current catalogue says `basic`/`legacy`; do we want a new `resident-itsa`?
- **Q16.3** — Token cost per self-employment submission — same 1 token as VAT, or different?
- **Q19.1** — Entitlement gating for optional VAT endpoints — reuse `vat-obligations` or introduce fine-grained `vat-view`?
- **Q19.2** — Do we need `POST /organisations/vat/{vrn}/payments` (make a payment) too?
- **Q17.1** — DIY Merch: Path A (storefront link), Path B (integrated Stripe), or Path C (reward-only for ambassadors)?
- **Q17.2** — Merch product set + brand collateral preferences?
- **Q17.3** — Merch geographic scope — UK-only, EU, worldwide?
- **Q17.4** — Print-on-demand vendor preference (Teemill UK vs Printful)?

## 2. Auth & identity

- **Q14.1** — Apple Developer Program account — do we have one, or does this issue include setup cost?
- **Q14.2** — Microsoft — single-tenant or `common` (multi-tenant)? (Recommendation: `common`.)
- **Q14.3** — Is there a marketing/segmentation case for prioritising Apple vs Microsoft?
- **Q14.4** — Do we want Facebook too while we're at it?

## 3. Alerting, observability, security

- **Q18.1** — Which Slack workspace? Existing or a new ops-focused one?
- **Q18.2** — GitHub Personal Access Token vs GitHub App for the issue-raiser Lambda? (Recommendation: App.)
- **Q18.3** — Routing rules — which alarms auto-raise issues, who's the assignee default?
- **Q18.4** — Retire Telegram alerting entirely, or keep for critical-only alerts?
- **Q9.1** — Scan detection events → Telegram, Slack, or both?
- **Q9.2** — Block IPs automatically on threshold, or alert-only? (Recommendation: alert-only initially.)
- **Q9.3** — Budget envelope for scheduled-Lambda scan aggregation?
- **Q10.1** — Data-theft detection priority relative to #9 scan detection? (Recommendation: work them together.)
- **Q10.2** — CloudTrail data-events cost at our volume — acceptable?
- **Q10.3** — Mid-session country-change — force re-auth (friction) or just alert?
- **Q11.1** — `submit-backup` SSO policy — start `AdministratorAccess`, downgrade later?
- **Q11.2** — Monthly automated restore-test — restore real prod data into CI, or a masked subset?
- **Q11.3** — Cross-region backup copy (eu-west-2 → eu-west-1) — yes?
- **Q11.4** — Salt backup — covered by AWS Backup for Secrets Manager, or bespoke export?
- **Q7.1** — PII concern sending hashedSub-prefix to Telegram on logout, or userless count only?
- **Q7.2** — Emit `user.login.failed` events to the Telegram/Slack channel for security awareness, or too noisy?

## 4. UX / frontend

- **Q4.1** — Simulator logout redirect — go to `/sim/` prefix or `/`?
- **Q4.2** — Extract main nav into a shared partial as part of the home-button fix? Would simplify #6 and #5 too.
- **Q5.1** — Mobile screenshot confirmation — iOS Safari or Android Chrome? Impacts which viewports to prioritise.
- **Q5.2** — Move "Manage subscription" to header user menu as well?
- **Q6.1** — Pass auto-redemption on any page (recommended), or only on bundle/pass pages?
- **Q6.2** — Support `?pass=X&then=/original-url` for legacy shared links?
- **Q8.1** — Which page does the "packed mobile UI" screenshot show?
- **Q8.2** — Hamburger nav under 640px acceptable?

## 5. Naming / hygiene

- **Q12.1** — Keep `sandbox` in `hmrcAccount=sandbox` sessionStorage (vendor word), or align with the rename?
- **Q12.2** — UI copy — "Developer mode" (user-familiar) or "Synthetic mode" (more correct)?
- **Q12.3** — `testPass` → `synthetic` DynamoDB migration window — 30 or 90 days?
- **Q3.1** — Who controls the Linktree account credentials?
- **Q3.2** — Owned `/links` page on the gateway, or direct-to-home?
- **Q3.3** — Any printed assets still show `linktr.ee/diyaccounting`?

## 6. Growth / community

(No open questions — the Phase 6 campaign/referral plan moved to `plans/archive/pre-migration/` with no current-issue counterpart.)

## 7. Compliance / cost / governance

- **Q13.1** — Lighthouse thresholds — 80/95/95/95 acceptable?
- **Q13.2** — Run Lighthouse weekly, per-PR, or both?
- **Q13.3** — Run against prod, ci, or both?
- **Q13.4** — Automate sitemap generation from file listing?
- **Q16.2** — OpenAPI client generation (`openapi-generator-cli`) or hand-rolled for the 9 self-employment endpoints? (Recommendation: generate.)
- **Q16.4** — Implement the business-details API, or require manual businessId entry?
- **Q19.3** — Hand-rolled vs OpenAPI-generated client for VAT optional endpoints?

---

## Priority call — where I'd ask first

If you want to pick only the few questions that unblock the biggest chunks of work:

1. **Q15.1** — the whole "limited company" issue is paused on this.
2. **Q18.1** — Slack workspace — blocks every other alerting improvement.
3. **Q11.2** — backups restore-test data policy — gates a monthly scheduled workflow.
4. **Q12.2** — "Developer mode" vs "Synthetic mode" in UI copy — the rename PR depends on this.

Everything else is either recommendation-defaulted or can be picked up as the respective PR lands.
