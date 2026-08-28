# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## In flight (dispatched 2026-08-28)

| Track | Items | Model | Worktree / branch | Status |
|---|---|---|---|---|
| backup-wiring | B25 remainder | Opus | `claude/b25-backup-wiring` | code complete, PR #46 awaiting merge |
| wp1-firehose-spike | B13a (WP-1 of `PLAN_USAGE_DATA_PIPELINE.md`) | Opus | `claude/pipeline-batch-1` | code complete, PR #47 awaiting merge |
| wp3-parquet | B13 WP-3 | Sonnet | `claude/pipeline-batch-2` | code complete, PR #48 (stacked on #47) |
| wp4-table-changes | B13 WP-4 | Sonnet | `claude/pipeline-batch-3` | code complete, PR #49 (stacked on #48) |
| wp9-stripe | B14 WP-9 | Sonnet | `claude/pipeline-batch-3` | code complete, PR #49 (stacked on #48) |
| wp11-cloudfront-logs | B14 WP-11 | Sonnet | `claude/pipeline-batch-3` | code complete, PR #49 (stacked on #48) |
| wp5-data-quality | B13 WP-5 | Sonnet | merged to `claude/pipeline-batch-4` (`../.worktrees/submit-batch4`, off batch-3) | code complete |
| wp6-views | B13 WP-6 | Sonnet | merged to `claude/pipeline-batch-4` | code complete |
| wp7-dashboard | B13 WP-7 | Sonnet | merged to `claude/pipeline-batch-4` | code complete |
| wp10-ga4 | B14 WP-10 | Sonnet | merged to `claude/pipeline-batch-4` | code complete |
| activity-hashed-sub | B13 WP-6 remainder (missing `hashedSub` on three activity events) | Sonnet | `../.worktrees/submit-hashedsub` / `claude/activity-hashed-sub` (off batch-3) | started |
| wp8-ingestion | B14 WP-8 | Sonnet | `claude/pipeline-batch-2` | code complete, PR #48 (stacked on #47) |
| wp2-dynamodb-streams | B13 WP-2 | Sonnet | `claude/pipeline-batch-1` | code complete, PR #47 awaiting merge |

Landed: pipeline-design → `PLAN_USAGE_DATA_PIPELINE.md` (4ead1ed2). Batch branch
`claude/pipeline-batch-1` is PR #47; `claude/pipeline-batch-2` (WP-3, WP-8) stacks on it. WP-3 cut
the single delivery stream over to Parquet under `curated/` with a union view and a synth-date
cutover, rather than a second parallel prefix; WP-2 needed two custom
resources per table (CDK forbids `getResponseField` on a call that ignores errors), so
DataStack's `Custom::AWS` count is 38, not the plan's 34. Next waves in plan
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
- [ ] **(B13a) Firehose spike on one stream.** Code complete in PR #47
  (AnalyticsStack, transform Lambda, Glue table, Athena workgroup, verify script).
  Remaining: merge, ci deploy, `AWS_PROFILE=submit-ci scripts/verify-analytics-pipeline.sh ci`
  passes, and the measured 14-day event volume written into section 4 of the plan.
  Surfaced en route: `main` is not Spotless-clean (`spotless:check` binds to `install`,
  not `verify`; six files drift); `deploy-billing-webhook` lacks `needs: deploy-ecr`;
  `npx eslint` crashes on `app/lib/activityAlert.js` via `eslint-plugin-sonarjs`.
- [ ] **(B13) Usage data pipeline.** Firehose from activity events/DynamoDB streams to
  partitioned Parquet on S3, Glue catalog and data quality, Athena, dashboard. Starts
  once B13a has landed. Design surfaced two remainders: `OpsStack` `ActivityEmailProofRule`
  emails every activity event via the alert topic (`OpsStack.java:191`), which caps bus
  volume; decide whether it stays before WP-4 adds table change records. The CloudFront
  access-log bucket lives in the per-deployment `EdgeStack` (`EdgeStack.java:414`) so
  history dies with each release; WP-11 moves it to the env stack. WP-4 (table change
  records for receipts, bundles, subscriptions, passes with per-table whitelists) is on
  `claude/pipeline-batch-3`; it found the plan's per-table field lists did not match the real
  item shapes and followed the items. Remaining for B13: a fix WP-6 surfaced (in flight as activity-hashed-sub):
  `cognitoTokenPost.js:96`, `hmrcVatReturnPost.js:1001` and `sessionBeaconPost.js:64`
  publish activity events without `hashedSub` (only the failure path attaches it), so
  `v_active_users_daily`, `v_login_to_submission_funnel` and the `submitters` column of
  `v_submissions_daily` return nothing until those three calls pass it.
- [ ] **(B14) Scheduled ingestion jobs.** GA4 export, Stripe reconciliation, CloudFront
  logs, orchestrated with Step Functions/EventBridge. Lands revenue and funnel in the
  same queryable place as B13. WP-8 (IngestionStack skeleton: `registerScheduledJob`
  with retries, DLQ and two alarms per job, `deploy-ingestion` job) is code complete on
  `claude/pipeline-batch-2`. WP-10 (GA4 Data API pull, three Glue tables) is on `claude/pipeline-batch-4`;
  operator creates the `GA4_SERVICE_ACCOUNT_JSON` GitHub environment secret (ci and prod)
  from a GCP service-account key and grants that account Viewer on GA4 property 523400333.
  WP-9 (nightly Stripe reconciliation, three Glue tables) and WP-11 (env access-log bucket, v2 Parquet log
  delivery per EdgeStack, `cloudfront_requests` table) is on `claude/pipeline-batch-3`;
  the first deploy after it lands deletes each deployment's old per-deployment log bucket.
  Plan correction pending: WP-8's text says the retry/DLQ shape matches
  `AccountStack.java:832`; that rule has neither, only the Rule + LambdaFunction skeleton.
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
