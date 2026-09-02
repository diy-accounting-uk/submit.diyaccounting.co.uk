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

- [ ] **`set-last-known-good-deployment` should depend on `set-origins`, not
  just `web-test`**, in `deploy.yml`. Found 2026-09-02: three EdgeStack bugs
  blocked `deploy-edge`/`set-origins` on every prod deploy for hours while SSM's
  pointer kept advancing anyway (it only needs tests to pass), so prod served a
  stale deployment while SSM claimed otherwise. All three bugs are fixed and
  prod is confirmed correctly cut over and cleaned up now — this item is just
  the pipeline fix so the same class of drift can't recur.
- [ ] **(B14) Scheduled ingestion, live behaviour** — phases 2, 3, 6 verified
  live in ci 2026-09-02 with real evidence: phase 2's BigQuery-derived session
  count matched GA4's own Data API count exactly (12=12); phase 3's real state
  machine execution `SUCCEEDED` end to end; phase 6 rode along inside it. Phase
  4 partial: `v_purchase_reconciliation_daily` returns rows correctly, but two
  things need attention — `activity_activations` reads 0 across the last 14
  days despite non-zero Stripe charges (matches the "webhook path broke" signal
  the view's own design doc names; may be a ci-only synthetic-charge artifact,
  not yet distinguished), and the three new CloudWatch metrics show zero
  datapoints via `GetMetricData` despite clean publish logs and being listed
  "recently active" — a pre-existing metric published in the same Lambda
  invocation at the same timestamp WAS queryable within minutes, so this isn't
  a code difference found yet. Re-check the metrics in an hour or two before
  concluding it's stuck rather than slow. Once phase 4 settles: repeat the
  whole verification in prod, which is now also live and current for the first
  time today.
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
- [ ] **(B28) Scan and data-theft detection, remainder.** The deploy-job gap
  (`SecurityDetectionStack`/`ScanDetectionStack` had no `deploy-environment.yml`
  job at all) is fixed and merged to main 2026-09-02 (`2c6633a3`), verified live
  end to end in ci: both stacks `CREATE_COMPLETE`, the salt-read alarm exists, a
  real scheduled invocation of the 404-rate Lambda observed in logs. That merge
  will auto-deploy to prod — confirm both stacks land there too. Still open
  beyond the deploy gap: the bundle burst-load test needs a decision on how to
  run it safely (real authenticated user, could look like abuse) rather than
  improvising one; the `CloudFront-Viewer-Country` header is confirmed wired
  into ci's origin request policy but not confirmed reaching the authorizer (no
  recent invocations in its log group to check yet).

## In flight (coordinator session)

Wave 1 dispatched 2026-09-01, coordinator merges and pushes each landed piece:

- **B30** — merged and fully live-verified, including the `AnalyticsStack` gap
  fix (both Lambdas' composite alarms now confirmed present in prod). Done.
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
- **Prod orphan purge** — done. All four orphaned deployments
  (`prod-9050bb5`, `prod-a994f29`, `prod-40fc40a`, `prod-ccd8b3e`) torn down;
  independently re-verified after the fact (not just trusting the sub-agent's
  own report): only `prod-52127a0`'s stacks remain, CloudFront and SSM both
  still agree, live site returns HTTP 200.
- **Wave 2: live-verification agents** — B30 fully done. B14's state-machine
  execution result still pending, see the open-item bullet above.
- **B28 deploy-gap design fork** — done. `PLAN_SECURITY_DETECTION_DEPLOY_GAP.md`
  on branch `claude/b28-deploy-gap-design` (unmerged): `SecurityDetectionStack`
  is alarm-only, gets the simple `deploy-cdk-stack.yml` template, no Docker;
  `ScanDetectionStack` needs its own full Docker build (confirmed no job in this
  file reuses another's image, even when they share the same base `Dockerfile`).
  Implementation agent follows, on its own branch, ci-verified before merge.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
