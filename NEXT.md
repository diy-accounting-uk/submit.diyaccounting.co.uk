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

**Prod runs deployment prod-7b75b75** (the merge of PR #177, run 34494648968). That run's
`destroy-previous` retired prod-b95799e cleanly, which is the destroy hardening working on its first
outing — the earlier attempt was abandoned by a Maven Central 403. Two spares stand at $46.88/month
each: prod-504ec0d, created 09:00 UTC and past the eight-hour gate, and prod-c78fb84, six stacks from
the deploy that died at `deploy api`, eligible 19:07. Both go on the next scheduled sweep, or sooner
by name (`_developers/archive/PLAN_COST_OPTIMISATION.md`).

The board runs in four sections, in this order: in flight; ready, Claude Code; ready, operator;
blocked (either owner, the blocker named). Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

**Batches 18 and 19 are on main** (PR #175 at c78fb846, PR #176 at b95799e1), and main is
deploying b95799e1 to prod now. That run carries the DIYA-GL stack rename to prod. The cost export
is fixed and live: `deploy cost export` is green and both exports read HEALTHY, which took two
layers — B84's column casing and B89's `us-east-1` region in the bucket policy condition.

**Batch 20 merged as PR #177 at 7b75b75d**, eight items, and the merge took the branch tip — head
102b01b matched the pushed tip, so nothing was orphaned this time. Main is deploying it now. S3d is
on main and the sibling repository has the second of its three lines; the third goes when it reaches
prod.

**The API route prefixes are permanent.** Operator decision, 2026-09-10: both `/api/v1/books/*`
and `/api/v1/diya-gl/*` are served for good and the old prefix is never retired. The spreadsheets
repository changes nothing, now or ever, and their NM-5 is not blocked on us — it is not needed. The
route path is a code identifier no customer sees; the DIYA-GL rename was about the product, and that
is shipped. Retiring the old prefix was tidiness whose cross-repository sequencing cost more than it
was worth. B71.S3e, the bucket, is the last naming row and is internal.

**Batch 21 on `claude/b21-board`**, two workstreams:

| Workstream | Item | Model | Worktree | Branch |
|---|---|---|---|---|
| The environment deploy's paths filter | B100 | Sonnet | `.claude/worktrees/w-envpaths` | `claude/b21-envpaths` |
| Both route prefixes made permanent | B71.S3d.1 | Sonnet | `.claude/worktrees/w-permanent` | `claude/b21-permanent` |

B100 is merged: `deploy-environment.yml`'s `paths:` filter named environment stack sources by hand
and had drifted. `ScanDetectionStack` and `SecurityDetectionStack` were deployed by the workflow and
watched by nothing — two, not three; `EcrUE1Stack` is a second instantiation of the `EcrStack`
construct and has no source file of its own, so it was already covered. A unit test now parses the
workflow and asserts every stack it deploys is watched, proved by failing on the pre-fix state. A change to any of the
three never triggers the deploy that ships it. B30t changed `SecurityDetectionStack.java` and
shipped only because its batch also touched other watched paths; pushed alone it would have looked
deployed and not been. The fix adds the three and then makes the drift impossible, because a
hand-maintained list is what broke.

A worktree agent runs `npm run bundle` before any unit, system or browser suite:
`web/public/submit.bundle.js` is gitignored, `pretest` fires only for bare `npm test`, and without
it nine tests fail on a missing file that has nothing to do with the change.

## Ready: Claude Code

- [ ] **B102. The destroy's safety refusal no longer stops the destroy.** `destroy prod from main`
  run 34512145857, job 102988742496, dispatched 18:05 UTC on 2026-09-10. Step 10, "Refuse to destroy
  the live or last known good deployment", **failed** — and steps 16 to 22 ran anyway, including
  step 19, "Delete stacks in dependency order". The refusal is the one thing standing between a
  dispatch and deleting the live production deployment, and it currently stops nothing.

  The cause is this batch's own O42 fix. It gave the AWS-CLI steps `if: ${{ !cancelled() }}` so a
  failed `Build CDK` could not abandon a retirement those steps never needed. `!cancelled()` is also
  true when an *earlier* step failed, so the guards let the destroy run past the refusal as well.
  The guards were right about the build and wrong about everything before it.

  Nothing was harmed this time, and only by luck: the deployment name was malformed, so the deletion
  matched no stacks. All three prod sets stand and prod-7b75b75 is live, confirmed after the run.

  Two more faults in the same job, and they are why the refusal fired at all. The dispatch input
  carried a **leading space** — the log shows `DEPLOYMENT:  prod-c78fb84` and the refusal printed
  `Refusing to destroy [ prod-c78fb84]: not an app deployment name` — and nothing trims it. Then step
  23, "Delete leftover Lambda log groups", passed that same untrimmed value to `DescribeLogGroups`
  and got `InvalidParameterException ... failed to satisfy constraint`, because a space is not legal
  in a log group prefix.

  So: make every step after the refusal conditional on the refusal having succeeded, not merely on
  the job not being cancelled, while keeping O42's property that a failed build does not abandon a
  retirement. Trim the input where it is read. Validate the deployment name before any AWS call
  rather than letting a malformed one reach three different APIs. Apply all of it to
  `destroy-ci.yml` too, which carries the same guards. **Source**: run 34512145857. **Owner**:
  Claude Code. **Model**: Sonnet.

  It has now fired twice: run 34512761956, dispatched 18:11 UTC, failed at the same step 10. Both
  spare prod sets are still standing because of it, and no destroy should be dispatched again until
  this row lands.
- [ ] **B101. A ci set outlived its own self-destruct.** `ci-claudf179` was created 13:04 UTC with
  `SelfDestructStack` scheduled two hours out, and at 16:41 it was still standing with all nine
  stacks. A second set, `ci-claud6807`, went up at 16:13, so two ci sets stand at once. The sweep in
  `destroy-ci.yml` is the backstop and runs at 18:34, but the per-set self-destruct is what should
  have taken it and did not. Find whether the schedule fired and failed, or never fired: the stack
  exists, so the rule should be readable with `aws --profile submit-ci events describe-rule` and the
  Lambda's own log group says whether it ran. A self-destruct that does not fire turns every ci
  deploy into a set the sweep has to catch, which is how sets accumulate. **Source**: this board's
  deployment pass, 2026-09-10 16:41 UTC. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B92. A prod destroy can still overlap a prod deploy.** B90 could not close this one with a
  concurrency group, and the reason is worth keeping: `deploy.yml` calls `destroy-prod.yml`
  directly as its `destroy-previous` job, so if both resolved to the same group name that call
  would wait on a slot its own parent run holds — a permanent deadlock. They are on deliberately
  distinct names as a result, which leaves a `destroy-prod.yml` run started on its own (its
  schedule, or a dispatch) able to overlap a `deploy.yml` prod run that did not spawn it. The
  existing `wait-for-ci-deploys` action solves exactly this shape for ci by polling for older
  unfinished runs rather than using a concurrency group, and its own comment explains why: GitHub
  keeps only one run queued per group and drops the older one when a third arrives. Prod needs the
  same mechanism, which is new work rather than another key. **Source**: B90's finding,
  2026-09-10. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod, where B17b.1 is now live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. **Source**: BACKLOG 17b, 17c. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B11.T11 to T14. ITSA phase 2: UK property.** `PLAN_ITSA_PHASE_2.md`'s four property
  tracks: the period summary's four handlers, the annual submission, the adjustable summary, and
  the property pages with the business picker. Each copies its self-employment twin and differs
  only in the path, the body field names and the scenario set, all of which the plan lists. The
  ten endpoint tracks share a spine of files (`SubmitSharedNames.java`, `SubmitApplication.java`,
  `DataStack.java`, `HmrcStack.java`, their two tests, `app/bin/server.js`,
  `app/http-simulator/server.js`, `cdk.json` and the `.env.*` files), so they hold it one at a
  time, each rebasing on the previous merge. **Source**: `PLAN_ITSA_PHASE_2.md` T11 to T14.
  **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B11.T15 to T19. ITSA phase 2: the mixed year and the cumulative period summaries.**
  `PLAN_ITSA_PHASE_2.md` T15 (the business picker and the mixed-customer year end), T16 (the tax
  year model and the shared validator, Haiku), T17 and T18 (the self-employment and UK property
  cumulative period summaries, which is what 2025-26 onwards actually files) and T19 (the
  cumulative pages). Same shared spine and the same one-at-a-time rule as T11 to T14.
  **Source**: `PLAN_ITSA_PHASE_2.md` T15 to T19. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B11.T21 and T22. ITSA phase 2: losses, claims and tax liability adjustments.** The
  Individual Losses 7.0 and Individuals Tax Liability Adjustments 1.0 endpoints, then their two
  pages. The operator decided on 2026-09-09 to build these rather than declare the product does
  not offer those journeys, and B11.T10's recognition pack answers for all nine APIs on the back
  of them. A sole trader making a loss is the ordinary first year of trading, so Individual
  Losses earns its build on its own. Both pages include `submission-cost.js` and both say the
  write is free. **Source**: `PLAN_ITSA_PHASE_2.md` T21, T22; operator, 2026-09-09. **Owner**:
  Claude Code. **Model**: Sonnet.
- [ ] **B25c. Issue #11, backups outside the account, is still open.** It is labelled
  in-progress and has no row here, so nothing was driving it. B25 landed the cross-account vault
  and the ci restore role's read and restore grants, and `restore-drill.yml` reached main in batch
  16, which is the proof the issue was waiting for. Run the drill against the prod vault, record
  what it restored and how long it took, and either close #11 on that evidence or say in the issue
  what is still missing. **Source**: issue #11; BACKLOG 25. **Owner**: Claude Code. **Model**:
  Sonnet.
- [ ] **B80b. The identity guard has to reach the other four repositories.** Submit now carries
  `.github/allowed-commit-identities.yml`, `.github/workflows/identity-guard.yml` and
  `scripts/check-commit-identities.sh`: a pull-request check that fails when a commit's author
  email is not on a plain, human-edited allow list. Spreadsheets is the one with the actual
  incident, twenty commits authored `noreply@anthropic.com` by a sub-agent setting the identity
  inline, so it goes first; `www`, `root` and `archive` follow. Each needs the allow list adjusted
  to its own legitimate committers. The submit session does not edit sibling repositories, so
  spreadsheets takes its own copy through its board and the other three need a session or the
  operator. **Source**: B80's fix. **Owner**: Operator to route, Claude Code in each repository.
  **Model**: Haiku per repository.
- [ ] **B71.S3e. DIYA-GL naming: the bucket.** `{prefix}-books-{account}` to
  `{prefix}-diya-gl-{account}` in `DataStack.java`, `SubmitSharedNames.java` and
  `BackupStack.java`. S3a decided the rename needs no data copy: `list-object-versions` on
  `prod-env-books-972912397388` returns nothing and ci holds only behaviour-run objects, and
  the lifecycle rules and the AWS Backup selection follow the CDK name. Re-check both buckets
  first and stop if either holds an object, in which case S3a's copy sequence applies.
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.

## Ready: operator

- [ ] **O40. Create the five `origin:*` labels.** B87 applies them from the creating paths already,
  through the raw `gh api .../labels` endpoint rather than `gh pr create --label`, so a missing
  label does not fail anything — but until they exist with real descriptions and colours they carry
  no meaning to a reader. The five commands are in B87's report and the classes are
  `REPORT_IDENTITY_AUDIT.md` section 3's. **Source**: `REPORT_IDENTITY_AUDIT.md` recommendation 6.
  **Owner**: Operator. **Model**: none.
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
- [ ] **O34. Subscribe the HMRC sandbox application to five ITSA APIs.** The sandbox year's
  first run stopped on its first call: `DELETE .../self-assessment-test-support/vendor-state`
  answered `403 RESOURCE_FORBIDDEN`, "The application is not subscribed to the API which it is
  attempting to invoke". On the HMRC Developer Hub, open the sandbox application with client id
  `uqMHA6RsDGGa7h8EG2VqfqAmv4tV` and subscribe it to Self Assessment Test Support, Obligations,
  Self Employment Business, Business Source Adjustable Summary and Individual Calculations.
  Only the Developer Hub account holder can do this; no stored credential in `.env*` or Secrets
  Manager reaches it. Unblocks B11.T7's run. **Source**: `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`
  run record. **Owner**: Operator. **Model**: none.
- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34;
  issue #15. **Owner**: Operator. **Model**: none.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34.
  **Owner**: Operator. **Model**: none.
- [ ] **O16 / B34b. Activate the XML Gateway test presenter account.** Companies House's XML
  team (Ioan, xml@companieshouse.gov.uk) replied on 2026-09-07: they activate a test account
  once they have the presenter's name, contact name, address, email address and telephone
  number, and then issue the test presenter credentials to use in every test submission; the
  specification they pointed at is the public TIS set the build already follows. Reply with
  the five details (DIY Accounting Limited; Antony Cartwright; the registered office, 37
  Sutherland Avenue, Leeds, LS8 1BY; antony@diyaccounting.co.uk; the telephone number). When
  the credentials arrive, put them on the GitHub `ci` environment as the secrets
  `COMPANIES_HOUSE_PRESENTER_ID` and `COMPANIES_HOUSE_PRESENTER_CODE` and tell Claude Code,
  which starts B34.6b. Nothing blocks the reply itself; chase on 2026-09-21 if silent. **Source**: BACKLOG 34b.
  **Owner**: Operator. **Model**: none.
- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.
- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator. **Model**: none.
- [ ] **O28. Read HMRC's August fraud-prevention-header advisories.** The new monthly check's
  first dry run over the mail mirror found HMRC's 2026-09-02 email reporting August 2026 with
  advisories to review. Open it (from noreply@tax.service.gov.uk, subject "Improve fraud
  prevention headers for DIY Accounting Submit"), read which headers it names, and hand the list
  to Claude Code for the fix in `app/lib/fraudPreventionHeaders.js` or wherever the named header
  is built. **Source**: B22's first run, 2026-09-08. **Owner**: Operator. **Model**: none.
- [ ] **O39. Two attribution rules contradict each other; pick one.**
  `REPORT_IDENTITY_AUDIT.md` recommendation 5 wants one canonical `Co-Authored-By` trailer in all
  six `CLAUDE.md` files, because fourteen forms in the history is one of the signals behind the May
  2026 suspension (`_developers/archive/PLAN_FLAGGED.md`). But the trailer is not set by any
  `CLAUDE.md` today: it arrives per session from the harness, which names the model that did the
  work and says it replaces any earlier attribution guidance. Every commit in batches 17 and 18
  carries `Claude Opus 5 (1M context)` for that reason. So the two rules want different things:
  one form that never varies, against a form that says which model wrote the code. Decide which
  matters more and where the answer lives, since a rule written into `CLAUDE.md` loses to the
  per-session instruction anyway. **Source**: `REPORT_IDENTITY_AUDIT.md` recommendation 5; B87's
  finding. **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **B11.T7r. ITSA phase 2: run the sandbox year.** The script and the runbook
  (`_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`) are on main; the first run stopped on its first
  call with `403 RESOURCE_FORBIDDEN`. Re-run it after O34, work through whatever the sandbox
  answers next, and record the run in the runbook. **Source**: `PLAN_ITSA_PHASE_2.md` T7.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on O34.
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
- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22.
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
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After O16: submit the
  FRS 105 accounts to the XML Gateway test service with the test presenter credentials (a
  GitHub environment secret), read the real acknowledgement and poll responses, settle the
  `Authority` element question (the worked example carries it, FormSubmission-v2-11 does not),
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, record what the sandbox returned in the simulator, then add `prod` to the
  `file-micro-entity-accounts` activity and to `resident-ltd`'s listing. **Source**: BACKLOG
  34b. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O16.
- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.
- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32.
- [ ] **B52x. Pull a day of the raw export and count every field.** The first nightly to include
  the raw-export step, 02:15 UTC on 2026-09-10, failed on all three attempts: the
  `prod-env-raw-export-publish` Lambda's role carried `s3:PutObject` on `exports/*` and no
  `GetObject` or `ListBucket`, so Athena could not read the curated data its 21 views select from,
  and it failed before writing a single file. `AnalyticsDashboard.java`'s metrics-publish Lambda
  runs the identical Athena-over-the-lake pattern and already had both grants; `RawExport.java`
  never got them. The grants are on batch 18. The first real export is the next 02:15 UTC run after
  that reaches prod. Then pull one day through the notebook's data path
  (`PLAN_ONE_STOP_DASHBOARD.md` D16's export) and list every field with its count of non-empty
  entries, so a field that never fills is found now rather than in three months. Proof the run
  worked: 21 CSVs and 8 JSONs under `exports/prod/<date>/`, and the state machine's execution
  showing SUCCEEDED through its raw-export step. **Source**: BACKLOG 52; plan row D16; the failed
  execution of 2026-09-10. **Owner**: Claude Code. **Model**: Haiku. Blocked until batch 18 reaches
  prod and one nightly runs.
- [ ] **B73. The email hash secret has never existed in any account.** `initializeEmailHashSecret()`
  reads `${env}/submit/email-hash-secret`, and `aws secretsmanager list-secrets` shows no such
  secret in ci or prod; no Lambda role is granted it. `PLAN_PASSES_V2.md` still has "Add
  `EMAIL_HASH_SECRET` to Secrets Manager and wire to Lambdas" unchecked, so the call has always
  failed in a deployed environment and the warn-and-carry-on path hid it. Passes now fetch the
  secret only when a pass carries an email restriction, so the failure surfaces on those passes
  alone; an email-restricted pass can still be neither created nor redeemed anywhere. Creating
  the secret material is an AWS write and a decision about the value, so the operator settles it,
  then the grant goes in beside the salt's in `AccountStack.java`. **Source**: ci `pass-post` log,
  2026-09-09. **Owner**: Operator, then Claude Code. **Model**: Haiku for the grant.
- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
