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
- [ ] **compliance and stack-drift schedule revival — weekly cron proof remains.** Both
  revival runs are green (compliance 10/10 checks; stack-drift "all in sync" with three
  stacks correctly filtered as `DRIFTED_BENIGN` on its first noise-filtered run).
  `verify-backups`' daily cron proved itself: after missing its 06:00 slot on
  2026-08-31 it self-fired at 13:17 UTC the same day (normal GitHub schedule drift) and
  passed. Claude Code: confirm the Monday 2026-09-07 06:00 UTC crons fire on their own
  before closing; watch `codeql` on 2026-09-06 and revive the same way if it misses
  again.
- [ ] **Manual `certbot renew` in the week of 2026-11-29** (run
  `aws sso login --sso-session diyaccounting` first; command in `_developers/SETUP.md`).
  The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed
  and cannot refresh unattended, so the run that matters needs a live session.

- [ ] **(B30) Alarm-count audit, remainder.** `REPORT_ALARM_AUDIT.md` holds the audit
  (live check verified it: prod 155 alarms vs ~163 predicted, ~45 app alarms never
  fired in 90 days; the one noisy alarm was a log-wording false positive, since
  fixed). Cuts 1 and 2 are on main. Open: composite-alarm consolidation (cut 3)
  needs a design pass before any code.
- [ ] **(B14) Scheduled ingestion, remaining phases** — `PLAN_SCHEDULED_INGESTION.md`
  is the plan of record. Phase 1 ran: activity events, all four table-change
  streams, and (after the path fix and replay) all three Stripe tables land
  queryable rows; phase 5 is on main. Still open from the run: prod's
  `ga4-report-pull` 2026-08-30 invocation left an empty log stream (unexplained —
  look before phase 2 builds on it), and ci's SSM `last-known-good-deployment`
  points at `ci-clauderem`, a deployment with no stacks anywhere. Remaining phases:
  2 GA4 BigQuery event export (operator prereqs in the plan), 3 Step Functions
  orchestration, 4 reconciliation views, 6 Stripe restricted keys (operator).
- [ ] **(B20/20a) Ops alerting uplift, remainder** — the alarm→GitHub-issue Lambda is
  deployed. Operator set the PAT as repository-level GitHub Actions secret
  `ISSUE_BOT_TOKEN` on 2026-09-01 (GitHub rejects secret names starting `GITHUB_`,
  and `deploy-environment.yml` now reads `secrets.ISSUE_BOT_TOKEN`, matching). Next:
  the end-to-end proof at deploy time (set-alarm-state on
  a cheap ci alarm → issue appears → second flip comments, not duplicates), then the
  B20 fan-out with dedup. Adjacent gap surfaced: `supportTicketPost.js`'s GitHub
  wiring is dormant — `GITHUB_TOKEN_SECRET_ARN` is never provisioned by any workflow,
  so support-ticket-to-issue is wired in code but never deployed.
- [ ] **(B25) Cross-account backups, operator steps only** — the CDK, selection, role,
  and monthly restore-test workflow are all on main. Remaining: enable cross-account
  backup at the AWS Organization level, first deploy of the backup-account stacks with
  the `submit-backup` SSO profile, then the first manual `restore-test.yml` dispatch
  (the gate for the TypeScript CDK migration, B33).
- [ ] **(B28) Scan and data-theft detection, remainder** (issues #9, #10) —
  `SecurityDetectionStack` with the DynamoDB customer-table alarms is on main.
  Open, in the plans' own terms: #9's later phases
  (CloudFront 404-spike aggregation, honeypot pages, IP auto-block — needs a Lambda
  aggregator and web changes); #10's Cognito/S3/Secrets signals (need CloudTrail
  event selectors extended in ObservabilityStack plus agreed burst thresholds); #10
  AC4 mid-session country-change re-auth (app change in `customAuthorizer.js`).

## In flight (coordinator session)

- Both batches are on main and fully deployed (environment and app runs green);
  the Stripe replay is done and proven in Athena. Remaining follow-up: the
  alarm→issue end-to-end proof once `GITHUB_ISSUE_BOT_TOKEN` is provisioned.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
