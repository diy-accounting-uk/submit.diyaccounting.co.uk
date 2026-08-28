# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## In flight (dispatched 2026-08-28)

| Track | Items | Model | Worktree / branch | Status |
|---|---|---|---|---|
| backup-wiring | B25 remainder | Opus | `claude/b25-backup-wiring` | code complete, PR #46 awaiting merge |
| wp1-firehose-spike | B13a (WP-1 of `PLAN_USAGE_DATA_PIPELINE.md`) | Opus | `../.worktrees/submit-wp1` / `claude/wp1-firehose-spike` | started |
| wp2-dynamodb-streams | B13 WP-2 | Sonnet | `../.worktrees/submit-wp2` / `claude/wp2-dynamodb-streams` | started |

Landed: pipeline-design → `PLAN_USAGE_DATA_PIPELINE.md` (4ead1ed2). Next waves in plan
order: WP-3 and WP-8 after WP-1; WP-4..7 after WP-3; WP-9..11 after WP-8.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning.

**Batches 1 and 2 are live in prod (deployment prod-af7eab7, verified 2026-08-28).**
PITR is ENABLED on all 11 prod tables. Issues #4, #5, #6, #7, #8 are closed. Drift
findings live in issue #43.

- [ ] **(B25 remainder) Wire cross-account copy jobs and the restore test.** The vault is
  LIVE (deployed 2026-08-26 with operator approval: `submit-cross-account-vault` in
  914216784828, KMS-encrypted, copy-in restricted to the prod/ci backup roles, deletion
  denied from outside the account). Remaining: point BackupStack's copy jobs at it, add
  passes/subscriptions to the backup selection, create `backup-github-actions-role` so
  `setup-backup-account.yml` runs unattended, then the monthly restore test — which gates
  the TypeScript migration (B33). Code is in PR #46. Remaining: merge; operator enables
  cross-account backup in the management account and bootstraps the backup account from a
  host shell (`PLAN_CROSS_ACCOUNT_BACKUPS.md`); first `restore-test` run passes both legs.
  Surfaced en route: `scripts/validate-workflows.sh:29` exits 1 with no output on any
  actionlint finding (`set -e` plus command substitution), and
  `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` still says PITR is off.
- [ ] **(B13a) Firehose spike on one stream.** Activity events to date-partitioned S3,
  queried with Athena. One table, no Glue quality rules, no dashboard. Proves delivery,
  IAM and cost shape before B13 commits the lake design.
- [ ] **(B13) Usage data pipeline.** Firehose from activity events/DynamoDB streams to
  partitioned Parquet on S3, Glue catalog and data quality, Athena, dashboard. Starts
  once B13a has landed. Design surfaced two remainders: `OpsStack` `ActivityEmailProofRule`
  emails every activity event via the alert topic (`OpsStack.java:191`), which caps bus
  volume; decide whether it stays before WP-4 adds table change records. The CloudFront
  access-log bucket lives in the per-deployment `EdgeStack` (`EdgeStack.java:414`) so
  history dies with each release; WP-11 moves it to the env stack.
- [ ] **(B14) Scheduled ingestion jobs.** GA4 export, Stripe reconciliation, CloudFront
  logs, orchestrated with Step Functions/EventBridge. Lands revenue and funnel in the
  same queryable place as B13.
- [ ] **(B9/B9a) Fix the support@ Gmail auto-reply.** Dead GitHub link (point at
  `github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/issues`) and the sender
  filter that replies to SNS/GitHub notifications. Operator action in Gmail settings.
- [ ] **(B19) Analytics console work.** Turn on GA4 export and a scheduled Stripe report;
  mark GA4 conversions; retire the old stream and stale remarketing tag. Operator console
  actions. CloudFront logging is already live. History cannot be backfilled.
- [ ] **Watch the first weekly scheduled runs since the 2026-08-24 restart.** Daily
  schedules are firing and `verify-backups` is green (2026-08-27, 2026-08-28) with the
  corrected vault name and PITR on. Still to see: `stack-drift` on Monday 2026-08-31
  (first run with the noise filter), `compliance` and `codeql` on Sunday 2026-08-30.
  Investigate if any is not green.
- [ ] **Keep-alive for scheduled workflows.** GitHub disables schedules after 60 days
  without repo activity, which is what stopped automation in July. Nothing guards
  against a repeat yet.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
