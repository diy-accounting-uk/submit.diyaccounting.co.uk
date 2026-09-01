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
  fixed). Cuts 1 and 2 are on main. Composite-alarm consolidation (cut 3) and the
  `activity-telegram-forwarder` alarm-sensitivity tuning (issues #77-82, same
  `Lambda.java` construct) both merged to main 2026-09-01, code-verified
  (`./mvnw clean verify` 74/74). Still open: deploy and confirm the composite
  `check-`/`-health` alarm split and the widened tolerance in live ci/prod.
- [ ] **Bug: `ci-env-AnalyticsStack`'s auto-generated IAM policy exceeds AWS's 10240-byte
  max size.** Found running B14's ci deploy 2026-09-01: `ci-env-BusinessViews/
  v_ga4_funnel_daily-CreateView/CustomResourcePolicy` failed
  `ServiceLimitExceeded` on `ci-env-AnalyticsStack-AWS679f53fac...`, the CDK
  Provider Framework's auto-generated role. The stack rolled back cleanly
  (`UPDATE_ROLLBACK_COMPLETE`), but the dependent ingestion-stack deploy was
  skipped, so none of B14's new resources (the two Athena views, the
  `NightlyIngestionWorkflow` state machine, `ga4-event-export-pull`) are live
  anywhere. Blocks B14's live verification and its merge to main — merging now
  would just fail the same way against prod. Needs investigation: likely too
  many CustomResource-backed Athena views/tables sharing one auto-generated
  Provider role; the fix is probably splitting providers or moving to an
  L1/non-custom-resource construct for view creation, not a quick tweak.
- [ ] **(B14) Scheduled ingestion, remaining phases** — `PLAN_SCHEDULED_INGESTION.md`
  is the plan of record. Code-complete on branch `claude/b14-scheduled-ingestion`
  (pushed 2026-09-01), `./mvnw clean verify` 86/86 and `npm test` 1179/1181 (2
  pre-existing skips) both green, ci's `test.yml` and `deploy.yml` (app stacks)
  both passed. Both phase-1 loose threads resolved as self-resolving, not bugs:
  the ga4-report-pull "empty" log stream was a secret that didn't exist yet a day
  before that run, already fixed by the time of the next run; ci's SSM pointer
  already reads `ci-claudedon`, a real deployment — the `ci-clauderem` value this
  file previously named was already stale information. Phases 2 (GA4 BigQuery
  export), 3 (Step Functions orchestration), 4 (reconciliation views) and 6
  (Stripe, no code change needed) all built. **Blocked on the AnalyticsStack IAM
  policy-size bug above** — ci's `deploy-environment.yml` failed deploying the new
  Athena views, so phases 2-4's actual resources have never run live. Not merged
  to main yet; merging now would fail the same deploy in prod.
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
- [ ] **(B28) Scan and data-theft detection, remainder** (issues #9, #10). Both
  merged to main 2026-09-01. Issue 9 (scan detection): WAF sensitive-path rule +
  logging + detection Lambda, Athena-based 404-rate check (`ScanDetectionStack`),
  manual `WAF-Manual-Block` IPSet, runbook 7.5. No honeypots, no auto-block, per
  the recorded scope decision. Issue 10 (data-theft remainder): salt-secret
  resource policy + unexpected-read alarm, bundle-endpoint burst detection,
  mid-session country-change re-auth in `customAuthorizer.js`, cross-account hold
  runbook (6.6). Still open for both: the plan's live-AWS verification steps
  (need a real deploy — resource-policy read-back, a real burst against ci,
  deployed authorizer log check).

## In flight (coordinator session)

Wave 1 dispatched 2026-09-01, coordinator merges and pushes each landed piece:

- **B30** — merged.
- **cognito-token-post env-var fix** — merged (conflicted with B28 issue-10 on
  `AuthStack.java`, both additions kept, resolved and verified before merge).
- **B28** — both issue-9 and issue-10 merged.
- **B14** — code-complete, NOT merged. Blocked on the AnalyticsStack IAM
  policy-size bug above; needs that fixed first, or merging now fails prod's
  deploy the same way.
- **B20/20a implement** (sonnet, branch `claude/b20-alerting-deploy`) — running,
  ci deploy in progress.
- **prod-2bc7f1e teardown** — dispatched (`destroy-prod.yml` run 33549674791),
  operator-approved, stale duplicate prod deployment found via the alarm flood.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
