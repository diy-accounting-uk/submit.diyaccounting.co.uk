# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-31dfaaf (PRs #46, #47, #50, #51, #52; live and last-known-good
since 2026-08-29 12:40 UTC).** `prod-env-AnalyticsStack` and `prod-env-IngestionStack` exist and the
lake is receiving events.
PITR is ENABLED on all 11 prod tables. Issues #4, #5, #6, #7, #8 are closed. Drift findings
live in issue #43.

- [ ] **(B25 remainder) Cross-account copy jobs and the restore test.** Code merged (#46).
  1. Done 2026-08-29 13:05 UTC: cross-account backup enabled for the organisation from
     the management account (`isCrossAccountBackupEnabled: true`). Claude Code: confirm
     tonight's copy jobs succeed and a recovery point appears in the cross-account vault.
  2. Done 2026-08-29 20:25 UTC: backup account bootstrapped from a host terminal (both
     stacks deployed; OIDC provider and the three roles exist). The commands, for the record
     of what ran:
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
  4. `setup-backup-account.yml` ran unattended and passed 2026-08-29 20:35 UTC.
     `restore-test.yml` (run 33270859888) restored prod-env-receipts into a temporary table
     with 4,723 of the live table's 4,751 items (the rest written since the 03:15 backup)
     and deleted it, then failed its own count comparison on paginated scan output (fixed,
     #55). Re-run 33277478615 passed end to end on the prod leg; the cross-account leg
     reports skipped until tonight's first copy lands. Claude Code: after 2026-08-30's copy,
     dispatch it once more and confirm both legs pass; the cross-account leg of the restore
     test needs tonight's copy first. The restore test is the gate for the TypeScript
     migration (B33).
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
- [ ] **(B13) Usage data pipeline.** Code merged (#50, #51, #52); the ci fixes covered job IAM reads, SHA-tagged env Lambda images (a fixed tag left functions
  on their first image), a 90 s Athena poll budget, and partition registration before each
  Glue Data Quality run (Glue reads catalog partitions, not Athena projection). On ci with
  #52 deployed: the evaluation run scores 1.0 (12 of 12 rules) and the publisher completes
  all ten queries, publishing nothing because ci has no customer rows.
  1. Verified on prod 2026-08-29 after the #52 deploy, by invoking both jobs: the data
     quality run scores 1.0 (12 of 12), the publisher completes all ten queries in 88 s,
     table changes land under `curated/tables/<table>/` (285 records through the four
     streams in the first six hours), CloudFront logs land under `raw/cloudfront/`, and
     every login and submission event carries `hashed_sub`. The publisher published nothing
     because its target date (yesterday) predates the lake. Claude Code: after the
     2026-08-30 05:00 UTC run, confirm `Submit/Analytics` metrics exist and the
     `prod-env-analytics` dashboard shows them. EventBridge's DLQs stay empty on Lambda
     runtime errors; the Lambda-errors alarms are the signal. Surfaced: prod's
     `hmrc-token-exchanged` customer events carry no `hashed_sub` (the call site was not
     among the three fixed); no `new-session` events reached prod today, worth a look when
     `v_traffic_by_country_daily` stays empty.
  2. Done: `OpsStack`'s `ActivityEmailProofRule` dropped (#53).
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
- [ ] **Sign-in button dead before the login page's scripts load.** Investigated 2026-08-29
  from the failed prod runs' traces: the "Hosted UI form not found" failures never reached
  Cognito. `web/public/auth/login.html` renders the sign-in button before the eight
  blocking scripts that precede the inline handler have loaded, so an early click does
  nothing, and the test's retry loop reloaded the app page and waited for a Cognito form
  that could not appear. Fix on `claude/hosted-ui-form`: the behaviour login step waits for
  the handler before clicking and for the origin to change after it, with failure messages
  that name the page; the button now ships `disabled` and is enabled when wired, which
  closes the same gap for real users. Merged (#54). Remaining: the next scheduled prod
  deploy passing every suite.
- [ ] **Clear the stale prod deployments and merged branches.** Audited 2026-08-29: prod
  holds nine app deployments because `destroy previous` runs only after every behaviour
  suite passes, and the sign-in race failed one suite on each deploy for four days. Once
  the #54 deploy (prod-929d6af) is live, only it should remain; the rest (prod-7f188b7,
  8c12b18, af7eab7, 5570316, 8fe61f8, d411b61, 64fb844, 31dfaaf, 075cc43) are each eight
  stacks, 31 Lambdas with five provisioned-concurrency units, a distribution and a WAF
  ACL. Operator authorised seven on 2026-08-29 (prod-7f188b7, 8c12b18, af7eab7, 5570316,
  8fe61f8, d411b61, 64fb844); being deleted directly with `cloudformation delete-stack` in
  the workflow's order (the origin bucket has to be emptied before EdgeStack goes), which
  is the approach for stale ci and prod deployments from now on. Claude Code: confirm all
  seven are gone, then delete prod-31dfaaf and prod-075cc43 once prod-929d6af is live and
  last-known-good; tidy the API Gateway custom domains the throttled deletes left behind.
  Twenty orphaned log groups from four long-destroyed deployments (`prod-2078c71`,
  `prod-e1af480`, `prod-db95ffc`, `prod-c66bf01`) can go in the same sweep. Branches: all
  15 `origin/claude/*` are merged; all 33 local `claude/*` are merged (one holds a
  duplicate of a main commit); five stashes from April sit on branches that no longer
  exist; the archived `antonycc` fork is still configured as a remote. Operator: delete
  the branches (`git branch --merged main`), review and drop the stashes, `git remote
  remove antonycc`. ci is clean.
- [ ] **Keep-alive for scheduled workflows.** GitHub disables schedules after 60 days
  without repo activity, which is what stopped automation in July. Nothing guards
  against a repeat yet.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
