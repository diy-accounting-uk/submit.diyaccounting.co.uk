# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-bc6a9dd.** Drift findings live in issue #43.

- [ ] **(B14a) Gateway and spreadsheets GA4 streams are silent — diagnosed.** Cowork
  confirmed the scale: zero events in 28 days property-wide from both streams, while
  downloads and donations demonstrably happened; no `purchase`/`begin_checkout` ever
  received. Collection outranks finishing the pipeline. Both
  sites load gtag correctly with the right measurement IDs but set consent
  `analytics_storage: denied` and have no consent banner and no grant path, so nothing is
  ever collected; submit has the banner and a localStorage restore, which is why only its
  stream flows. The banner is deployed and live on both sites (2026-08-31). Claude Code:
  in a day or two confirm `page_view` events arrive on the Gateway and Spreadsheets
  streams (BigQuery dataset `analytics_523400333` in `diyaccounting-ga4`, or the GA4
  console), then close this and update `PLAN_GA4.md`.
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

- [ ] **(B19) GA4 console work — operator.** In the GA4 console: turn on the data
  export, schedule the Stripe report, mark conversions, retire the old stream and the
  stale remarketing tag. The Claude Code remainder is the B14a verification above.

- [ ] **(B30) Alarm-count audit.** 123 alarms per deployment and the canary cadence —
  review what should exist against what does; the largest recurring CloudWatch line.
- [ ] **(B32b) Gate the two ungated read endpoints.** Apply the specced
  `requireActivity()` gating to the obligations and view-return endpoints, and check
  `prod-env-hmrc-api-requests` for whether anyone uses them — the usage numbers also
  say whether more read-only pages are worth building.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
