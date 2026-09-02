# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. "Operator" steps are ones a workflow cannot do; "Claude Code" steps run once the
operator step before them is done or when SSO is live.

**Prod runs deployment prod-bc6a9dd.** Drift findings live in issue #43.

- [ ] **Confirm a `purchase` event lands.** GA4 still shows "No stream data detected"
  for `purchase` property-wide — expected while no paid flow has completed since
  collection was restored (2026-08-31), but confirm rather than assume once the
  funnel has run a few days (GA4 property 523400333, or BigQuery
  `analytics_523400333`).
- [ ] **compliance and stack-drift schedule revival — weekly cron proof remains.** Both
  revival runs are green (compliance 10/10 checks; stack-drift "all in sync" with three
  stacks correctly filtered as `DRIFTED_BENIGN` on its first noise-filtered run).
  `verify-backups`' daily cron proved itself: after missing its 06:00 slot on
  2026-08-31 it self-fired at 13:17 UTC the same day (normal GitHub schedule drift) and
  passed. Claude Code: confirm the Monday 2026-09-07 06:00 UTC crons fire on their own
  before closing; watch `codeql` on 2026-09-06 and revive the same way if it misses
  again.
- [ ] **Manual `certbot renew` in the week of 2026-11-29** (run
  `aws sso login --sso-session diyaccounting` first; command in `_developers/SETUP.md`).
  The weekly launchd renew agent is wired, but both AWS profiles it needs are SSO-backed
  and cannot refresh unattended, so the run that matters needs a live session.

- [ ] **(B14) prod's `activity_activations=0` is unproven either way.** Real
  live-mode Stripe webhooks succeed (confirmed in CloudWatch logs), but
  `activity_events_all` in this account only covers 2026-08-29 onward, before
  any of those real events recurred — needs a real renewal or checkout to land
  before this counts as verified. Phase 5 (stop duplicate CloudFront log
  delivery) turned out to already be done — no classic logging path exists in
  the code, confirmed live in ci — so this is the only open thread left.
- [ ] **`supportTicketPost.js`'s GitHub wiring is dormant.** `GITHUB_TOKEN_SECRET_ARN`
  is never provisioned by any workflow, so support-ticket-to-issue is wired in code
  but never deployed. Surfaced while proving B20/20a's alarm→issue path live in ci;
  a separate deploy-gap fix, not part of that proof.

## Discipline

(none repo-specific yet — see `../NEXT.md`)
