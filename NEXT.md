<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. Every item ends with a tag line: **Source** (backlog row, GitHub issue, plan doc, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-4918a0d**, nine stacks, live since the #194 merge deploy at about
13:00 UTC; the apex answers 200. It is the only prod set: `prod-e6d3045` was destroyed by
run 34717906698 at about 20:5x UTC, so nothing spare is being paid for.
**No ci deployment exists.** All three sets have gone — `ci-claudc83b`, `ci-claudd44f` and the
long-overdue `ci-mainb28b` — and `/submit/ci/last-known-good-deployment` reads `None`. Three ready
rows need a ci set before they can run: B73's email-restricted pass, B71.S3e's remaining sync and
verification steps, and B34.6b's sandbox filing. Each needs a `deploy.yml` run against ci first,
and cool-down holds that.

The board runs in four sections, in this order: **machine-only**, **human and machine**,
**human-only**, **blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `human-only` is work no session can do: an external registration, a console action with no
API, a filing against the operator's own company, an email from their address, a decision between
named alternatives. A row whose only human step is merging its PR is machine-only; that is the
standing workflow, not an action the row needs. Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

**COOL-DOWN is on since 2026-09-12T20:21:54Z.** No new board rows except a degradation. Agents commit
and stop. One branch is driven green at a time. Lifted only by the operator in their own words.

## Machine-only

- [ ] **B133. destroy-prod reports failure when the set is already gone.** Run 34691690046
  (#294, dispatched 11:41:08 for `prod-40b194e`) spent 68 minutes in `Wait for a running prod
  deploy` — the 15112f1f deploy — then failed at `Confirm the deployment has stacks to destroy`
  (`destroy-prod.yml:733`) with "Refusing to report success: [prod-40b194e] matches no stacks in
  eu-west-2 or us-east-1". It deleted nothing: the set had already gone while it waited. The check
  cannot tell "you named a set that never existed" from "the set is already destroyed", and only
  the first deserves a failure.
  Fix: succeed when the named set has no stacks and the last-known-good pointer does not name it —
  that is the requested end state. Keep failing when the name is unrecognised. Re-reading the
  pointer after the wait, rather than before, is the cheap version.
  Worth settling at the same time: destroy-prod also runs on a schedule (#293 07:51 and #295 12:48
  both succeeded today), so a hand dispatch races the cron for the same set. Say in the workflow
  which one is authoritative. **Source**: run 34691690046, job 103547976202.
  **Owner**: Claude Code. **Model**: Haiku.



- [ ] **B132. Every branch push this session had its deploy cancelled, and I cannot say by what.**
  Three branches, same shape. `claude/ops-cf-vacate-race`: `deploy` 34692059976 and
  `deploy environment` 34692059872 both cancelled within seconds of the push, and `identity-guard`
  34692076128 cancelled too. `claude/lint-findings`: `deploy` 34692919287 and `deploy environment`
  34692919247, both cancelled at 12:11:2x-12:11:32 — two different workflows, two different
  concurrency groups, eleven seconds apart. Earlier, `main`'s `deploy` of `926e783d` was cancelled,
  which was a genuine supersession by the `15112f1f` merge.
  What is established: no workflow in this repository calls `gh run cancel`; `identity-guard` has
  no concurrency group at all, so nothing in CI could have cancelled that one; both deploy
  workflows set `cancel-in-progress: false`. On the lint-findings `deploy`, `wait for environment
  deploy` ran 12:10:03 to 12:11:21 and was cancelled, then the run followed at 12:11:32.
  Two candidates. **A person or another session**: `antonycc` hand-dispatched
  `deploy` 34692141909 for `ops-cf-vacate-race` at 11:51:49, so something outside this session was
  acting on these branches. **The group dropping a queued run**: with `cancel-in-progress: false`
  GitHub keeps only the latest queued run per group and drops the older, and
  `deploy-environment.yml`'s group is `deploy-environment-ci` — shared by every ci branch, with no
  `wait-for-ci-deploys` guard. `deploy.yml`'s own concurrency comment describes exactly this hazard
  and says that guard is why it does not use a shared group; `deploy-environment.yml` has the
  hazard and no guard.
  The API does not expose who cancelled a run. The organisation audit log does, and that is
  operator-side, so settle it there first rather than guessing. If it is the shared group, give
  `deploy-environment.yml` the same wait-and-queue treatment `deploy.yml` has.
  **Source**: runs 34692059872, 34692059976, 34692076128, 34692919247, 34692919287.
  **Owner**: Claude Code, after the operator reads the audit log. **Model**: Sonnet.



- [ ] **B131. keepalive fails on main, and one of its two reasons is its own.**
  Run 34692859063 on `bc719fda`: "FAIL: 2 scheduled workflow(s) have not fired within their
  cadence" — `restore-drill.yml` and `youtube-check.yml`, both "no schedule-triggered run recorded
  yet". `main` stays red until both are settled.
  `youtube-check.yml` is a false failure: it was added on 2026-09-11 with cron `0 6 * * 1`, so its
  first Monday slot is 2026-09-14 and it cannot have fired yet. The cadence check has no allowance
  for a workflow younger than its own cadence. Fix that, and while there move the cron off the top
  of the hour, which is the lesson BACKLOG 47 recorded when the `compliance` and `stack-drift` crons
  fired five hours late and were moved to 06:06 and 06:36.
  `restore-drill.yml` is a true failure with no fix here: it has never run and cannot until O41x
  lands, which B25c already records. So decide what keepalive should do about a scheduled workflow
  that is knowingly blocked — exempt it by name with the blocking item cited, or accept a red main
  until O41x. Do not silence the check generally.
  **Source**: run 34692859063, job 103551097473. **Owner**: Claude Code. **Model**: Sonnet.



- [ ] **B30v. The prod FOCUS export copy is denied ListBucket.**
  **Both environments, not just prod.** `prod-env-cost-focus-copy-errors` has been in ALARM since
  2026-09-10 03:46 BST and `ci-env-cost-focus-copy-errors` since **2026-09-09 03:46 BST**, a day
  earlier — "The nightly FOCUS export copy failed at least once in 24 hours". No issue was raised
  for either, so `alarm-triage.yml` did not fire for either. Both Lambdas' logs say the same thing:
  `prod-env-cost-focus-copy-role` and `ci-env-cost-focus-copy-role` are each "not authorized to
  perform: s3:ListBucket" on `arn:aws:s3:::diy-accounting-cost-focus-887764105431`. One cause, two
  environments, and the fix applies to both.
  `CostExportStack.java:155` grants that account `s3:ListBucket` on the bucket in the bucket's own
  resource policy, under an `s3:prefix` condition. A cross-account read needs both sides, so the
  theory is that the Lambda's role carries no matching identity policy — the same omission B52x hit,
  where `prod-env-raw-export-publish` had `PutObject` and neither `GetObject` nor `ListBucket` until
  2026-09-10 18:14. Confirm which side is missing before changing either, then check whether the
  `s3:prefix` condition matches the prefix the Lambda actually lists. Also find out why no alarm
  issue exists after two days. **Source**: the alarm; `/aws/lambda/prod-env-cost-focus-copy`,
  2026-09-12 02:45 to 02:48 UTC. **Owner**: Claude Code. **Model**: Sonnet.




- [ ] **B130. A superseded deploy reports a failed job.** `record-dora` in `deploy.yml:2950` is
  `if: always()` with `environment: ${{ needs.names.outputs.environment-name }}`. When a run is
  cancelled by the concurrency group, `names` is cancelled with it, that output is empty, so no
  environment is selected and `vars.SUBMIT_ACTIONS_ROLE_ARN` — an environment-scoped variable —
  resolves to nothing. `configure-aws-credentials` then fails with "Could not load credentials from
  any providers", and the run shows a failed job. Seen on run 34691378970, the `main` deploy of
  `926e783d` superseded by the `15112f1f` merge fourteen minutes later; it was cancelled at `wait
  for environment deploy`, before `deploy api`, so nothing was part-applied.
  The job's own comment says the row is written "regardless of how the run ended so a failed deploy
  counts towards the failure rate rather than leaving a silent gap". That is right for a failure and
  wrong for a supersession: a run cancelled because a newer commit arrived is not a deployment
  failure, and it cannot write a row anyway without an environment. So skip the job when the run was
  cancelled, or when `names` produced no environment name, and keep it running for a genuine
  failure. Check whether the DORA panels already counted cancellations as failures before this.
  **Source**: run 34691378970, job 103548887779. **Owner**: Claude Code. **Model**: Haiku.




- [ ] **B127. The apex-alias vacate races any expiring ci set, and the fix is unproven.**
  `set origins` strips the apex alias from whichever CloudFront distribution holds it, then waits
  for that distribution to finish deploying. In deploy run 34687925996 the distribution was
  `E3GFQF1I7VAW46`, belonging to `ci-annual1`, whose self-destruct fired at about 10:56 UTC; the
  waiter failed at 10:56:16 with `NoSuchDistribution`, the step died under `set -e`, and all
  thirteen `probe test / behaviour test *-ci` jobs failed behind it. Any ci set reaching its TTL
  while another branch deploys hits this, so it will recur.
  **Merged as `ef3aac19`** (PR #193): every call against the old distribution treats
  `NoSuchDistribution` as already-vacated and skips the rest of the block, while the waiter on our
  own target distribution stays strict and any other AWS error still fails the step. Verified only
  by a scratch harness with `aws` mocked and by actionlint; **no real run has exercised it**,
  because reproducing it means timing a deploy against a self-destruct. All that is left of this
  row: confirm on a real run that a ci set expiring mid-deploy no longer fails the deploy, and
  decide the second window at `.github/actions/set-origins/action.yml:365-370`, where
  `transfer_apigw_domain` checks an API Gateway custom domain exists and then calls
  `get-api-mappings` and `delete-domain-name` against it with no equivalent classification.
  **Source**: deploy run 34687925996, job 103542638824. **Owner**: Claude Code. **Model**: Sonnet.




- [ ] **B124. Prove the three agent workflows by dispatch, in order.** All three are on main,
  `workflow_dispatch` only, every event trigger commented out until a hand-run has earned it.
  **`agentic-lib-board.yml` first**, with `write-back=false`: it changes nothing, so a bad render costs only a
  job. Compare its five parts against a `/board` in the terminal — same rows, same alarm families,
  same deployment table, or the skill is being read differently in CI. Then `write-back=true` and
  check the reluctance actually holds: a second run minutes later should say the board is already
  true and commit nothing.
  **`agentic-lib-pr.yml` next**, `dry-run=true`, after O42. Its tables must match a
  `/auto-merge-dry-run` here. Only then a live run against one PR.
  **`agentic-lib-code.yml` last**, 10 minute budget. The questions that matter: did it take the simplest
  ready task rather than the most interesting; did it check whether `main` was green first; if it
  finished, is the PR one you would merge; if it did not, does `work.patch` apply and is
  `CHANGES.md` specific enough that a different agent could take the next step from it alone. Then
  dispatch a second run against a deliberately unfinished first and check the resume judgement and
  the `Resumed-From:` chain.
  Uncomment a trigger only after that workflow's hand-run has produced something worth keeping.
  **O42 is done** and the first dispatch already failed, which is what this row exists to find.
  Run 34716604299, `agentic-lib-board.yml` with `write-back=false`, died at step 5
  "Configure AWS role via GitHub OIDC": "Credentials could not be loaded". Cause: all three
  workflows read `role-to-assume: ${{ vars.SUBMIT_ACTIONS_ROLE_ARN }}` from a job that declares no
  `environment:`, and that variable exists only on the `ci` and `prod` environments, never at
  repository level. So it resolves to empty and the action has no role to assume. `alarm-triage.yml`
  gets this right with `environment: ${{ needs.triage.outputs.environment-name }}`; these three
  copied the step and not the environment. Same root cause as B130.
  `agentic-lib-board.yml` needs more than an `environment:` line: its Part 4 reads **both** accounts,
  so one environment cannot serve it. Decide between two jobs keyed by environment, a second assume
  into the other account, and repo-level role ARNs for both. Also ask, per workflow, whether it
  needs AWS at all — `/auto-merge` reads GitHub and nothing else, so `agentic-lib-pr.yml`'s OIDC
  step may simply be surplus.
  **Halted by the operator, 2026-09-12 20:2x UTC**, during cool-down. The agent fixing the
  credential wiring was stopped while still reading; nothing was committed and no worktree was
  left behind. Its one finding, kept so it is not rediscovered: the `/auto-merge` skill contains no
  AWS reference at all, so `agentic-lib-pr.yml`'s OIDC step is surplus and should be deleted rather
  than given an environment. Do not dispatch this row again until the operator says so.
  **Source**: `.github/workflows/agentic-lib-*.yml`; run 34716604299.
  **Owner**: Claude Code. **Model**: Sonnet.





- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod, where B17b.1 is now live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. The `view-liabilities` capture against prod succeeded at 22:04 UTC
  on 2026-09-11 (video-capture run 34651931632); payments and penalties are next, one at a time
  because the workflow toggles Cognito native auth around each run. All three prod captures have now
  succeeded: `view-liabilities` (run 34651931632), `view-payments` (34689643435) and
  `view-penalties` (34689889022). Remaining: the two ci captures, then check all five
  artifacts and write `videos/publish.json`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude
  Code. **Model**: Sonnet.
  **The two missing scene scripts are merged**: `videos/file-micro-entity-accounts.json`
  and `videos/itsa-quarterly-update.json`, both saying on screen that they are sandbox previews, and
  `video-capture.yml`'s `script` choice list now offers them — a script absent from that list cannot
  be dispatched however valid the file is. The ITSA one supersedes `itsa-business-details`, whose
  `publish.json` entry goes when the new capture is checked.
  Two things the scripts could not settle. The quarterly-update script stops with the form filled
  except `businessId`: a `businessId` only exists after HMRC answers Business Details at run time,
  and the scene-script format has no way to carry a value from one scene into a later scene's input,
  so filling it would mean inventing one. And `itsa-business-details.json` may no longer pass at all
  — it clicks the Self Assessment activity then awaits `#itsaBusinessDetailsForm`, but the
  `self-employed` activity's first `.html` path is now `dashboard.html`, whose form is
  `#businessPickerForm`. Check that on the next capture rather than assuming.





- [ ] **B11.T7r. ITSA phase 2: run the sandbox year.** The script and the runbook
  (`_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`) are on main, and the run now clears seven calls
  before it stops. Three script bugs were fixed on `claude/b28-board`: the checkpoint call needs a
  `nino` query parameter and 404s on a NINO with no test-support data, so the checkpoint is taken
  after the business and the ITSA status rather than before, and a restore reuses the saved
  `businessId` instead of creating a second business; a GB self-employment business needs
  `businessAddressPostcode`. The run then reaches
  `GET individuals/person/itsa-status/{nino}/{taxYear}` and gets `403 RESOURCE_FORBIDDEN`.
  That endpoint is on the **Self Assessment Individual Details (MTD)** API, which the sandbox
  application is not subscribed to and which the runbook's subscription list never named.
  **O43 is done**: the sandbox application now carries Self Assessment Individual Details (MTD)
  2.0 (Beta). So resume from call 7 — `GET individuals/person/itsa-status/{nino}/{taxYear}` — and
  work through whatever HMRC answers next. The run needs the HMRC sandbox client id and secret from
  Secrets Manager, so it needs a live SSO session: `aws sso login --sso-session diyaccounting`.
  **Source**: `PLAN_ITSA_PHASE_2.md` T7; the sandbox run of 2026-09-12. **Owner**: Claude Code.
  **Model**: Sonnet.




- [ ] **B52x. Pull a day of the raw export and count every field.** The first nightly to include
  the raw-export step, 02:15 UTC on 2026-09-10, failed on all three attempts: the
  `prod-env-raw-export-publish` Lambda's role carried `s3:PutObject` on `exports/*` and no
  `GetObject` or `ListBucket`, so Athena could not read the curated data its 21 views select from,
  and it failed before writing a single file. `AnalyticsDashboard.java`'s metrics-publish Lambda
  runs the identical Athena-over-the-lake pattern and already had both grants; `RawExport.java`
  never got them. The grants reached prod at 18:14 UTC on 2026-09-10:
  `prod-env-raw-export-publish`'s role now carries `s3:GetObject` and `s3:ListBucket` on
  `prod-env-analytics-lake-972912397388`. The 02:15 UTC run of 2026-09-11 failed as well and
  raised alarm issue #182: the analytics view chain's own fix only reached prod in the merge of
  2026-09-11 evening, so that run still hit the missing view. The first export that can work is
  the 02:15 UTC run of 2026-09-12. Then pull one day through the notebook's data path
  (`PLAN_ONE_STOP_DASHBOARD.md` D16's export) and list every field with its count of non-empty
  entries, so a field that never fills is found now rather than in three months. Proof the run
  worked: 21 CSVs and 8 JSONs under `exports/prod/<date>/`, and the state machine's execution
  showing SUCCEEDED through its raw-export step. **Source**: BACKLOG 52; plan row D16; the failed
  execution of 2026-09-10. **Owner**: Claude Code. **Model**: Haiku.
  **The 02:15 UTC nightly of 2026-09-12 SUCCEEDED** (state machine execution started 03:15 BST),
  the first success after the 2026-09-10 and 2026-09-11 failures, and
  `prod-env-analytics-nightly-failed` has returned to OK. So this row is ready: pull one day through
  the notebook's data path and count the fields.





- [ ] **O28. Send `Gov-Client-Multi-Factor` on every request.** Every monthly advisory HMRC has
  raised, in every month, is this one header missing; every other header reads Correct throughout.
  Missing per month: April 11 of 18, May 2 of 16, June no traffic, July 0 of 9, August 18 of 21,
  September 4 of 11 to the 9th. Sending correct header data is a legal requirement, so this is a
  compliance failure rather than a cosmetic one. **Operator decision: mandate MFA.** Telling HMRC
  the header is uncollectable was tried and HMRC pushed back, so that route is closed.
  The evidence, the reasoning and the ranked options are in `../REPORT_HMRC_HEADER_ADVISORIES.md`
  at the workspace root, with the Developer Hub captures in `../hmrc-header-advisories/`. Read it
  before starting: it carries the staging argument this row summarises, and section 10 is where
  HMRC's pushback wording goes.
  Why it varies: the header is written to `sessionStorage.mfaMetadata` by the inline script in
  `web/public/auth/loginWithCognitoCallback.html` and read by `hmrc-service.js`. Google federated
  gives `type=OTHER`; Cognito native with TOTP gives `type=TOTP` from the Pre Token Generation
  Lambda's `custom:mfa_method`; Cognito native with password only gives nothing.
  **Step 1, the scan, decides the rest — do not build before reporting it.** The prod async-requests
  table (`HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME`) holds `govClientHeaders` per request, 75
  requests between 2026-04-01 and 2026-09-09; a read-only scan, no approval needed. Project
  `Gov-Client-User-IDs` (it carries the raw Cognito sub), whether `Gov-Client-Multi-Factor` is
  present, its `type=`, and the timestamp, then group by sub. A sub that **never** carries it is a
  password-only native user, reachable only by step 3. A sub that carries it **sometimes** is the
  `sessionStorage` lifetime problem — written once at the login callback, lost when the tab closes,
  so a customer returning on a refresh token sends nothing even with TOTP enrolled. Count distinct
  `Gov-Client-Device-ID` per sub in the same pass; it answers B134.
  **Step 2, two ways, and the scan says which.** *2a, `localStorage`:* a three-line change that
  fixes the "sometimes" cohort with no server change, and the value stays honest because the
  timestamp is `auth_time` from the ID token and every genuine re-sign-in re-runs the callback. If
  it ships, **three sites move together** — the write in `loginWithCognitoCallback.html`, that
  file's final `else` branch removal, and the sign-out removal at
  `web/public/widgets/auth-status.js:255` — plus the same in `loginWithMockCallback.html`. Moving
  the write alone gives two real defects: a customer who disables TOTP keeps a false entry, and user
  B inherits user A's MFA event on a shared browser. It covers only browsers where the callback has
  run once, and leaves the value client-writable. *2b, server-side:* the destination.
  `customAuthorizer.js` already hands `buildFraudHeaders.js` a flat context it reads `sub` from, so
  carry `mfa_method` and the auth time through the same context and build the header there, keeping
  its shape `type=<TOTP|OTHER>&timestamp=<iso>&unique-reference=<ref>`. Add a `logger.warn` when it
  cannot be built, matching the other `HMRC REQUIRED HEADER MISSING:` lines — its absence is silent
  today, which is why this took screenshots to find. A token claim cannot be forged; browser storage
  can.
  **Step 3, the pool.** `IdentityStack.java:184` is `.mfa(Mfa.OPTIONAL)`. Required is one word, but
  every existing native-auth customer then meets a TOTP enrolment screen at their next sign-in.
  Propose it as a PR and describe that screen; do not ship it before the operator has walked the
  enrolment path end to end as a new customer meets it. Federated Google users are unaffected.
  The seven Developer Hub captures stay at the workspace root in `../hmrc-header-advisories/` and
  are deliberately not in this repository: it is public, and they carry the production application
  id, the operator's name and HMRC's assessment of our compliance. Versioning them needs a private
  home first.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`; the Developer Hub captures; B22's first run.
  **Owner**: Claude Code. **Model**: Sonnet.



- [ ] **B134. Persist `Gov-Client-Device-ID` instead of regenerating it per request.**
  `web/public/lib/services/hmrc-service.js:174` calls `crypto.randomUUID()` on every request, so the
  device id changes each time. HMRC report it Correct because their check tests presence and format
  rather than persistence, but the spec asks for a UUID stored on the device that does not expire.
  Store it in a first-party cookie or `localStorage`: generate once, reuse, regenerate only when
  absent. O28's scan counts distinct device ids per sub, which says how visible this is in real
  traffic. Spec conformance, not an advisory fix. **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`.
  **Owner**: Claude Code. **Model**: Haiku.



- [ ] **B136. The monthly fraud-header check has never run.**
  `data/compliance/fraud-prevention-headers/` is empty. B22 shipped a monthly check whose launchd
  agent was supposed to write a file there each month, and no file exists, so the check has produced
  nothing since it landed and nobody noticed until the advisories were read by hand. Find out
  whether the agent was ever loaded, whether `scripts/fraud-header-email-check.js` runs today, and
  decide where it should run: a launchd agent on one laptop is invisible when it fails, and a
  scheduled workflow is not. Settle at the same time whether
  `data/compliance/fraud-prevention-headers/*.json` is tracked or gitignored — that was never
  decided and the directory is currently tracked and empty.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`'s closed lines of enquiry. **Owner**: Claude
  Code. **Model**: Sonnet.



- [ ] **B137. `uniqueReference` identifies the user, not the authentication event.** In the
  `Gov-Client-Multi-Factor` header, `uniqueReference` is a SHA-256 of `sub + ":" + factorType`, so
  it is stable per user per factor type by design. HMRC's spec expects a reference identifying the
  authentication **event**. They have not flagged it and it is no part of the current advisory, so
  this is a separate reading of the spec rather than a defect they have raised. Decide whether to
  change it, and note that O28's step 2b touches the same code — sequence it after, not with.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`. **Owner**: Claude Code. **Model**: Sonnet.



- [ ] **B128. A failed HMRC submission must not cost a token.** `consumeTokenForActivity` is called
  before the HMRC request in all twelve charging handlers — `hmrcVatReturnPost`,
  `hmrcItsaFinalDeclarationPost`, `hmrcItsaSelfEmploymentPeriodPost`,
  `hmrcItsaSelfEmploymentPeriodPut`, `hmrcItsaUkPropertyPeriodPost`, `hmrcItsaUkPropertyPeriodPut`,
  and the six year-end handlers B117 just wired — and a non-ok response from HMRC does not refund
  it. So a customer whose submission HMRC rejects pays for it, and pays again on the retry.
  **Operator decision, 2026-09-12: failures should not cost.** Settle where the charge belongs: a
  refund on a non-ok HMRC response, or move the consume to after a successful response and keep
  whatever reservation stops a caller with no tokens from reaching HMRC at all. Say which and why,
  because the two differ under a crash between the HMRC call and the write. Whichever it is, it
  applies to all twelve handlers in one pass, and the proof is a test per handler showing the token
  count unchanged after an HMRC rejection. **Source**: B117's wiring pass, 2026-09-12.
  **Owner**: Claude Code. **Model**: Sonnet.




- [ ] **O41x. Rework the vault for copy-back restore, then redeploy the backup account.**
  `setup-backup-account.yml` failed on 2026-09-11 (run 34638032553): AWS Backup refused the vault
  policy with "cross-account sharing restrictions" (403). A vault access policy takes
  `backup:CopyIntoBackupVault` cross-account, not restore, so B105's `AllowCiRestoreRoleToRestore`
  statement cannot deploy. The organisation setting is not implicated;
  `isCrossAccountBackupEnabled` has been true since 2026-08-29. The stack rolled back cleanly.
  **Operator decision, 2026-09-11: copy back, then restore locally.** `restore-drill.yml` copies
  the recovery point from the backup vault to a vault in the source account and restores it there,
  which is AWS's documented cross-account restore path and the route a real recovery would take. It
  costs one copy per drill and writes into the source account.
  So: drop `AllowCiRestoreRoleToRestore` from `CrossAccountBackupVaultStack.java`, leaving
  `AllowCrossAccountCopy` and the deny guard; give the source account's drill role what a copy-back
  needs on both vaults and the KMS keys; rewrite `restore-drill.yml` around copy-then-restore; then
  redeploy the backup account stack. **Source**: run 34638032553; the live vault policy.
  **Owner**: Claude Code. **Model**: Sonnet.





- [ ] **B125. Return a real 403 from HMRC, and show HMRC's reason.**
  `http403ForbiddenFromHmrcResponse` in `app/services/hmrcApi.js:682` ends with
  `return http400BadRequestResponse(...)`. Twenty handlers under `app/functions/hmrc/` map
  `status === 403` to it, so an unsubscribed API or a missing scope reaches the caller as a
  malformed request. The 400's body already carries HMRC's explanation in `error.responseBody`; the
  pages discard it and show "An unexpected error occurred".
  **Operator decision, 2026-09-12: emit 403 and surface the body.** Both halves, so a user or a
  test sees the actual cause.
  Twenty handlers includes live VAT endpoints on prod, so verify against a deployed set before
  merge: the pages special-case 401 only, which suggests 403 falls through their generic error path,
  but that is an assumption until a run shows it. **Source**: probe-test run 34658969922;
  `app/services/hmrcApi.js:682-724`. **Owner**: Claude Code. **Model**: Sonnet.





- [ ] **B122. Clear the 214 eslint findings.** `npm run linting` runs again since batch 27, and
  reports 214 errors: 156 auto-fixable `prettier/prettier` formatting, the rest `no-var` and
  `no-empty` under `web/public/`. The lint job reports the total and gates only newly added files,
  so none of this blocks anything today.
  **214 down to 52, merged as `4918a0d0`.** The total was exactly right and its composition was not:
  `prettier/prettier` is 130, not 156; the 156 auto-fixable are 130 prettier plus 25 `no-var` plus 1
  `one-var`; and `no-var` + `no-empty` is 32 of the 84 non-prettier findings, not all of them.
  Fixed: the 130 formatting findings as one commit, then the 25 `no-var` in
  `widgets/page-chrome.js` and the 7 empty catches in `widgets/pass-redeemer.js`, each now saying
  why the failure is ignorable rather than swallowing it.
  Also fixed: CI's total step ran `npx eslint . --format unix 2>/dev/null | ... || true`, and
  `--format unix` needs `eslint-formatter-unix`, which ESLint dropped from core in v9 and this repo
  does not depend on. So the step exited 2 on every run and reported "0 finding(s)" every time. It
  now uses `--format json` and branches on the exit code.
  Remaining, and this is the rest of "fix all 214": **52 findings across twelve rules** in `app/`
  and `cdk-typescript/` — `no-unused-vars` 12, `sonarjs/unused-import` 11,
  `sonarjs/concise-regex` 7, `sonarjs/regex-complexity` 6, `sonarjs/no-clear-text-protocols` 3,
  `import/no-commonjs` 3, `sonarjs/super-linear-regex` 2,
  `sonarjs/no-nested-template-literals` 2, and one each of `one-var`,
  `sonarjs/prefer-single-boolean-return`, `sonarjs/no-os-command-from-path`,
  `sonarjs/no-nested-conditional`, `sonarjs/hashing` and `promise/always-return`. The regex and
  clear-text-protocol ones may be real defects rather than style; read each before rewriting it.
  Separately: this checkout's own `node_modules` has `typescript` 7.0.2 against a pinned 6.0.3,
  which crashes `ts-api-utils` and so `eslint` locally. `npm ci` fixes it; a clean worktree was
  never affected.
  **Operator decision, 2026-09-11: fix all 214.** Take the formatting pass as its own commit
  touching no logic, then the `no-var` and `no-empty` fixes as a second. The second half changes
  real code in pages covered only by the behaviour suites, so it needs those suites run against a
  deployed set rather than unit tests alone. **Source**: batch 27's lint job. **Owner**: Claude
  Code. **Model**: Haiku for the formatting pass, Sonnet for the code fixes.





- [ ] **B71.S3e. Migrate the books bucket, steps 2 to 7.** Step 1 shipped in PR #180: the
  `{prefix}-diya-gl-{account}` bucket exists beside `{prefix}-books-{account}` and both are in the
  backup selection. The books stay where they are until the rest runs.
  The sequence is in `PLAN_DIYA_GL_NAMING.md`: sync, cut the DIYA-GL Lambdas over and deploy,
  **re-sync until it copies nothing** — the step that cannot be skipped, because the app writes to
  the old bucket for the tens of minutes the deploy takes — verify a read, confirm an on-demand
  backup recovery point, then remove the old bucket. The old bucket goes only after the verified
  read and the recovery point, both.
  Handled as customer data whoever the books belong to, because this is the migration path the
  service needs the first time the answer is unambiguously a customer. Steps 2, 4 and 6 are AWS
  writes against prod data.
  **Operator decision, 2026-09-12: run unattended.** No per-step approval. The ordinary rule that
  an AWS write waits for the operator does not apply to this row. The safety is in the sequence
  rather than in a prompt: the re-sync must copy nothing before the cutover is believed, and the old
  bucket goes only after both a verified read and a confirmed on-demand recovery point. Do not
  reorder or skip either gate to save a step, and record the object counts at each sync. **Source**: `PLAN_DIYA_GL_NAMING.md`
  NM-S3. **Owner**: Claude Code, with the operator at the write gates. **Model**: Sonnet.
  **Code merged in #192, ci step 1 run.** PR #180 created the new bucket but left
  every DIYA-GL Lambda's `DIYA_GL_BUCKET_NAME` pointed at the old one; that is closed, and
  `_developers/RUNBOOK_DIYA_GL_BUCKET_CUTOVER.md` holds the six AWS steps per environment with both
  gates. ci step 1 copied 6 objects from `ci-env-books-367191799875` to
  `ci-env-diya-gl-367191799875`; both buckets now hold 6. prod starts at 16 objects / 146,299 B and
  waits behind ci's step 6, as the runbook orders it.
  Next, now #192 has deployed: ci steps 3 to 6, then prod steps 1 to 6. Step 6 removes the old
  bucket through CDK, never a raw `aws s3` delete.





- [ ] **B73. Prove an email-restricted pass works end to end.** The secret and the grant are both
  in place: `ci/submit/email-hash-secret` and `prod/submit/email-hash-secret` hold independent
  48-byte random values, and `EmailHashSecretHelper` grants them to the four pass Lambdas that
  reach `passService.js` — `passGet`, `passPost`, `passAdminPost`, `passGeneratePost` (PR #191,
  merged as `926e783d`). `passMyPassesGet` is excluded because it does not use `passService`.
  `initializeEmailHashSecret()` had never succeeded in any deployed environment, and the
  warn-and-carry-on path hid it, so nothing has yet exercised the working path. Remaining: create
  and redeem an email-restricted pass against ci and confirm the secret is fetched rather than
  warned past. **Source**: ci `pass-post` log, 2026-09-09; PR #191. **Owner**: Claude Code.
  **Model**: Haiku.

## Human and machine

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After O16: submit the
  FRS 105 accounts to the XML Gateway test service with the test presenter credentials (a
  GitHub environment secret), read the real acknowledgement and poll responses, settle the
  `Authority` element question (the worked example carries it, FormSubmission-v2-11 does not),
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, record what the sandbox returned in the simulator, then add `prod` to the
  `file-micro-entity-accounts` activity and to `resident-ltd`'s listing. **O16 is done**: Companies House's XML team issued the test presenter credentials on
  2026-09-11 and they are set as `COMPANIES_HOUSE_PRESENTER_ID` and
  `COMPANIES_HOUSE_PRESENTER_CODE` on the `ci` environment, reaching Secrets Manager as
  `ci/submit/companies-house/presenter_id` and `presenter_code`.
  The email settles three things the code had left open, and the code already has a place for each:
  **Test Flag 1** is `buildAccountsSubmission`'s `gatewayTest`, which emits
  `<GatewayTest>1</GatewayTest>` (`companiesHouseXmlGateway.js:101`); **Test Package Reference
  0012** is its `packageReference`, whose JSDoc still says "blank until Companies House issues one"
  (`:138`); and **submission numbers must be unique and incremental**, which
  `allocateSubmissionNumber()` already satisfies with an atomic DynamoDB counter
  (`:280`), keyed apart from real request ids.
  The gap: `companiesHouseAccountsPost.js:233` passes neither `gatewayTest` nor `packageReference`,
  so both fall to their defaults of `false` and blank. Wire both from configuration rather than
  hardcoding them, because the live service wants the opposite of the test service on both. Do not
  let a re-run reset the submission counter — the test service rejects a repeated or lower number
  outright, and a rejection costs a round trip through their reviewer.
  Then the human half: Neal at `xml@companieshouse.gov.uk` reviews the submissions once told they
  exist, so the row finishes with an email naming what was submitted.
  **Source**: BACKLOG 34b; the XML team's email of 2026-09-11.
  **Owner**: Claude Code, then Operator. **Model**: Sonnet.



- [ ] **B135. Point the support requests at the spreadsheets repository's issues.** Three entry
  points send customers to this repository's issues today, and all three move:
  `web/public/help.html:74` (`issues/new?template=support.md`), the FAQ answer at
  `web/public/faqs.toml:364`, and the support form, whose Lambda POSTs to
  `https://api.github.com/repos/${GITHUB_REPO}/issues` (`app/functions/support/supportTicketPost.js:87`
  and `:93`).
  **The trap: `GITHUB_REPO` is shared.** It is set from `props.githubRepo()` in `AccountStack.java:555`
  and the same value feeds `IngestionStack.java:533` and `SecurityLakeStack.java:166`, while
  `OpsStack.java:204` uses `props.opsGithubRepo()` for the alarm issues. Changing the shared value
  would move alarm and security-lake issues too, which is not what this asks. Give the support path
  its own configuration point and leave the others alone.
  Cross-repository prerequisites, which is the human half: `diy-accounting-uk/spreadsheets.diyaccounting.co.uk`
  needs issues enabled and a `support.md` issue template matching this repository's
  `.github/ISSUE_TEMPLATE/support.md`, or the `?template=` parameter silently falls back to a blank
  issue. The token the support Lambda uses must also be able to write issues there — today it is
  scoped to this repository. Say which token, because O38's `diya-ops` app is the intended long-term
  answer and a PAT would be the interim one.
  Never edit `web/public-simulator/**`; it is regenerated from `web/public/`.
  **Source**: operator request, 2026-09-12. **Owner**: Claude Code, with the operator for the
  spreadsheets repository's settings and the token. **Model**: Sonnet.

- [ ] **O36. Land the homebrew tap's release trigger and its ruleset.** `REPORT_HOMEBREW_DIYA_GL_CRON.md`
  (on the batch branch) has the detail and the exact commands. Three writes, none of them ours to
  make: create a fine-grained PAT scoped to `homebrew-diya-gl` with contents read and write and put
  it on `spreadsheets.diyaccounting.co.uk` as `HOMEBREW_DISPATCH_TOKEN`, because the default
  `GITHUB_TOKEN` cannot dispatch across repositories; apply the ruleset (deletion and
  non_fast_forward on the default branch, the same shape all five siblings carry, which still
  allows the bot's fast-forward pushes) with
  `gh api --method POST repos/diy-accounting-uk/homebrew-diya-gl/rulesets --input ruleset.json`;
  and make the two workflow edits, swapping the hourly poll for a `repository_dispatch` fired by
  the npm publish step in the spreadsheets repository. The poll turned out to be cheaper than it
  looked — 12 scheduled runs in the repository's first 61 hours, not one an hour, because GitHub
  delays schedules — but it still polls a registry that could just tell it. **Source**: B81's
  report. **Owner**: Operator, or Claude Code once the operator says the writes are approved.
  **Model**: none.

- [ ] **B80b. The identity guard has to reach the other four repositories.** Submit carries
  `.github/allowed-commit-identities.yml`, `.github/workflows/identity-guard.yml` and
  `scripts/check-commit-identities.sh`: a pull-request check that fails when a commit's author email
  is not on a plain, human-edited allow list. Spreadsheets is the one with the actual incident —
  twenty commits authored `noreply@anthropic.com` by a sub-agent setting the identity inline — so it
  goes first; `www`, `root` and `archive` follow.
  **Operator decisions, 2026-09-12.** All four from worktrees in this session, one PR each, no
  sibling checkout touched — the method already used for the attribution-pointer PRs. Each allow
  list is derived from that repository's own author history, and the PR body prints every address
  with its commit count and date range so the operator strikes or approves each before merge. The
  check fails the PR, matching submit, rather than reporting non-blocking.
  **Source**: B80's fix. **Owner**: Claude Code, operator reviews each list. **Model**: Haiku per
  repository.

## Human-only

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34; **Owner**: Operator. **Model**: none.


- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34.
  **Owner**: Operator. **Model**: none.


- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.


- [ ] **B129. Decide whether deleting an ITSA loss claim or adjustment costs a token.**
  `hmrcItsaLossesAndClaimsDelete` and `hmrcItsaTaxLiabilityAdjustmentsDelete` now charge one token,
  under `self-employed-year-end`, because a DELETE to HMRC is a write and the catalogue prices the
  page rather than the verb. The other reading is that a correction should be free: a customer who
  files a wrong claim then removes it pays twice for one net submission, and the delete sends no new
  figures to HMRC.
  Two named alternatives. **Keep them charged**: pricing follows the page, one rule, nothing to
  explain in the catalogue. **Make them free**: deletes move to `self-employed-read`, or to a third
  activity at `tokenCost = 0`, and the catalogue grows a distinction between submitting and undoing.
  Nothing else in the product prices an undo today, so there is no precedent either way.
  **Source**: B117's wiring pass, 2026-09-12. **Owner**: Operator. **Model**: none.

- [ ] **O38. Create the two GitHub Apps the audit ranks joint second.** `diya-ops`, to carry all
  three Lambdas' writes, which separates 55 alarm issues and every support ticket from the
  operator's own account and is the single move that fixes the worst disclosure gap; and
  `diya-agent`, for unattended model runs, so a reader can tell a model's PR from a pipeline's and
  our commits stop being attributed to the GitHub user `claude`. Both are free: an app to create
  and a private key into Secrets Manager. Neither depends on signing. B77's support-form work now reads the same
  `OPS_GITHUB_TOKEN_SECRET_ARN` config point the alarm Lambda uses, so rotating the secret
  `{env}/submit/github/issue_bot_token` in ci and prod to the app's token moves both public-write
  paths onto it at once, with no code change and no new secret name. While deciding, settle recommendation 12 as well: the byline on articles
  and support replies, before the emails-to-articles pipeline is built, because that is the largest
  volume of machine-written public prose the company will produce. **Source**:
  `REPORT_IDENTITY_AUDIT.md` section 8, recommendations 2, 3 and 12. **Owner**: Operator.
  **Model**: none.


- [ ] **O37. Turn on SSH commit signing.** `REPORT_GIT_CONFIG.md` settles what the config should
  be and why: keep `pull.rebase=true`, because a rebase re-signs each replayed commit when
  `commit.gpgsign` is a standing default rather than a per-commit flag, and keep
  `rerere.enabled=true`, whose guard is `rerere.autoupdate` staying unset so a replayed resolution
  still pauses for review. What is left is three global lines and registering the key: set
  `gpg.format ssh`, `user.signingkey` and `commit.gpgsign true`, and add the SSH key as a signing
  key on the GitHub account. One global config covers all six repositories, since each has one
  committer. `verify-commit-signatures.yml` is on the batch and reports each commit's
  `verification.verified` in the job summary without failing, because no commit is signed yet;
  flip its last step to fail and make it a required ruleset check once signing is routine. This
  is what every auto-merge policy in `PLAN_REPOSITORY_AUTOMATION.md` rests on. **Source**:
  `REPORT_GIT_CONFIG.md`; `REPORT_IDENTITY_AUDIT.md` section 9. **Owner**: Operator. **Model**:
  none.


- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **B11.T9. ITSA phase 2: the DIYA-GL-to-submission path.** `PLAN_ITSA_PHASE_2.md` T9: the
  MCP tools `derive_itsa_quarterly_update` and `derive_itsa_annual_submission` in the MCP
  package, and an import control on `annualSubmission.html` that fills the form from a book.
  The spreadsheets side's T8 design finds the shipped self-employed template cannot source 31
  of the 55 ITSA field slots, so the derivations omit those fields; this row must send an
  omission, never a zero, for a field the book does not carry. Two findings from their side carry
  SED ids and one changes what this row must do: SED-10 says the self-employed field set changes by
  tax year — `sa103-mtd-mapping.json` records two allowances gone from 2025-26, an adjustment gone
  from 2026-27 and two fields added — and their `se-derivations.js` reads none of it, so a book for
  a year past 2024-25 can carry a field HMRC no longer accepts. The figures are year-agnostic; only
  the field set moves. Either wait for their SED-10 or filter by year on this side, and say which.
  SED-2 is theirs: fourteen disallowable categories, seven annual fields and four adjustments the
  shipped template cannot source at all, which arrive omitted rather than zeroed.
  **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T9. **Owner**: Claude Code. **Model**:
  Sonnet. Blocked on the spreadsheets repository's ITSA-T8 (the two self-employed derivations)
  and on `PLAN_SUBMISSION_MCP.md` M1.



- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** Batch 9 (6957651c) carries
  the suites' sandbox sign-in with the authenticator step, off by default: `deploy.yml` and
  `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of O17's four
  values that is empty. Against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17.



- [ ] **B25c. Issue #11, backups outside the account.** The drill's own state is now known and
  written up in `_developers/RESTORE_DRILL.md`: `restore-drill.yml` has never run, and two things
  stop it. The vault's restore grant names a role nothing can assume (B105), and the backup
  account's stack has not been deployed since before that grant landed (O41). What is proven
  meanwhile is the copy side: fresh completed recovery points exist for all five critical prod
  tables and both books buckets, and `restore-test.yml`'s monthly in-account restore has passed
  three of its last four runs, most recently restoring 4826 receipt items against a live source of
  4832. A comment saying exactly this is drafted and not yet posted. After B105 and O41, run the
  drill and settle the issue on its result. **Source**: issue #11. **Owner**: Claude Code.
  **Model**: Sonnet. Blocked on O41x: the drill cannot run until the vault accepts a restore
  grant at all, and today's dispatch proved the current design does not deploy.



- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22.



- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32.



- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.



## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
