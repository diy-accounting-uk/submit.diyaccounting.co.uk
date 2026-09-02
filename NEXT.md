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

- [ ] **Prod CloudFront cutover fixed and confirmed — orphan purge in flight.**
  Three EdgeStack bugs blocked `deploy-edge` on every prod deploy since issue-9's
  merge (a semicolon in a WAF IPSet description; a 13-pattern regex set over
  WAFv2's 10-pattern limit; `CfnLoggingConfiguration.redactedFields(List<Object>)`
  silently dropping its Map contents through JSII), all fixed and merged
  (`52127a03`). Deployment `prod-52127a0` confirmed live 2026-09-02: `deploy-edge`
  and `set-origins` both succeeded, CloudFront's origin is `prod-52127a0`, and
  SSM's `last-known-good-deployment` agrees — the cognito-token-post audit-log
  fix, B28's detection work, and B14's ingestion work are now actually serving
  real traffic, not just deployed. A purge agent is tearing down the four
  orphaned deployments (`prod-9050bb5`, `prod-a994f29`, `prod-40fc40a`,
  `prod-ccd8b3e`) sequentially. Separately worth fixing later:
  `set-last-known-good-deployment` should depend on `set-origins`, not just
  `web-test`, so a deployment can't be marked "last known good" without actually
  being cut over — that gap is what let this whole situation compound today.
- [ ] **(B30) Alarm-count audit, remainder — live-verified with one gap found.**
  Composite-alarm consolidation (cut 3) and the `activity-telegram-forwarder`
  tuning confirmed live in prod deployment `prod-52127a0`: 23 composite
  `-health` alarms, 92 `check-` prefixed children, correct `AlarmRule`s, the
  widened 2-of-3 tolerance exactly as designed, no leftover old-style alarms —
  all read-verified against real CloudWatch, not inferred. Gap: `AnalyticsStack`'s
  two env-level Lambdas (`activity-event-transform`, `dynamo-stream-to-firehose`)
  are still on the old alarm scheme — that stack's last update (18:12) predates
  B30's merge (20:38), so it never redeployed. A `deploy-environment.yml` run for
  prod was dispatched 2026-09-02 to pick this up (env-level only, no
  CloudFront/WAF, safe alongside the orphan purge); confirm it lands.
- [ ] **(B14) Scheduled ingestion, live behaviour** — phases 2/3/6 verified for
  real against ci (real Lambda invoke, real Athena queries; state machine
  execution result pending as of 2026-09-02). Then repeat in prod, which is now
  also live and current for the first time today.
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
- [ ] **(B28) Scan and data-theft detection — code merged, but two stacks were
  never actually deployed anywhere.** Both issues merged to main 2026-09-01;
  live-verified against ci 2026-09-02 with a real gap found: `SecurityDetectionStack`
  and `ScanDetectionStack` are both correctly wired into `SubmitEnvironment.java`
  (confirmed by reading the source), but `deploy-environment.yml` has **no deploy
  job for either stack** — nobody added the corresponding CI/CD job when the CDK
  code was written, so both are code-complete and entirely undeployed, in ci and
  prod alike. This is real new work, not a redeploy: add two jobs to
  `deploy-environment.yml` following the existing per-stack pattern (see
  `deploy-analytics`/`deploy-billing-webhook` for the template — env-level Docker
  image build + `cdk deploy <env>-env-<Stack> --exclusively`), for
  `SecurityDetectionStack` (alarm-only, likely no Docker image needed) and
  `ScanDetectionStack` (has its own Lambda, likely needs one). Verified live in ci
  (all via read-only/non-destructive checks): 9.1 (sensitive-path WAF rule +
  logging) and 9.3 (manual block list) both pass; 9.3's salt-secret resource
  policy, the security-state table, and `bundleGet`'s IAM all pass; the bundle
  burst-load test was deliberately not attempted — needs a decision on how to run
  it safely (real authenticated user, could look like abuse) rather than
  improvising one. The `CloudFront-Viewer-Country` header is confirmed wired into
  ci's origin request policy but not confirmed reaching the authorizer (no recent
  invocations in its log group to check).

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
- **Prod orphan purge** — cutover confirmed live (`prod-52127a0`), tearing down
  the four orphaned deployments now. See the open-item bullet above.
- **Wave 2: live-verification agents** (dispatched 2026-09-02, running
  concurrently with the purge — all read-only or ci-scoped, no CloudFront
  writes, so no collision risk): B30's composite alarms checked read-only
  against live `prod-52127a0`; B14's phases 2-4 verified for real in ci
  (real Lambda invoke, real state machine execution, real Athena queries);
  B28's issue-9/issue-10 resources confirmed deployed in ci, with the burst-test
  step explicitly deferred to the coordinator's judgement rather than attempted
  ad hoc.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
