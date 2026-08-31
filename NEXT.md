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

- [ ] **(B30) Alarm-count audit, remainder.** `REPORT_ALARM_AUDIT.md` holds the
  source-read audit (~163 alarms per environment, ~$29/month, against AWS_COSTS.md's
  ~20-alarm assumption). Open: the live fired-vs-never-fired check (needs SSO);
  apply cut 1 (ApiStack duplicate per-route error alarms) and cut 2 (OpsStack
  unfiltered account-wide alarm EventBridge rule) — in flight; composite-alarm
  consolidation (cut 3) needs a design pass before any code.
- [ ] **(B32b) Read-endpoint gating, remainder.** Both endpoints turned out to be
  gated already via `enforceBundles`; the missing 403-path tests are on the batch
  branch. Open: `app/services/hmrcApi.js` returns 500 for `BundleAuthorizationError`
  instead of an auth status (fix in flight), and the `prod-env-hmrc-api-requests`
  usage scan (needs `aws sso login --sso-session diyaccounting`).
- [ ] **(B14) Scheduled ingestion, remaining phases** — `PLAN_SCHEDULED_INGESTION.md`
  is the plan of record; the pipeline itself is largely shipped. Phases: 1 prove the
  shipped pipeline (needs SSO), 2 GA4 BigQuery event export (operator prereqs listed
  in the plan: Google Cloud project name, dataset location, service-account grants,
  export retention), 3 Step Functions orchestration, 4 reconciliation views, 5 stop
  the duplicate CloudFront classic logging (in flight), 6 Stripe restricted keys
  (operator).
- [ ] **(B20/20a) Ops alerting uplift, remainder** — the alarm→GitHub-issue Lambda is
  on the batch branch. Operator: create a fine-grained PAT (Issues read/write on this
  repo only) and set it as GitHub Actions secret `GITHUB_ISSUE_BOT_TOKEN` in the ci
  and prod environments. Then the end-to-end proof at deploy time (set-alarm-state on
  a cheap ci alarm → issue appears → second flip comments, not duplicates), then the
  B20 fan-out with dedup. Adjacent gap surfaced: `supportTicketPost.js`'s GitHub
  wiring is dormant — `GITHUB_TOKEN_SECRET_ARN` is never provisioned by any workflow,
  so support-ticket-to-issue is wired in code but never deployed.
- [ ] **(B25) Cross-account backups, operator steps only** — the CDK, selection, role,
  and monthly restore-test workflow are all on main. Remaining: enable cross-account
  backup at the AWS Organization level, first deploy of the backup-account stacks with
  the `submit-backup` SSO profile, then the first manual `restore-test.yml` dispatch
  (the gate for the TypeScript CDK migration, B33).
- [ ] **(B28) Scan and data-theft detection alarms** (issues #9, #10) — build
  `SecurityDetectionStack` per `plans/issues/PLAN_ISSUE_9_scan_detection.md` and
  `PLAN_ISSUE_10_data_theft_detection.md`, wired to the existing
  `securityFindingsTopic`; merge after the OpsStack rule fix (B30 cut 2).

## In flight (batch dispatched 2026-08-31, coordinator session)

- batch branch `claude/do-next-batch-1` (backups IAM scoping, endpoint gating tests,
  vitest worktree exclusion, hmrcApi 401 fix, alarm→GitHub-issue Lambda): full local
  validation then PR
- wave 2, worktrees off the batch branch: alarm-cuts track (B30 cuts 1+2), detection
  track (B28), CloudFront-logging track (B14 phase 5)

## Discipline

(none repo-specific yet — see `../NEXT.md`)
