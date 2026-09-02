# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-6f1779b, the only app stack set standing.** Each extra
`prod-*-app-*` set left after a merge costs $46.88/month until named to `destroy-prod.yml`
(`PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

- [ ] **Tag the Stripe purchase as the GA4 `purchase` event.** Today `purchase` fires in
  `submitVat.html` when a VAT receipt is displayed, with `value: 0`, and nothing fires when
  a Stripe checkout completes (`bundles.html?checkout=success` only shows a status line).
  Move `purchase` to the checkout success with the real amount, currency, the checkout
  session id as `transaction_id` and the bundle as the item; move `begin_checkout` to the
  "Redirecting to checkout" click; retag the VAT submission as a custom event
  (`submit_vat_return`) so the funnel is still visible. Decide client-side on the redirect
  (has the consent state, misses users who never return) or server-side Measurement
  Protocol from the `checkout.session.completed` webhook (always fires, no consent
  context); say which in the PR.
- [ ] **Prove the GA4 funnel synthetically against a ci property and BigQuery dataset.**
  Synthetic runs consent to data collection (`consentToDataCollection`) yet none of their
  traffic reaches the prod export (4 `submitVat.html` page views since 2026-08-25, all
  real users). Find why (property filter, headless Chromium blocking `gtag/js`, or the
  beacon lost when the page closes), give ci its own measurement id via `submit.env`
  instead of the id hardcoded in `web/public/lib/analytics.js`, export that property to
  its own BigQuery dataset, and have `paymentBehaviour-ci` assert a `purchase` row lands
  there. Prod keeps `G-T81V5NL5MB` and `analytics_523400333`.
- [ ] **Confirm a real `purchase` lands in prod** once the two items above ship: the next
  live checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`) or GA4 property
  523400333. No event of that name has ever reached the export.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
