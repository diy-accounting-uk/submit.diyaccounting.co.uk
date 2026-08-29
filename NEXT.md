# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

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
  the TypeScript migration (B33). PR #46 is merged. Remaining: operator enables
  cross-account backup in the management account and bootstraps the backup account from a
  host shell (`PLAN_CROSS_ACCOUNT_BACKUPS.md`); first `restore-test` run passes both legs.
  Surfaced en route: `scripts/validate-workflows.sh:29` exits 1 with no output on any
  actionlint finding (`set -e` plus command substitution), and
  `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` still says PITR is off.
- [ ] **(B13a) Firehose spike on one stream.** PRs #47 and #50 are merged
  (AnalyticsStack, transform Lambda, Glue table, Athena workgroup, verify script).
  Remaining: `AWS_PROFILE=submit-ci scripts/verify-analytics-pipeline.sh ci`
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
  item shapes and followed the items. All packages are merged (#47, #50), including the
  `hashedSub` fix WP-6 surfaced. Remaining: merges, ci deploy, the verify script and the views
  returning rows, the data-quality run and metrics publisher succeeding once, the dashboard
  showing data.
- [ ] **(B14) Scheduled ingestion jobs.** All merged in #50: the
  IngestionStack skeleton (WP-8), nightly Stripe reconciliation (WP-9), GA4 Data API pull
  (WP-10), CloudFront access logs in the catalog (WP-11). Remaining: merges and a ci deploy;
  the operator creates the `GA4_SERVICE_ACCOUNT_JSON` secret in the ci and prod GitHub
  environments from a GCP service-account key and grants that account Viewer on GA4 property
  523400333; each of the three jobs completes one scheduled run with rows queryable in Athena.
  The first app deploy after WP-11 lands deletes each deployment's old per-deployment log
  bucket. Plan correction pending: WP-8's text says the retry/DLQ shape matches
  `AccountStack.java:832`; that rule has neither.
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
