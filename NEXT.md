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
- [ ] **(B14a) Gateway and spreadsheets GA4 streams are silent — diagnosed.** Cowork
  confirmed the scale: zero events in 28 days property-wide from both streams, while
  downloads and donations demonstrably happened; no `purchase`/`begin_checkout` ever
  received. Collection outranks finishing the pipeline. Both
  sites load gtag correctly with the right measurement IDs but set consent
  `analytics_storage: denied` and have no consent banner and no grant path, so nothing is
  ever collected; submit has the banner and a localStorage restore, which is why only its
  stream flows. The banner PRs (www #23, spreadsheets #46) are merged 2026-08-31.
  Claude Code: confirm both sites deployed, then in a day or two confirm `page_view`
  events arrive on the Gateway and Spreadsheets streams, then close this and update
  `PLAN_GA4.md`.
- [ ] **(B9 remainder) Dead GitHub link — one verify left.** Claude Code: once the
  in-flight prod deploy completes, confirm
  `submit.diyaccounting.co.uk/tests/accessibility/axe-results.json` is gone, then close.
- [ ] **compliance and stack-drift schedule revival.** Both crons died 2026-07-13 with
  their schedule actor (`deploy.yml` broke identically and self-healed via a push run
  under a live actor). The operator dispatched both on 2026-08-31 (runs 33387263843,
  33387266505). Claude Code: confirm both runs finish green (stack-drift's first run
  with the noise filter — report what it flags), then confirm the Monday 2026-09-07
  06:00 UTC crons fire on their own before closing. `codeql`'s 2026-08-30 miss likely
  shares the fault — watch 2026-09-06 and revive the same way if it misses again.
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
  CUR); root.diyaccounting.co.uk PR #20 is merged — dispatch that repo's deploy.yml to
  create the stacks, then confirm the CUR export and budgets exist; operator turns on
  hourly granularity in Cost Management Preferences (console only). Feeds backlog #43's
  whole-bill review, which should also look at the August jump to $231 (Bedrock in
  spreadsheets, CloudWatch in submit-prod, the us-east-1 bootstrap ECR line).

## Discipline

(none repo-specific yet — see `../NEXT.md`)
