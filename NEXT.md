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
  runs locally and on the origin branch before any PR. Wave 1 is code-complete
  (2026-08-31): steps 5/6/8 and 11 merged to the branch (unit+system green locally,
  branch CI in progress); steps 1-2 sit in root repo PR #23 (branch
  `claude/local-submit-dns`, worktree `../wt-root-local-submit-dns`, CI green) awaiting
  operator merge + root deploy. Next: the STOP-AND-WAIT operator gates (merge PR #23
  and add the `certbot-local` profile; certbot install + first TXT run; HMRC Developer
  Hub redirect URI with the :3443 port; CI cert secret via `local-tls-publish.sh`;
  cert paths in the local `.env`), then the step 7/8 proof runs, then the deletion
  wave (steps 9, 10, 12) with the final test and grep gates.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
