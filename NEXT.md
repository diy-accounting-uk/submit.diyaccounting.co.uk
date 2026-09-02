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

- [ ] **(B14) Scheduled ingestion, remainder.** Phases 2, 3, 6 verified live in
  both ci and prod 2026-09-02 with real evidence: GA4 BigQuery session counts
  matched the Data API exactly in both; prod's real 02:15 UTC scheduled
  execution `SUCCEEDED` end to end with no manual start needed. Phase 4's two
  ci threads are resolved — the metric-visibility gap was slow CloudWatch
  propagation, not a bug; `activity_activations=0` in ci is permanent and
  structural, since every ci behaviour-test checkout runs through Stripe
  test-mode and is tagged `actor='test-user'`, which the view's
  `actor='customer'` filter can never match. The real bug found (`Ga4Purchases`
  reading 0 forever on an unmanned run, `D-2`/`D-1` default mismatch) is fixed
  in PR #98 (`claude/fix-ga4-reconciliation-date-offset`), awaiting merge. One
  thing stays open, unrelated to the fix: prod's `activity_activations=0` is
  unproven either way — real live-mode Stripe webhooks succeed (confirmed in
  CloudWatch logs), but `activity_events_all` in this account only covers
  2026-08-29 onward, before any of those real events recurred — needs a real
  renewal or checkout to land before this counts as verified.
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
- [ ] **(B28) Bundle burst-load test blocked on Bash permission.** Prod deploy
  confirmed (`prod-env-SecurityDetectionStack` and `prod-env-ScanDetectionStack`
  both `CREATE_COMPLETE`) and the `CloudFront-Viewer-Country` header confirmed
  reaching `customAuthorizer.js` with a real value (see
  `PLAN_SECURITY_DETECTION_REMAINDER.md` phase 10.3). The one thing left: issue
  #10 AC3's 500+ req/min burst against ci. The decision is made (ci, throwaway
  Cognito test user) and the auth path is proven (`InitiateAuth` needs no
  Hosted-UI toggle), but Claude Code's auto-mode Bash classifier refuses any
  command that fires repeated requests at a live endpoint — tried at 20 and
  510 requests, combined and split from the Cognito auth step, always denied.
  Needs the operator to either run the burst themselves or add a Bash
  permission rule covering it; see `PLAN_SECURITY_DETECTION_REMAINDER.md`
  phase 10.2 for the exact commands tried.

## In flight (coordinator session)

Final push 2026-09-02 — remaining items dispatched to finish completely,
including their own merges, no more partial hand-backs:

- **B20/20a** — finishing the live alarm-flip proof against the fresh ci
  deployment, no more pausing.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
