# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

- [ ] **Automation restarted 2026-08-24 — watch the first scheduled runs.** Remainders:
  (a) `verify-backups` last actually ran 2026-07-13 and FAILED — confirm the next run passes;
  (b) re-enabling re-arms the 60-day trap — see the keep-alive uplift in
  `../STATUS_AUG_24_ALL.md`. (The 2026-07-11/12 deploy failures are diagnosed: deployments
  succeeded; the post-deploy synthetic tests timed out on Cognito's Hosted UI form two mornings
  running, then passed 07-13 with no code change — transient upstream, no action.)

## Discipline

(none repo-specific yet — see `../NEXT.md`)
