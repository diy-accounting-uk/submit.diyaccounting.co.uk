# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning.

**Batches 1 and 2 are live in prod (deployment prod-7f188b7, verified 2026-08-26).**
PITR is ENABLED on all 11 prod tables. Issues #4, #5, #6, #7, #8 are closed. Drift
findings live in issue #43.

- [ ] **Deploy the cross-account backup vault (B25).** Code is merged; account
  914216784828 is bootstrapped by the first local deploy (operator-approved commands are
  with the coordinator). Follow-up: create `backup-github-actions-role` so
  `setup-backup-account.yml` runs unattended; then copy jobs and the restore test — which
  gates the TypeScript migration (B33).
- [ ] **(B4) Send the HMRC free-flag email.** Drafted in Gmail; the site now states
  recognition correctly. Operator action.
- [ ] **(B9/B9a) Fix the support@ Gmail auto-reply.** Dead GitHub link (point at
  `github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/issues`) and the sender
  filter that replies to SNS/GitHub notifications. Operator action in Gmail settings.
- [ ] **(B14a/B19 console halves) Turn on GA4 export and a scheduled Stripe report; mark
  GA4 conversions; retire the old stream and stale remarketing tag.** Operator console
  actions. CloudFront logging is already live. History cannot be backfilled.
- [ ] **(B17 remainder) Publish the demo videos via YouTube.** Operator decision
  2026-08-26: upload the three delivered cuts to an operator-owned YouTube channel, then
  the site embeds them (guide/about pages) — the embed work is queued for the next batch
  once the operator supplies the video IDs. Silent cuts are fine for v1; captions can
  follow.
- [ ] **Watch the first post-fix scheduled runs.** Tomorrow's `verify-backups` is the
  first with the corrected vault name and PITR on; Monday's `stack-drift` is the first
  with the noise filter. Both should go green — investigate if not.

- [ ] **Automation restarted 2026-08-24 — watch the first scheduled runs.** Remainders:
  (a) `verify-backups` last actually ran 2026-07-13 and FAILED — confirm the next run passes;
  (b) re-enabling re-arms the 60-day trap — see the keep-alive uplift in
  `../STATUS_AUG_24_ALL.md`. (The 2026-07-11/12 deploy failures are diagnosed: deployments
  succeeded; the post-deploy synthetic tests timed out on Cognito's Hosted UI form two mornings
  running, then passed 07-13 with no code change — transient upstream, no action.)

## Discipline

(none repo-specific yet — see `../NEXT.md`)
