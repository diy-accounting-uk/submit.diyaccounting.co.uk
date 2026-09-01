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
- [ ] **(B14) Scheduled ingestion, live verification** — `PLAN_SCHEDULED_INGESTION.md`
  phases 2 (GA4 BigQuery event export), 3 (Step Functions orchestration) and 4
  (cross-source reconciliation) are code-complete on `claude/b14-scheduled-ingestion`
  (mvn clean verify 86/86, npm analytics unit tests 120/120); phase 6 needed no
  code change, already covered by the existing shared-Stripe-key wiring. Each
  phase's own verification criterion still needs a ci/prod deploy: invoke
  `ga4-event-export-pull` and check `ga4_bq_events` has rows close to the GA4
  console's page-view count; start a state machine execution, confirm
  `SUCCEEDED`, then confirm the next scheduled run also succeeds unattended;
  confirm `v_purchase_reconciliation_daily` returns rows and the three new
  metrics land in the `Submit/Analytics` namespace after a nightly run.
- [ ] **(B20/20a) Ops alerting uplift, remainder** — the alarm→GitHub-issue Lambda is
  deployed. Operator set the PAT as repository-level GitHub Actions secret
  `ISSUE_BOT_TOKEN` on 2026-09-01 (GitHub rejects secret names starting `GITHUB_`,
  and `deploy-environment.yml` now reads `secrets.ISSUE_BOT_TOKEN`, matching). Next:
  the end-to-end proof at deploy time (set-alarm-state on
  a cheap ci alarm → issue appears → second flip comments, not duplicates), then the
  B20 fan-out with dedup. Adjacent gap surfaced: `supportTicketPost.js`'s GitHub
  wiring is dormant — `GITHUB_TOKEN_SECRET_ARN` is never provisioned by any workflow,
  so support-ticket-to-issue is wired in code but never deployed.
- [ ] **(B28) Scan and data-theft detection, remainder** (issues #9, #10) —
  `SecurityDetectionStack` with the DynamoDB customer-table alarms is on main.
  Open, in the plans' own terms: #9's later phases
  (CloudFront 404-spike aggregation, honeypot pages, IP auto-block — needs a Lambda
  aggregator and web changes); #10's Cognito/S3/Secrets signals (need CloudTrail
  event selectors extended in ObservabilityStack plus agreed burst thresholds); #10
  AC4 mid-session country-change re-auth (app change in `customAuthorizer.js`).

## In flight (coordinator session)

Wave 1 dispatched 2026-09-01, four worktree-isolated sub-agents, coordinator merges and
pushes each as it lands:

- **B30 design** (opus, branch `claude/b30-alarm-design`) — composite-alarm consolidation
  design doc, `PLAN_ALARM_CONSOLIDATION.md`. Design only, no code. Gates a wave-2
  implementation agent once it lands.
- **B28 design** (opus, branch `claude/b28-security-design`) — design doc for issues #9/#10
  remainder, `PLAN_SECURITY_DETECTION_REMAINDER.md`, split so #9 and #10 can implement in
  parallel. Design only, no code. Gates a wave-2 implementation agent once it lands.
- **B14 implement** (sonnet, branch `claude/b14-scheduled-ingestion`) — done, ready to
  merge: phases 2, 3, 4 code-complete and tested, phase 6 needed no change. Live-deploy
  verification is the remaining open item (see above).
- **B20/20a implement** (sonnet, branch `claude/b20-alerting-deploy`) — dispatch
  `deploy-environment.yml` then `deploy.yml` for ci, prove ci end to end, then repeat for
  prod. No code changes expected.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
