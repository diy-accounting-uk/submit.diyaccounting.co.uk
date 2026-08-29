# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-8fe61f8 (PRs #46, #47 and #50; live and last-known-good since
2026-08-29 08:15 UTC).** `prod-env-AnalyticsStack` and `prod-env-IngestionStack` exist and the
lake is receiving events.
PITR is ENABLED on all 11 prod tables. Issues #4, #5, #6, #7, #8 are closed. Drift findings
live in issue #43.

- [ ] **(B25 remainder) Cross-account copy jobs and the restore test.** Code merged (#46).
  1. Operator: enable cross-account backup for the organisation. Management account
     887764105431, AWS Backup console, Settings, Cross-account backup, Enable. Confirmed
     2026-08-29: the nightly copy jobs already run and fail with "Cross-account copy
     feature is not enabled for the current organization"; nothing else blocks them.
  2. Operator: first deploy of the backup account stacks from a host terminal (the workflow
     assumes a role the stack itself creates):
     `aws sso login --sso-session diyaccounting`, `export AWS_PROFILE=submit-backup
     CDK_DEFAULT_ACCOUNT=914216784828 CDK_DEFAULT_REGION=eu-west-2`,
     `npx cdk bootstrap aws://914216784828/eu-west-2`,
     `./mvnw --errors clean verify -DskipTests -P cdk-backup`,
     `cd cdk-backup && npx cdk deploy --all --require-approval never`.
     Do not run `scripts/aws-accounts/bootstrap-account.sh` against this account; if it has
     been run, delete `backup-github-actions-role`, `backup-deployment-role` and the OIDC
     provider first.
  3. Claude Code: after the next daily backup, confirm a copy exists in
     `submit-cross-account-vault` (`aws --profile submit-backup backup list-recovery-points-by-backup-vault`).
  4. Either: dispatch `restore-test.yml` and confirm both legs pass (scheduled for the 1st
     of each month, 05:00 UTC). This is the gate for the TypeScript migration (B33).
  Surfaced en route, still open: `scripts/validate-workflows.sh:29` exits 1 with no output
  on any actionlint finding; `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` still says
  PITR is off.
- [ ] **(B13a) Firehose spike on one stream.** Code merged (#47, #50).
  1. Done on ci 2026-08-29: the synthetic event landed as Parquet, `activity_events_all`
     returns the day's events by type, all eight views execute. The script's own partition
     check reported a false FAIL (pipe bug, fixed and merged in #51). Claude Code: repeat
     with `prod` once the #51 deploy lands.
  2. Done: 14-day volume measured (mean 141 events/day, peak 454) and recorded in
     section 4 of `PLAN_USAGE_DATA_PIPELINE.md`.
- [ ] **(B13) Usage data pipeline.** Code merged (#50): DynamoDB streams and change records,
  Parquet conversion, Glue Data Quality, eight business views, metrics publisher and the
  `{env}-env-analytics` dashboard.
  1. Both ci jobs failed their first runs on IAM reads (the runner lacked `glue:GetTable`
     on the catalog, the publisher lacked `s3:GetBucketLocation` on the results bucket);
     fixed in #51. Invoked by hand on ci after that deploy: the runner now starts its
     Glue run but the evaluation session lacked reads on its own ruleset, and the publisher
     gave up on a 10 s poll budget against 7 to 11 s views; both fixed in PR #52. Claude
     Code: invoke both jobs on ci once #52 deploys, then confirm a data-quality result exists and `Submit/Analytics` metrics and the
     dashboard show data. EventBridge's DLQs stay empty on Lambda runtime errors; the
     Lambda-errors alarms are the signal.
  2. Operator: decide whether `OpsStack`'s `ActivityEmailProofRule` (`OpsStack.java:191`)
     stays. It emails every activity event through the alert topic; keep, sample, or drop.
  Deviations worth knowing at review: the delivery stream cut over to Parquet with a union
  view and a synth-date cutover instead of a second prefix; the table change whitelists
  follow the real item shapes, not the plan's field lists.
- [ ] **(B14) Scheduled ingestion jobs.** Code merged (#50): IngestionStack, nightly Stripe
  reconciliation (02:15 UTC prod, weekly ci), GA4 Data API pull (03:15 UTC prod, weekly ci),
  CloudFront access logs in the catalog.
  1. Operator: the GA4 Data API is authenticated with a Google Cloud service account (GA4's
     own admin UI cannot issue API credentials; no GCP compute or billing is involved). In
     the Google Cloud console pick or create a free project, enable the "Google Analytics
     Data API" (APIs & Services, Library), then IAM & Admin, Service Accounts, create one,
     Keys, Add key, JSON. In GA4 Admin, Property Access Management, grant that account's
     email Viewer on property 523400333. Create the GitHub environment secret
     `GA4_SERVICE_ACCOUNT_JSON` in both the `ci` and `prod` environments with the key
     JSON. Deploys skip the secret step until it exists; the GA4 job fails at first
     invocation until then.
  2. CloudFront v2 log delivery confirmed on ci 2026-08-29 (objects under
     `raw/cloudfront/distributionid=…/year=…/month=…/day=…/`). Claude Code: after the first
     scheduled runs (ci: Monday 2026-08-31 02:15 and 03:15 UTC), confirm rows in
     `stripe_charges` and `ga4_traffic` through Athena, and `cloudfront_requests` now.
  3. Claude Code: correct WP-8's text in `PLAN_USAGE_DATA_PIPELINE.md`, which says the
     retry/DLQ shape matches `AccountStack.java:832`; that rule has neither.
  The first app deploy after #50 deletes each deployment's old per-deployment CloudFront
  log bucket with its remaining history.
- [ ] **(B9/B9a) Fix the support@ Gmail auto-reply.** Operator, Gmail settings for
  support@diyaccounting.co.uk, Vacation responder / auto-reply: replace the dead GitHub
  link with `https://github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/issues`,
  and restrict the responder so it does not reply to automated senders (at least
  `*@amazonses.com`, `notifications@github.com`, `no-reply@sns.amazonaws.com`); a
  "contacts only" or filter-based responder both work.
- [ ] **(B19) Analytics console work.** Operator.
  1. GA4 (property 523400333): Admin, Data export, link BigQuery and turn on the daily
     export; Admin, Events, mark `purchase` and `begin_checkout` as key events; Admin, Data
     streams, remove the old stream `G-PJPVQWRWJZ`.
  2. Google Ads: check whether the remarketing campaigns for conversion ID 1065724931 are
     still running; pause them or remove the tag from the sites.
  3. Stripe dashboard: Reports, schedule a monthly balance report by email.
  CloudFront logging is already live. History cannot be backfilled.
- [ ] **Watch the first weekly scheduled runs since the 2026-08-24 restart.** Claude Code:
  `compliance` and `codeql` run Sunday 2026-08-30, `stack-drift` Monday 2026-08-31 06:00 UTC
  (first run with the noise filter). Daily schedules are firing and `verify-backups` is
  green. Investigate if any is not green.
- [ ] **Keep-alive for scheduled workflows.** GitHub disables schedules after 60 days
  without repo activity, which is what stopped automation in July. Nothing guards
  against a repeat yet.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
