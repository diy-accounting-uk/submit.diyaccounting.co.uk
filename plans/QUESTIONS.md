# Open questions from issue plans

Each question is tagged `Qnnn.x` where `nnn` is the issue number and `x` is the order.

Grouped by theme rather than issue number so related decisions can be made together.

---

## 1. Product strategy / scope

- **Q580.1** — **Which "limited company" endpoints?** HMRC Corporation Tax (pre-mandate, no production API), Companies House reads (available now), or Companies House filings (requires accreditation)? This is the #1 blocker.
- **Q580.2** — Are we willing to apply for Companies House filing accreditation?
- **Q580.3** — Bundle pricing for limited-company access: new `resident-company` bundle, or fold into `resident-pro`?
- **Q580.4** — Would Companies House integration help existing VAT/ITSA users, or is this a new market entirely?
- **Q579.1** — Confirm MTD ITSA mandate date and income threshold — still April 2026 / £20k? (Product timing.)
- **Q579.5** — Which bundles unlock self-employment? Current catalogue says `basic`/`legacy`; do we want a new `resident-itsa`?
- **Q579.3** — Token cost per self-employment submission — same 1 token as VAT, or different?
- **Q425.1** — Entitlement gating for optional VAT endpoints — reuse `vat-obligations` or introduce fine-grained `vat-view`?
- **Q425.2** — Do we need `POST /organisations/vat/{vrn}/payments` (make a payment) too?
- **Q576.1** — DIY Merch: Path A (storefront link), Path B (integrated Stripe), or Path C (reward-only for ambassadors)?
- **Q576.2** — Merch product set + brand collateral preferences?
- **Q576.3** — Merch geographic scope — UK-only, EU, worldwide?
- **Q576.4** — Print-on-demand vendor preference (Teemill UK vs Printful)?
- **Q646.2** — `battery-pack` promotion: into this repo's `packages/` or spawn `support-at-diyaccounting/battery-pack` repo now?
- **Q646.4** — `battery-pack` feeds into MCP (#648) or metric-son (#645) as a distribution/packaging model — any intended coupling?
- **Q645.1** — `metric-son` packaging: this repo's `packages/` first, extract later, or standalone repo now?
- **Q645.2** — Which funnels are highest priority for `metric-son` instrumentation?
- **Q645.3** — Retire CloudWatch RUM when metric-son reaches parity, or run both?

## 2. Auth & identity

- **Q634.1** — Apple Developer Program account — do we have one, or does this issue include setup cost?
- **Q634.2** — Microsoft — single-tenant or `common` (multi-tenant)? (Recommendation: `common`.)
- **Q634.3** — Is there a marketing/segmentation case for prioritising Apple vs Microsoft?
- **Q634.4** — Do we want Facebook too while we're at it?
- **Q648.2** — MCP auth — OAuth device-code flow (nicer UX) or personal API tokens (simpler)?
- **Q648.1** — MCP host — Lambda or Fargate?
- **Q648.3** — MCP initial tool set — read-only only, or include `submit_return` with web-confirm flow from day 1?
- **Q648.4** — MCP productise: standalone package / separate repo?

## 3. Alerting, observability, security

- **Q572.1** — Which Slack workspace? Existing or a new ops-focused one?
- **Q572.2** — GitHub Personal Access Token vs GitHub App for the issue-raiser Lambda? (Recommendation: App.)
- **Q572.3** — Routing rules — which alarms auto-raise issues, who's the assignee default?
- **Q572.4** — Retire Telegram alerting entirely, or keep for critical-only alerts?
- **Q720.1** — Scan detection events → Telegram, Slack, or both?
- **Q720.2** — Block IPs automatically on threshold, or alert-only? (Recommendation: alert-only initially.)
- **Q720.3** — Budget envelope for scheduled-Lambda scan aggregation?
- **Q719.1** — Data-theft detection priority relative to #720 scan detection? (Recommendation: work them together.)
- **Q719.2** — CloudTrail data-events cost at our volume — acceptable?
- **Q719.3** — Mid-session country-change — force re-auth (friction) or just alert?
- **Q715.1** — `submit-backup` SSO policy — start `AdministratorAccess`, downgrade later?
- **Q715.2** — Monthly automated restore-test — restore real prod data into CI, or a masked subset?
- **Q715.3** — Cross-region backup copy (eu-west-2 → eu-west-1) — yes?
- **Q715.4** — Salt backup — covered by AWS Backup for Secrets Manager, or bespoke export?
- **Q736.1** — PII concern sending hashedSub-prefix to Telegram on logout, or userless count only?
- **Q736.2** — Emit `user.login.failed` events to the Telegram/Slack channel for security awareness, or too noisy?

## 4. UX / frontend

- **Q745.1** — Simulator logout redirect — go to `/sim/` prefix or `/`?
- **Q745.2** — Extract main nav into a shared partial as part of the home-button fix? Would simplify #737 and #740 too.
- **Q740.1** — Mobile screenshot confirmation — iOS Safari or Android Chrome? Impacts which viewports to prioritise.
- **Q740.2** — Move "Manage subscription" to header user menu as well?
- **Q737.1** — Pass auto-redemption on any page (recommended), or only on bundle/pass pages?
- **Q737.2** — Support `?pass=X&then=/original-url` for legacy shared links?
- **Q735.1** — Which page does the "packed mobile UI" screenshot show?
- **Q735.2** — Hamburger nav under 640px acceptable?
- **Q651.1** — Dark mode scope: dark-only first (Alt A), or dark + high-contrast together?
- **Q651.2** — Theme toggle location: header or account menu?
- **Q651.3** — Brand-approved dark palette, or pick from scratch?
- **Q655.1** — Languages for first cut? (My recommendation: EN, CY, PL.)
- **Q655.2** — Accept a library dependency (i18next), or dependency-free?
- **Q655.3** — Server-rendered locales for SEO from day 1, or client-side first?
- **Q655.4** — Translation source — volunteers, paid, or machine + review?
- **Q655.5** — Is Welsh-language parity legally required for a private SaaS?

## 5. Naming / hygiene

- **Q707.1** — Keep `sandbox` in `hmrcAccount=sandbox` sessionStorage (vendor word), or align with the rename?
- **Q707.2** — UI copy — "Developer mode" (user-familiar) or "Synthetic mode" (more correct)?
- **Q707.3** — `testPass` → `synthetic` DynamoDB migration window — 30 or 90 days?
- **Q746.1** — Who controls the Linktree account credentials?
- **Q746.2** — Owned `/links` page on the gateway, or direct-to-home?
- **Q746.3** — Any printed assets still show `linktr.ee/diyaccounting`?

## 6. Growth / community

- **Q652.1** — Any spec changes since the Phase 6 doc was written (2026-02-01)?
- **Q652.2** — Ambassador tier thresholds — 5/15/? Keep Silver at 5, Gold at 15?
- **Q652.3** — Commission (6.4) timing — tie to Stripe payment integration PR timeline?
- **Q652.4** — Accountant-partner verification — manual review OK, or self-serve workflow?
- **Q652.5** — Admin UI gating — IAM group (Cognito) or bundle with admin flag?

## 7. Compliance / cost / governance

- **Q703.1** — Lighthouse thresholds — 80/95/95/95 acceptable?
- **Q703.2** — Run Lighthouse weekly, per-PR, or both?
- **Q703.3** — Run against prod, ci, or both?
- **Q703.4** — Automate sitemap generation from file listing?
- **Q579.2** — OpenAPI client generation (`openapi-generator-cli`) or hand-rolled for the 9 self-employment endpoints? (Recommendation: generate.)
- **Q579.4** — Implement the business-details API, or require manual businessId entry?
- **Q425.3** — Hand-rolled vs OpenAPI-generated client for VAT optional endpoints?
- **Q646.1** — Cipher/KDF for `battery-pack` (recommendation: AES-256-GCM + PBKDF2-SHA256/scrypt)?
- **Q646.3** — Key distribution for customers — which mechanism?

---

## Priority call — where I'd ask first

If you want to pick only the few questions that unblock the biggest chunks of work:

1. **Q580.1** — the whole "limited company" issue is paused on this.
2. **Q652.1** / **Q652.5** — Phase 6 backlog is 506+ lines of scoped work.
3. **Q648.2** + **Q648.3** — MCP server is a flagship; token-or-OAuth and tool-set decide the first PR scope.
4. **Q572.1** — Slack workspace — blocks every other alerting improvement.
5. **Q715.2** — backups restore-test data policy — gates a monthly scheduled workflow.
6. **Q655.1** — i18n first-cut languages — decides the scaffolding scope.
7. **Q707.2** — "Developer mode" vs "Synthetic mode" in UI copy — the rename PR depends on this.

Everything else is either recommendation-defaulted or can be picked up as the respective PR lands.
