# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-1c556ed (main through #56), the only app deployment in the
account.** PITR is ENABLED on all 11 prod tables. Drift findings live in issue #43.

- [ ] **(B25 remainder) Cross-account copy jobs and the restore test.** Everything is in
  place: org switch on, backup account bootstrapped, `setup-backup-account.yml` runs
  unattended, `restore-test.yml` passes on the prod leg.
  1. Claude Code: after the 2026-08-30 backup window (02:20 to 03:30 UTC), confirm the copy
     jobs succeed and a recovery point appears in `submit-cross-account-vault`
     (`aws --profile submit-backup backup list-recovery-points-by-backup-vault`), then
     dispatch `restore-test.yml` and confirm both legs restore. That pass is the gate for the
     TypeScript migration (B33).
  2. Claude Code: `scripts/validate-workflows.sh:29` exits 1 with no output on any actionlint
     finding; `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` still says PITR is off.
- [ ] **(B13a) Firehose spike on one stream.** Verified on ci. Claude Code: run
  `AWS_PROFILE=submit-prod scripts/verify-analytics-pipeline.sh prod`.
- [ ] **(B13) Usage data pipeline.** Verified on ci and prod (data quality 1.0, publisher
  completes, table changes and CloudFront logs landing, `hashed_sub` on login and
  submission events).
  1. Claude Code: after the 2026-08-30 05:00 UTC run, confirm `Submit/Analytics` metrics
     exist and the `prod-env-analytics` dashboard shows them. EventBridge's DLQs stay empty
     on Lambda runtime errors; the Lambda-errors alarms are the signal.
  2. Claude Code: `hmrc-token-exchanged` events carry no `hashed_sub`
     (`app/functions/hmrc/hmrcTokenPost.js:117`, the fourth call site); no `new-session`
     events reached prod on 2026-08-29, worth a look if `v_traffic_by_country_daily` stays
     empty.
  Deviations worth knowing at review: the delivery stream cut over to Parquet with a union
  view and a synth-date cutover instead of a second prefix; the table change whitelists
  follow the real item shapes, not the plan's field lists.
- [ ] **(B14) Scheduled ingestion jobs.** Stripe (02:15 UTC prod, Monday ci), GA4 (03:15 UTC
  prod, Monday ci) and CloudFront logs are deployed; CloudFront logs verified on ci.
  1. Operator: the GA4 Data API is authenticated with a Google Cloud service account (GA4's
     own admin UI cannot issue API credentials; no GCP compute or billing is involved). In
     the Google Cloud console pick or create a free project, enable the "Google Analytics
     Data API" (APIs & Services, Library), then IAM & Admin, Service Accounts, create one,
     Keys, Add key, JSON. In GA4 Admin, Property Access Management, grant that account's
     email Viewer on property 523400333. Save the key file locally and give Claude Code its
     path; it sets `GA4_SERVICE_ACCOUNT_JSON` in the `ci` and `prod` GitHub environments.
     Deploys skip the secret step until it exists; the GA4 job fails at first invocation
     until then.
  2. Claude Code: after the first scheduled runs (prod nightly; ci Monday 2026-08-31),
     confirm rows in `stripe_charges` and `ga4_traffic` through Athena.
  3. Claude Code: correct WP-8's text in `PLAN_USAGE_DATA_PIPELINE.md`, which says the
     retry/DLQ shape matches `AccountStack.java:832`; that rule has neither.
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
- [ ] **Watch the first weekly scheduled runs since the 2026-08-24 restart.** Claude Code:
  `compliance` and `codeql` run Sunday 2026-08-30, `stack-drift` Monday 2026-08-31 06:00 UTC
  (first run with the noise filter). Investigate if any is not green.
- [ ] **Sign-in button race.** Fixed in #54 (button ships disabled until wired; the login
  step waits for the handler and the origin change). Two deploys since passed all 13 suites
  first time. Claude Code: confirm the next scheduled prod deploy does the same.
- [ ] **`destroy previous` never ran.** Fixed in #56 and proven on its own deploy (run
  33283751626): `destroy previous / destroy` ran and removed prod-929d6af's eight stacks
  and all its log groups.
  1. Claude Code, on go: the CDK provider Lambdas (AwsCustomResource providers in
     `ApiStack`, `OpsStack`, `EdgeStack`, `PublishStack`, `KindCdk`, `Route53AliasUpsert`)
     create log groups the stacks do not own; give each an explicit `LogGroup` with
     retention and DESTROY. The app Lambdas already do (`constructs/Lambda.java`).
  2. Operator: 156 orphaned `/aws/lambda/prod-*` log groups (~325 KB, 50 dead deployments,
     most with no retention) remain in us-east-1; say go and Claude Code deletes them.
- [ ] **Tidy the last two local git leftovers.** Operator: `git branch -D
  claude/verify-cloudfront-lookup` (force-delete is blocked for Claude Code; it holds only a
  duplicate of a main commit) and `git remote remove antonycc` if the archived fork should go.
- [ ] **Keep-alive for scheduled workflows.** GitHub disables schedules after 60 days
  without repo activity, which is what stopped automation in July and silenced the destroy
  sweep between 2026-07-13 and 2026-08-24. Nothing guards against a repeat yet. Claude Code,
  on go.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
