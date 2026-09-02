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

- [ ] **Confirm a `purchase` event lands.** `purchase` fires in `submitVat.html` when a
  VAT return's receipt is displayed (`begin_checkout` when the form is submitted), so it
  needs a real customer submission with analytics consent, not a Stripe payment.
  Synthetic runs never reach the GA4 export (4 `submitVat.html` page views since
  2026-08-25, all real), and the last customer submission (`actor = customer` in
  `prod-env-receipts`) was 2026-08-29, before collection was restored on 2026-08-31.
  Check again after the next customer receipt: `bq --project_id=diyaccounting-ga4
  --location=europe-west2` against `analytics_523400333.events_*`, or GA4 property
  523400333.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
