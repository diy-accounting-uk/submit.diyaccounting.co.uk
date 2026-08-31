# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-bc6a9dd.** Drift findings live in issue #43.

- [ ] **Confirm a `purchase` event lands.** GA4 still shows "No stream data detected"
  for `purchase` property-wide — expected while no paid flow has completed since
  collection was restored (2026-08-31), but confirm rather than assume once the
  funnel has run a few days (GA4 property 523400333, or BigQuery
  `analytics_523400333`). PR #70 carries the `google-analytics.toml` record to merge.
- [ ] **compliance and stack-drift schedule revival — dispatches passed, cron proof
  remains.** Both revival runs are green (compliance 10/10 checks; stack-drift "all in
  sync" with three stacks correctly filtered as `DRIFTED_BENIGN` on its first
  noise-filtered run). `verify-backups` missed its 06:00 slot the same day and went
  green on a manual dispatch. Claude Code: confirm `verify-backups`' daily cron fires
  on 2026-09-01, and the Monday 2026-09-07 06:00 UTC crons fire on their own, before
  closing; watch `codeql` on 2026-09-06 and revive the same way if it misses again.
- [ ] **Wire the weekly `certbot renew` launchd agent** on the operator machine so the
  local TLS cert renews unattended (valid to 2026-11-29; recipe in
  `_developers/SETUP.md`, deploy-hook publishes to Secrets Manager).

- [ ] **(B30) Alarm-count audit.** 123 alarms per deployment and the canary cadence —
  review what should exist against what does; the largest recurring CloudWatch line.
- [ ] **(B32b) Gate the two ungated read endpoints.** Apply the specced
  `requireActivity()` gating to the obligations and view-return endpoints, and check
  `prod-env-hmrc-api-requests` for whether anyone uses them — the usage numbers also
  say whether more read-only pages are worth building.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
