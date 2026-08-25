# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning.

**In flight — batch 1 (integration branch `claude/next-batch-1`, coordinator merges and
pushes):** three sub-agents in isolated worktrees. `claude/batch1-cdk-observability` carries
B8, B26, and B2's vault-name fix; `claude/batch1-web-links` carries B4a, B9, B31's link items
(#3, #4), and B6's error-display half; `claude/batch1-activity-events` carries B7. A fourth
agent is splitting non-NEXT backlog rows into precursor/remainder pairs directly in
`BACKLOG.md`.

- [ ] **(B2) Fix the backup verifier and re-enable PITR.** Fix the doubled `-env` vault name in
  `verify-backups.yml`, then restore point-in-time recovery on all 11 prod tables (the
  `KindCdk.ensureTable` custom resource dropped it). `_developers/backlog/PLAN_BACKUP_STRATEGY.md`
  is the plan of record. Gates the approved TypeScript CDK migration.
- [ ] **(B4a) Add an "HMRC recognised" link to submit.diyaccounting.co.uk.** Point at the official
  finder (tax.service.gov.uk/making-tax-digital-software, "search DIY Accounting" — no per-product
  permalink exists). In flight: batch 1 web branch.
- [ ] **(B4b) Correct the "HMRC Recognised (applied for, pending)" copy on about.html.**
  Recognition was granted March 2026 and the finder listing published May 2026; the site
  understates it and contradicts the free-flag request drafted for HMRC. Lands with B4a.
  In flight: batch 1 web branch. Send the free-flag email only after this deploys.
- [ ] **(B4c) Make the free route discoverable.** Split the pass-code sentence out of the Free
  Guest Tier block on about.html, state the 100-allocation day-guest cap, and say on help.html
  and guide.html how to start free. In flight: batch 1 web branch.
- [ ] **(B31a) Retire the stale day-guest pass documentation.** Catalogue comment block and
  commented-out duplicate in `web/public/submit.catalogue.toml`, PASSES.md pass-gated framing
  (drop `day-guest-pass`, keep `day-guest-test-pass`), REPORT_REPOSITORY_CONTENTS.md line 39.
  In flight: batch 1 web branch.
- [ ] **(B5) Clear the stack-drift failure.** The weekly `stack-drift` workflow has been red for
  3+ months. Identify the drifted stacks, reconcile, and raise a tracking issue.
- [ ] **(B6) Fix VAT obligation matching and the vanishing error message.** A valid quarter failed
  to match an open HMRC obligation while the submission actually succeeded, and the on-screen
  error disappears before it can be read (customer evidence, 2026-05-11).
- [ ] **(B7) Make usage measurable.** Tag receipts and activity events with actor class
  (customer / test / synthetic), publish an activity event on the `hmrcVatReturnPost` failure
  path (success-only today), and emit submissions/signups business metrics.
- [ ] **(B8) Route the us-east-1 WAF alarms.** The three WAF alarms have no notification path;
  the alarm-state-change rule exists only in eu-west-2. `EdgeStack.java` carries the deferred
  wiring comment.
- [ ] **(B9) Fix the dead GitHub discussion link in the support auto-reply.**
- [ ] **(B17) Produce the three demo videos.** Validate the existing Playwright capture test and
  publish the output. `PLAN_DEMO_VIDEOS.md` is the plan of record.
- [ ] **(B19) Finish GA4.** Cookie consent banner, mark purchase/begin_checkout as conversions,
  retire the old stream and the stale Google Ads remarketing tag. `PLAN_GA4.md` is the plan of
  record.
- [ ] **(B26) Missing-alarms batch.** Add the specced alarms (HMRC error rate, cert expiry, SQS
  age, JWT errors, PITR-disabled) and set `treatMissingData(NOT_BREACHING)` on the worker-error
  alarms stuck in INSUFFICIENT_DATA. `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` has the
  specs.
- [ ] **(B29) Remove the legacy CDK ECR repo in the old management account.** 4,253 images,
  ~$8.50/month, serves nothing since the prod migration. Mutating change in account 887764105431:
  needs explicit operator approval before any write.
- [ ] **(B31) Small UI batch: issues #3, #4, #5, #6, #7, #8.** Link cleanups, mobile visibility,
  pass navigation, logout event.

- [ ] **Automation restarted 2026-08-24 — watch the first scheduled runs.** Remainders:
  (a) `verify-backups` last actually ran 2026-07-13 and FAILED — confirm the next run passes;
  (b) re-enabling re-arms the 60-day trap — see the keep-alive uplift in
  `../STATUS_AUG_24_ALL.md`. (The 2026-07-11/12 deploy failures are diagnosed: deployments
  succeeded; the post-deploy synthetic tests timed out on Cognito's Hosted UI form two mornings
  running, then passed 07-13 with no code change — transient upstream, no action.)

## Discipline

(none repo-specific yet — see `../NEXT.md`)
