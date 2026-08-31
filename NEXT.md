# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-bc6a9dd.** Drift findings live in issue #43.

- [ ] **(B14a) Gateway and spreadsheets GA4 streams are silent — diagnosed.** Cowork
  confirmed the scale: zero events in 28 days property-wide from both streams, while
  downloads and donations demonstrably happened; no `purchase`/`begin_checkout` ever
  received. Collection outranks finishing the pipeline. Both
  sites load gtag correctly with the right measurement IDs but set consent
  `analytics_storage: denied` and have no consent banner and no grant path, so nothing is
  ever collected; submit has the banner and a localStorage restore, which is why only its
  stream flows. The banner is deployed and live on both sites (2026-08-31). Claude Code:
  in a day or two confirm `page_view` events arrive on the Gateway and Spreadsheets
  streams (BigQuery dataset `analytics_523400333` in `diyaccounting-ga4`, or the GA4
  console), then close this and update `PLAN_GA4.md`.
- [ ] **compliance and stack-drift schedule revival — dispatches passed, cron proof
  remains.** Both revival runs are green (compliance 10/10 checks; stack-drift "all in
  sync" with three stacks correctly filtered as `DRIFTED_BENIGN` on its first
  noise-filtered run). `verify-backups` missed its 06:00 slot the same day and went
  green on a manual dispatch. Claude Code: confirm `verify-backups`' daily cron fires
  on 2026-09-01, and the Monday 2026-09-07 06:00 UTC crons fire on their own, before
  closing; watch `codeql` on 2026-09-06 and revive the same way if it misses again.
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
  Open steps: the redeploy got past the repaired bootstrap but
  `root-CostReportingUE1Stack` rolled back — BCM Data Exports rejects the CUR query's
  `SELECT *` and wants explicit columns; a debug agent is deriving the column list from
  the service and producing a fix PR. Then: operator merges and re-dispatches; on
  green, Claude Code confirms the CUR export, budgets and anomaly monitor exist. Cost
  Explorer multi-year and resource-level daily data are enabling (ready within 48h of
  2026-08-31). Feeds backlog #43's
  whole-bill review, which should also look at the August jump to $231 (Bedrock in
  spreadsheets, CloudWatch in submit-prod, the us-east-1 bootstrap ECR line).

## Discipline

(none repo-specific yet — see `../NEXT.md`)
