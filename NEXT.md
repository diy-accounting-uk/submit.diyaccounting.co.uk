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

Final push 2026-09-02 — all four remaining items dispatched to finish completely,
including their own merges, no more partial hand-backs:

- **B14** — resolving both open phase-4 threads (the metric-visibility anomaly,
  the `activity_activations=0` signal), then repeating the whole verification
  in prod, which is live and current for the first time today.
- **B20/20a** — finishing the live alarm-flip proof against the fresh ci
  deployment, no more pausing.
- **B28** — confirming prod deployment, running the bundle burst-load test for
  real against ci (decision made: ci, test user, not prod), confirming
  `CloudFront-Viewer-Country` reaches the authorizer.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
