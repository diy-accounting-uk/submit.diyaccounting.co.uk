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
- [ ] **(B44) Remove ngrok from the proxy test path — implementation in flight.**
  `PLAN_REMOVE_NGROK.md` is the spec. Branch `claude/remove-ngrok` (pushed); validation
  runs locally and on the origin branch before any PR. Steps 1-8 are done and proven
  (2026-08-31): DNS + certbot role deployed, cert issued (expires 2026-11-29), all
  operator gates cleared (hub accepted the :3443 port; local secrets come from
  Secrets Manager over SSO at run time — no local .env at all), and both proof legs
  green with the tunnel down (submitVat + fraud-headers; payment with a real
  stripeSubscriptionId via stripe listen). In flight: the deletion wave — steps 9-10
  (ngrok machinery + hostname sweep) and step 12 (docs + `scripts/proxy-secrets.sh`
  SSO wrapper) in worktrees under `.claude/worktrees/`. Then: coordinator regenerates
  `repository-contents.txt` and the web test report, runs the final gate (named
  checks, grep gate, dispatched CI proxy job with `runProxyBehaviourTests=true`,
  branch `deploy.yml`), operator deletes the `NGROK_AUTHTOKEN` GitHub secret and the
  ngrok redirect URI in the HMRC hub, then the PR.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
