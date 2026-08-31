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
  1. Claude Code: confirm `verify-backups` is green once it next runs. The 06:00 UTC
     slot on 2026-08-31 never fired (see the scheduling item below). The 2026-08-30 run
     failed only because its 48-hour copy-job window still held the five pre-switch
     failures from 02:20 UTC on the 29th; all five copies on the 30th completed.
- [ ] **(B14) Scheduled ingestion jobs.** The 03:15 UTC prod pull is a Lambda on an
  EventBridge schedule (not GitHub Actions, so today's cron trouble does not apply).
  Verification is blocked on expired AWS SSO: operator runs
  `aws sso login --sso-session diyaccounting`, then Claude Code queries
  `prod_env_analytics.ga4_traffic` in Athena workgroup `prod-env-analytics`
  (submit-prod) for rows. Closing this also closes backlog 13/13a.
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
- [ ] **compliance and stack-drift schedules are dead — root cause found, one dispatch
  each revives them.** Both stopped after 2026-07-13; `deploy.yml`'s schedule broke the
  same day under the same actor (`support-at-diyaccounting`, still an active member)
  and silently recovered on 2026-08-25 when a push-triggered run re-armed its schedule
  under `antonycc`. compliance and stack-drift have only ever had schedule-event runs,
  so nothing re-armed them. Fix: `gh workflow run compliance-test` and
  `gh workflow run stack-drift` once under a live account (operator approval pending),
  then confirm the Monday 2026-09-07 06:00 UTC crons fire on their own. `codeql`'s
  2026-08-30 miss likely shares the fault — check it, and watch 2026-09-06.
  Separately, this morning's crons were backlogged, not dropped: `deploy.yml`'s 04:11
  schedule fired at 10:50. A watch is confirming whether `verify-backups` also surfaces
  late (feeds B25 above).
- [ ] **Scheduled-deploy upload fix (#61, merged).** The 04:11 schedule fired late at
  10:50 UTC (run 33384213375, cancelling the operator's 10:44 manual dispatch via the
  concurrency group). A watch is on it: confirm the upload jobs,
  `set-last-known-good-deployment` and `destroy previous` all ran.
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
  CUR); operator merges root.diyaccounting.co.uk PR #20 (CostReportingStack eu-west-2 +
  CostReportingUE1Stack us-east-1 — CUR 2.0 export, seven budgets, anomaly monitor,
  cost category; Maven, synth and 9 new tests green) and dispatches that repo's
  deploy.yml; operator turns on hourly
  granularity in Cost Management Preferences (console only). Feeds backlog #43's
  whole-bill review, which should also look at the August jump to $231 (Bedrock in
  spreadsheets, CloudWatch in submit-prod, the us-east-1 bootstrap ECR line).

## Discipline

(none repo-specific yet — see `../NEXT.md`)
