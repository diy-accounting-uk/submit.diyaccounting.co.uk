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

- [ ] **Prod CloudFront cutover stuck since issue-9's merge, now fixed pending
  confirmation.** `EdgeStack` had two deploy-breaking bugs (a semicolon in a WAF
  IPSet description violating AWS's regex; a 13-pattern regex set exceeding
  WAFv2's 10-pattern limit) — both fixed, commit `40fc40a3`. Consequence while
  broken: `deploy-edge` failed on every prod deploy since, so `set-origins` (the
  job that actually repoints CloudFront) kept getting skipped — but
  `set-last-known-good-deployment` only depends on `web-test`, not on
  `set-origins`, so the SSM pointer kept advancing anyway. Result: CloudFront has
  been serving stale `prod-9050bb5` (pre-dating B28/cognito-fix/B14) while SSM
  claims `prod-a994f29` is "last known good" despite never being cut over — so
  the cognito-token-post audit-log fix, B28's scan/data-theft detection, and
  B14's ingestion work are not actually live for real customers yet, only
  deployed. A bump commit (`ccd8b3ee`) forced a fresh deploy; a watcher is
  confirming `deploy-edge`/`set-origins` succeed for real and CloudFront's
  origin actually changes before anything gets torn down. Once confirmed: purge
  the orphaned `prod-9050bb5`, `prod-a994f29`, and partial `prod-40fc40a` stack
  sets. Separately worth fixing later: `set-last-known-good-deployment` should
  depend on `set-origins`, not just `web-test`, so this class of mismatch can't
  recur.
- [ ] **(B30) Alarm-count audit, remainder.** `REPORT_ALARM_AUDIT.md` holds the audit
  (live check verified it: prod 155 alarms vs ~163 predicted, ~45 app alarms never
  fired in 90 days; the one noisy alarm was a log-wording false positive, since
  fixed). Cuts 1 and 2 are on main. Composite-alarm consolidation (cut 3) and the
  `activity-telegram-forwarder` alarm-sensitivity tuning (issues #77-82, same
  `Lambda.java` construct) both merged to main 2026-09-01, code-verified
  (`./mvnw clean verify` 74/74). Still open: deploy and confirm the composite
  `check-`/`-health` alarm split and the widened tolerance in live ci/prod.
- [ ] **(B14) Scheduled ingestion, live behaviour** — `PLAN_SCHEDULED_INGESTION.md`
  is the plan of record. Merged to main 2026-09-01, ci green end to end, every new
  resource live in ci (`v_ga4_funnel_daily`, `v_purchase_reconciliation_daily`,
  `ci-env-analytics-nightly` with its schedule, `ci-env-ga4-event-export-pull`).
  What the resources actually do is still unproven: invoke `ga4-event-export-pull`
  and check `ga4_bq_events` row counts against the GA4 console's page views; start
  a state machine execution and confirm `SUCCEEDED`, then confirm the next
  scheduled run also succeeds unattended; confirm
  `v_purchase_reconciliation_daily` returns rows and the three new metrics reach
  the `Submit/Analytics` namespace after a nightly run. Then repeat in prod.
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
- **B14** — merged. Fix bundled with it: `ci-env-AnalyticsStack`/`DataStack`'s
  shared custom-resource IAM role was near its 10KB cap (per-resource policy
  replaced with one minimized per-stack policy), and `deploy-environment.yml`'s
  `create-secrets` job was missing `actions/checkout` — silently exit-127'ing and
  skipping all 14 stack deploys in both ci and prod since today's issue-10 merge.
  Both now fixed and live-verified in ci.
- **B20/20a implement** (sonnet, branch `claude/b20-alerting-deploy`) — running,
  ci deploy in progress.
- **Prod cutover watcher** — confirming the bump-triggered deploy (`ccd8b3ee`)
  gets `deploy-edge` and `set-origins` through cleanly and CloudFront actually
  repoints. See the open-item bullet above. Purge of the three orphaned prod
  deployments follows once confirmed.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
