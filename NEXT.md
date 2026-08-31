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
  stream flows. The banner port is done and tested: consent logic identical to submit's
  (same `consent.analytics` key), site-native styling. Operator: merge www PR #23 and
  spreadsheets PR #46, deploy both sites. Claude Code: after deploy, confirm `page_view`
  events arrive on the Gateway and Spreadsheets streams, then close this and update
  `PLAN_GA4.md`.
- [ ] **(B9 remainder) Dead GitHub link — search done.** No dead GitHub link or
  "unstaffed/unmonitored" claim survives in any repo. Claude Code: after the next prod
  deploy, confirm `submit.diyaccounting.co.uk/tests/accessibility/axe-results.json`
  is gone. Operator: check the antony@ auto-responder for the stale "no longer
  staffed" text.
- [ ] **Watch the weekly scheduled runs.** Claude Code: `compliance` and `stack-drift` on
  Monday 2026-08-31 06:00 UTC (stack-drift's first run with the noise filter); `codeql`'s
  Sunday 04:00 UTC slot did not fire on 2026-08-30 while other schedules did, so watch it
  on 2026-09-06 and treat a second miss with the keep-alive item.
- [ ] **Scheduled-deploy upload fix (#61, merged).** Claude Code: after the next
  scheduled prod deploy, confirm the upload jobs, last-known-good and `destroy previous`
  all ran.
- [ ] **(B44) Remove ngrok from the proxy test path.** `PLAN_REMOVE_NGROK.md` is at the
  repo root with five options. Recommendation: option C — register a localhost redirect
  URI for the HMRC sandbox app (the OAuth leg needs no tunnel at all, only that
  registration) plus `stripe listen` for the webhook leg; option A (named Cloudflare
  tunnel) is the fallback if the Developer Hub refuses localhost. Operator: approve an
  option; the plan's first step is the HMRC Developer Hub registration, proven against
  `test:submitVatBehaviour-proxy` before anything is deleted, then Claude Code
  implements.
- [ ] **(B43a) Instrument the AWS accounts for cost analysis.** Design is at
  `PLAN_COST_INSTRUMENTATION.md` (zero active allocation tags, zero budgets, zero
  anomaly monitors today; the legacy CUR writes to a bucket that no longer exists).
  Open steps: operator approves the two management-account commands in the plan
  (activate five tag keys — not retroactive, so first — and delete the broken legacy
  CUR); `CostReportingStack` in root.diyaccounting.co.uk (org-wide CUR 2.0 export,
  seven budgets, anomaly monitor, cost category per the plan) is IN FLIGHT with an
  agent producing a `claude/cost-reporting-stack` PR; operator turns on hourly
  granularity in Cost Management Preferences (console only). Feeds backlog #43's
  whole-bill review, which should also look at the August jump to $231 (Bedrock in
  spreadsheets, CloudWatch in submit-prod, the us-east-1 bootstrap ECR line).

## Discipline

(none repo-specific yet — see `../NEXT.md`)
