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
- [ ] **(B14) Scheduled ingestion jobs.** The GA4 credential is in the `ci` and `prod`
  GitHub environments and env deploys are dispatched to store it in Secrets Manager.
  Claude Code: confirm both env deploys store the secret, then after the next scheduled
  pull confirm rows in `ga4_traffic` through Athena.
- [ ] **(B14a) Gateway and spreadsheets GA4 streams are silent — diagnosed.** Both
  sites load gtag correctly with the right measurement IDs but set consent
  `analytics_storage: denied` and have no consent banner and no grant path, so nothing is
  ever collected; submit has the banner and a localStorage restore, which is why only its
  stream flows. `PLAN_GA4.md` lists the consent banner as open. The fix is porting
  submit's banner (submit.js consent block + analytics.js restore) to the www and
  spreadsheets repos — two PRs, operator-visible UX change on both live sites. Operator:
  say go and Claude Code dispatches it.
- [ ] **(B9/B9a) Fix the support@ Gmail auto-reply.** Operator, Gmail settings for
  support@diyaccounting.co.uk, Vacation responder / auto-reply: replace the dead GitHub
  link with `https://github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/issues`,
  and restrict the responder so it does not reply to automated senders (at least
  `*@amazonses.com`, `notifications@github.com`, `no-reply@sns.amazonaws.com`). The
  operator has ruled out "contacts only" (new customers must still get the reply); the
  remaining routes are a filter-based responder or switching the responder off.
- [ ] **(B19) Analytics console work.** Operator.
  1. GA4 (property 523400333): Admin, Data export, link BigQuery and turn on the daily
     export; Admin, Events, mark `purchase` and `begin_checkout` as key events. Do NOT
     remove any stream from 523400333 (all three are current); `G-PJPVQWRWJZ` lives in the
     separate old property and `PLAN_GA4.md` retires it only after the new streams show
     comparable traffic for about a week.
  2. Google Ads: check whether the remarketing campaigns for conversion ID 1065724931 are
     still running; pause them or remove the tag from the sites.
  3. Stripe dashboard: Reports, schedule a monthly balance report by email.
- [ ] **Watch the weekly scheduled runs.** Claude Code: `compliance` and `stack-drift` on
  Monday 2026-08-31 06:00 UTC (stack-drift's first run with the noise filter); `codeql`'s
  Sunday 04:00 UTC slot did not fire on 2026-08-30 while other schedules did, so watch it
  on 2026-09-06 and treat a second miss with the keep-alive item.
- [ ] **Scheduled-deploy upload fix (#61, merged).** Claude Code: after the next
  scheduled prod deploy, confirm the upload jobs, last-known-good and `destroy previous`
  all ran.
- [ ] **(B43a) Instrument the AWS accounts for cost analysis.** Claude Code: activate
  org-wide cost allocation tags (the CDK per-stack tags exist but are not
  allocation-active), set up CUR 2.0 / Data Exports to S3 with Athena over it, AWS Budgets
  with alerts and Cost Anomaly Detection in each of the six accounts, and Cost Explorer
  granularity. Management-account and billing writes come to the operator for approval as
  they arise. Feeds backlog #43's whole-bill review.
- [ ] **security-review.yml has no schedule.** Its cron (line 26) is commented out, so
  the workflow never runs on its own. Operator: say whether that is deliberate; if not,
  Claude Code re-enables it.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
