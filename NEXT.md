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
  fixed). Cuts 1 and 2 are on main. Open: composite-alarm consolidation (cut 3) —
  design merged to main 2026-09-01 (`PLAN_ALARM_CONSOLIDATION.md`); implementation
  running on branch `claude/b30-alarm-implement`.
- [ ] **Alarm-sensitivity tuning: `activity-telegram-forwarder-errors` and
  `-high-duration-p95`** (issues #77-82) both fired within the same 30-second
  window as the OpsStack deploy that created the Lambda — deploy-induced, not a
  standing fault. Tune these two alarms' evaluation tolerance so a deploy-time
  burst doesn't cross threshold. Same file as B30; folded into the same
  `claude/b30-alarm-implement` implementation run.
- [ ] **Bug: `cognito-token-post` never gets `HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME`.**
  Found via issues #75/#76. Code-complete on branch `claude/fix-hmrc-audit-table-env`
  (pushed 2026-09-01) — the env var, an IAM `dynamodb:PutItem` grant the Lambda also
  lacked, `./mvnw clean verify` and `npm test` all green. ci's own `test.yml`/`deploy.yml`
  auto-triggered on push; verifying, then coordinator merges to main.
- [ ] **(B14) Scheduled ingestion, remaining phases** — `PLAN_SCHEDULED_INGESTION.md`
  is the plan of record. Code-complete on branch `claude/b14-scheduled-ingestion`
  (pushed 2026-09-01), `./mvnw clean verify` 86/86 and `npm test` 1179/1181 (2
  pre-existing skips) both green. Both phase-1 loose threads resolved as
  self-resolving, not bugs: the ga4-report-pull "empty" log stream was a secret
  that didn't exist yet a day before that run, already fixed by the time of the next
  run; ci's SSM pointer already reads `ci-claudedon`, a real deployment — the
  `ci-clauderem` value this file previously named was already stale information.
  Phases 2 (GA4 BigQuery export), 3 (Step Functions orchestration), 4 (reconciliation
  views) and 6 (Stripe, no code change needed) all built. ci's `test.yml`/`deploy.yml`/
  `deploy-environment.yml` auto-triggered on push; verifying against real ci resources,
  then coordinator merges to main.
- [ ] **(B20/20a) Ops alerting uplift, remainder** — the alarm→GitHub-issue Lambda is
  proven live in prod (deployed 2026-09-01, secret and OpsStack both confirmed; the
  21-issue alarm flood that day was the Lambda working as intended, not a bug). ci
  still needs its own proof. Resumed 2026-09-01 on the corrected approach: pushed
  `claude/b20-alerting-deploy`, polling for the auto-triggered ci deploy rather than
  hand-dispatching with a guessed deployment-name. Only hand-dispatch, with an
  explicit `--ref`, if no auto-deploy appears. Then the live proof (set-alarm-state
  on a cheap ci alarm → issue
  appears → second flip comments, not duplicates), then the B20 fan-out with dedup
  (this is already built — the shared `AlarmStateChangeRule` matches every alarm by
  deployment prefix and the Lambda already dedups by commenting, so "fan-out" here
  is just proving what's shipped, not new work). Adjacent gap surfaced:
  `supportTicketPost.js`'s GitHub wiring is dormant — `GITHUB_TOKEN_SECRET_ARN` is
  never provisioned by any workflow, so support-ticket-to-issue is wired in code but
  never deployed.
- [ ] **(B28) Scan and data-theft detection, remainder** (issues #9, #10) — design
  merged to main 2026-09-01 (`PLAN_SECURITY_DETECTION_REMAINDER.md`), split into
  independent issue-9/issue-10 sections. Two implementation agents running in
  parallel: `claude/b28-issue9-scan-detection`, `claude/b28-issue10-data-theft`.
  Scope decision recorded in the design: no honeypot pages, no IP auto-block
  automation — manual block list only, matching issue #9's actual acceptance
  criteria rather than the older NEXT.md phrasing.

## In flight (coordinator session)

Wave 1 dispatched 2026-09-01, four worktree-isolated sub-agents, coordinator merges and
pushes each as it lands:

- **B30 implement** (sonnet, branch `claude/b30-alarm-implement`) — running,
  composite-alarm consolidation plus the alarm-sensitivity tuning fold-in.
- **cognito-token-post env-var fix** — code-complete, pushed, ci verifying. See
  the open-item bullet above for detail.
- **B28 implement** — running, two parallel sonnet agents: branch
  `claude/b28-issue9-scan-detection` and branch `claude/b28-issue10-data-theft`.
- **B14 implement** — code-complete, pushed, ci verifying. See the open-item bullet
  above for detail. A watcher agent is confirming ci's auto-triggered runs and
  doing a light existence-check on the new phase-2/3 resources.
- **B20/20a implement** (sonnet, branch `claude/b20-alerting-deploy`) — resumed,
  branch pushed, polling for the auto-triggered ci deploy.
- **prod-2bc7f1e teardown** — dispatched (`destroy-prod.yml` run 33549674791),
  operator-approved, stale duplicate prod deployment found via the alarm flood.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
