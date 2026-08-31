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
- [ ] **(B14a) Gateway and spreadsheets GA4 streams are silent — diagnosed.** Cowork
  confirmed the scale: zero events in 28 days property-wide from both streams, while
  downloads and donations demonstrably happened; no `purchase`/`begin_checkout` ever
  received. Collection outranks finishing the pipeline. Both
  sites load gtag correctly with the right measurement IDs but set consent
  `analytics_storage: denied` and have no consent banner and no grant path, so nothing is
  ever collected; submit has the banner and a localStorage restore, which is why only its
  stream flows. `PLAN_GA4.md` lists the consent banner as open. The fix is porting
  submit's banner (submit.js consent block + analytics.js restore) to the www and
  spreadsheets repos — two PRs, operator-visible UX change on both live sites. Operator:
  say go and Claude Code dispatches it.
- [ ] **(B9 remainder) Find the dead GitHub link.** The support@ out-of-office reply is
  OFF (Cowork, 2026-08-31) — it had answered every sender since January 2023 and told
  customers the address was unstaffed. It contained no GitHub link, so B9's premise is
  unverified. Claude Code: search the site copy, the old responder's links
  (`www.diyaccounting.co.uk/products.html`, the Linktree now 404s, a PayPal donate URL)
  and the corpus for the dead GitHub link and any surviving "no longer staffed /
  unmonitored" claims; fix what is in the repos, report what is elsewhere. Operator: check
  the antony@ auto-responder for the same stale text.
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
