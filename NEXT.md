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
  stream flows. `PLAN_GA4.md` lists the consent banner as open. IN FLIGHT (operator said
  go, 2026-08-31): a banner-port agent is producing `claude/ga4-consent-banner` PRs in
  the www and spreadsheets repos, consent logic identical to submit's. Operator merges
  the PRs; verify events in both streams after deploy.
- [ ] **(B9 remainder) Dead GitHub link — search done, two operator steps left.** The
  only dead GitHub link live on a public URL was in stale axe-scan JSON snapshots served
  from `web/public/tests/accessibility/`; no "unstaffed/unmonitored" claim survives on
  any live page in any repo. Operator: merge PR #65 (removes the snapshots), and check
  the antony@ auto-responder for the stale "no longer staffed" text.
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
- [ ] **(B43a) Instrument the AWS accounts for cost analysis.** IN FLIGHT (operator said
  go, 2026-08-31): a worktree-isolated design agent is writing
  `PLAN_COST_INSTRUMENTATION.md` — current state read-only, design (allocation tags, CUR
  2.0/Athena, Budgets + Cost Anomaly Detection across the six accounts, Cost Explorer
  granularity), CDK drafts for this repo, and the ordered NEEDS-APPROVAL write list.
  Every management-account/billing write comes to the operator individually before it
  runs. Feeds backlog #43's whole-bill review.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
