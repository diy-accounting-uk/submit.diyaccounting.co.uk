# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning.

**Batch 1 is live in prod (deployment prod-26b125b, verified 2026-08-26).** The operator
sends the HMRC free-flag email now that the site states recognition correctly.

**In flight — batch 2 (integration branch `claude/next-batch-2`, coordinator merges and
pushes; agent worktrees under `.claude/worktrees/`):** five sub-agents.
`claude/batch2-data-protection` carries B2 (PITR), B25a (backup vault code), B28a (IAM
grants). `claude/batch2-observability` carries B26 remainder, B14a's CloudFront-logging
half, B30a, and B5's drift detection. `claude/batch2-web-ui` carries B31's #5/#6/#8,
B19's consent banner, B15a. `claude/batch2-app-flow` carries B6 (obligation matching)
and #7's logout event. `claude/batch2-demo-videos` carries B17. B29 stays with the
coordinator pending operator approval; B14a's GA4/Stripe halves and B19's console
halves are operator console actions.

- [ ] **(B14a) Turn the analytics source exports on.** CloudFront standard logging (CDK, in
  flight batch 2); GA4 data export and a scheduled Stripe report are operator console actions.
  History cannot be backfilled.
- [ ] **(B15a) Correct the four `campaign-pass` values in `submit.passes.toml`.** In flight:
  batch 2 web branch.
- [ ] **(B25a) Provision the empty backup vault in `submit-backup`.** Code in flight (batch 2);
  the first deploy into account 914216784828 needs operator approval.
- [ ] **(B28a) Replace blanket `grantReadData` with per-table, per-action grants.** In flight:
  batch 2 data-protection branch.
- [ ] **(B30a) Cut canary cadence to the cheapest safe interval.** In flight: batch 2
  observability branch, with the alarm-evaluation math checked.

- [ ] **(B2) Fix the backup verifier and re-enable PITR.** Fix the doubled `-env` vault name in
  `verify-backups.yml`, then restore point-in-time recovery on all 11 prod tables (the
  `KindCdk.ensureTable` custom resource dropped it). `_developers/backlog/PLAN_BACKUP_STRATEGY.md`
  is the plan of record. Gates the approved TypeScript CDK migration.
- [ ] **(B5) Clear the stack-drift failure.** The weekly `stack-drift` workflow has been red for
  3+ months. Identify the drifted stacks, reconcile, and raise a tracking issue.
- [ ] **(B6) Fix VAT obligation matching.** A valid quarter failed to match an open HMRC
  obligation while the submission actually succeeded (customer evidence, 2026-05-11). Needs
  diagnosis against real HMRC obligation shapes. The vanishing-error half is fixed in PR #42:
  the callback page redirected even on failure, wiping the message.
- [ ] **(B9) Fix the dead GitHub link in the support@ Gmail auto-reply.** Not a repo file: the
  auto-reply is configured on the mailbox itself and points at
  `github.com/antonycc/diy-accounting/discussions` (dead; no diy-accounting-uk repo has
  Discussions enabled). Operator action in Gmail settings — point it at
  `github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/issues` or another live page.
  Pair with B9a (the autoresponder also replies to automated SNS/GitHub notifications).
- [ ] **(B17) Produce the three demo videos.** Validate the existing Playwright capture test and
  publish the output. `PLAN_DEMO_VIDEOS.md` is the plan of record.
- [ ] **(B19) Finish GA4.** Cookie consent banner, mark purchase/begin_checkout as conversions,
  retire the old stream and the stale Google Ads remarketing tag. `PLAN_GA4.md` is the plan of
  record.
- [ ] **(B26) Missing-alarms batch.** Add the specced alarms (HMRC error rate, cert expiry, SQS
  age, JWT errors, PITR-disabled) and set `treatMissingData(NOT_BREACHING)` on the worker-error
  alarms stuck in INSUFFICIENT_DATA. `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` has the
  specs.
- [ ] **(B31) Small UI batch, remainder: issues #5, #6, #7, #8.** Mobile visibility, pass
  navigation, logout event. (#4 is in PR #42; #3 has no occurrences in this repo — its
  linktr.ee references live in www.diyaccounting.co.uk.)

- [ ] **Automation restarted 2026-08-24 — watch the first scheduled runs.** Remainders:
  (a) `verify-backups` last actually ran 2026-07-13 and FAILED — confirm the next run passes;
  (b) re-enabling re-arms the 60-day trap — see the keep-alive uplift in
  `../STATUS_AUG_24_ALL.md`. (The 2026-07-11/12 deploy failures are diagnosed: deployments
  succeeded; the post-deploy synthetic tests timed out on Cognito's Hosted UI form two mornings
  running, then passed 07-13 with no code change — transient upstream, no action.)

## Discipline

(none repo-specific yet — see `../NEXT.md`)
