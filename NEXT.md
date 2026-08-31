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
  `analytics_523400333`).
- [ ] **compliance and stack-drift schedule revival — dispatches passed, cron proof
  remains.** Both revival runs are green (compliance 10/10 checks; stack-drift "all in
  sync" with three stacks correctly filtered as `DRIFTED_BENIGN` on its first
  noise-filtered run). `verify-backups` missed its 06:00 slot the same day and went
  green on a manual dispatch. Claude Code: confirm `verify-backups`' daily cron fires
  on 2026-09-01, and the Monday 2026-09-07 06:00 UTC crons fire on their own, before
  closing; watch `codeql` on 2026-09-06 and revive the same way if it misses again.
- [ ] **Manual `certbot renew` in the week of 2026-11-29** (run
  `aws sso login --sso-session diyaccounting` first; command in `_developers/SETUP.md`).
  The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed
  and cannot refresh unattended, so the run that matters needs a live session.

- [ ] **(B30) Alarm-count audit.** 123 alarms per deployment and the canary cadence —
  review what should exist against what does; the largest recurring CloudWatch line.
- [ ] **(B32b) Gate the two ungated read endpoints.** Apply the specced
  `requireActivity()` gating to the obligations and view-return endpoints, and check
  `prod-env-hmrc-api-requests` for whether anyone uses them — the usage numbers also
  say whether more read-only pages are worth building.
- [ ] **(B14) Scheduled ingestion jobs** — GA4 export, Stripe reconciliation,
  CloudFront logs, Step Functions/EventBridge orchestration.
- [ ] **(B20/20a) Ops alerting uplift** — prove one alarm end to end into an
  auto-raised GitHub issue (channel: Telegram), then the fan-out with dedup.
- [ ] **(B25) Cross-account backups, operator steps only** — the CDK, selection, role,
  and monthly restore-test workflow are all on main. Remaining: enable cross-account
  backup at the AWS Organization level, first deploy of the backup-account stacks with
  the `submit-backup` SSO profile, then the first manual `restore-test.yml` dispatch
  (the gate for the TypeScript CDK migration, B33).
- [ ] **(B28) Scan and data-theft detection alarms** (issues #9, #10) — wave 2,
  after the B30 audit reports.

## In flight (batch dispatched 2026-08-31, coordinator session)

- endpoints track (B32b) — Sonnet, worktree: started
- alarm-audit track (B30) — Sonnet, worktree, report only: started
- ingestion-design track (B14 design) — Opus, worktree, plan doc only: started
- alarm-to-issue track (B20a) — Sonnet, worktree: started
- backups track (B25) — merged to `claude/do-next-batch-1` (IAM scoping hardening only;
  the item itself was already on main), local verify running

## Discipline

(none repo-specific yet — see `../NEXT.md`)
