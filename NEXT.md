# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-bc6a9dd.** Drift findings live in issue #43.

- [ ] **(B25 remainder) Cross-account backups.**
  1. Claude Code: confirm `verify-backups` on 2026-08-31 is green. The 2026-08-30 run
     failed only because its 48-hour copy-job window still held the five pre-switch failures
     from 02:20 UTC on the 29th; all five copies on the 30th completed.
  2. Claude Code: `scripts/validate-workflows.sh:29` exits 1 with no output on any actionlint
     finding; `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` still says PITR is off.
- [ ] **(B14) Scheduled ingestion jobs.** The GA4 pull needs its credential.
  1. Operator: the GA4 Data API is authenticated with a Google Cloud service account (GA4's
     own admin UI cannot issue API credentials; no GCP compute or billing is involved). In
     the Google Cloud console pick or create a free project, enable the "Google Analytics
     Data API" (APIs & Services, Library), then IAM & Admin, Service Accounts, create one,
     Keys, Add key, JSON. In GA4 Admin, Property Access Management, grant that account's
     email Viewer on property 523400333. Save the key file locally and give Claude Code its
     path; it sets `GA4_SERVICE_ACCOUNT_JSON` in the `ci` and `prod` GitHub environments.
     Deploys skip the secret step until it exists; the GA4 job fails at first invocation
     until then.
  2. Claude Code: once the secret exists, confirm rows in `ga4_traffic` through Athena.
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
- [ ] **Watch the weekly scheduled runs.** Claude Code: `compliance` and `stack-drift` on
  Monday 2026-08-31 06:00 UTC (stack-drift's first run with the noise filter); `codeql`'s
  Sunday 04:00 UTC slot did not fire on 2026-08-30 while other schedules did, so watch it
  on 2026-09-06 and treat a second miss with the keep-alive item.
- [ ] **Scheduled-deploy upload fix.** Operator: merge #61 (a suite passed to
  synthetic-test always wins over the scheduled matrix; until it lands, every scheduled
  deploy's upload jobs fail and skip last-known-good and `destroy previous`). Claude Code:
  after the next scheduled prod deploy, confirm the upload jobs, last-known-good and
  `destroy previous` all ran.
- [ ] **Keep-alive for scheduled workflows.** GitHub disables schedules after 60 days
  without repo activity, which is what stopped automation in July and silenced the destroy
  sweep between 2026-07-13 and 2026-08-24. Nothing guards against a repeat yet. Claude Code,
  on go.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
