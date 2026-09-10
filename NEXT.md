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

**Prod runs deployment prod-318271f (the merge of PR #168, run 34414615907, its EdgeStack
updated 2026-09-09 23:30 UTC and its last stack 23:36), which retired prod-15f3483 in its own
destroy-previous job; no spare stands.** A main deploy retires the previous set
itself; a `prod-*-app-*` set left standing by anything else costs $46.88/month until named to
`destroy-prod.yml` (`_developers/archive/PLAN_COST_OPTIMISATION.md`).

The board runs in four sections, in this order: in flight; ready, Claude Code; ready, operator;
blocked (either owner, the blocker named). Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

**Batch 17 on `claude/b17-board`, PR #169.** The integration branch has its own worktree at
`.claude/worktrees/b17`; every sub-agent worktree branches from `claude/b17-board`, not from
`main`, and merges it before starting. Opened with B84 and B83, the two red pipelines. Waves land
on this one branch and push in batches, because a branch deploy is expensive and slow.

Wave 1 runs as eight concurrent worktree sub-agents, each on its own branch off
`claude/b17-board`, each merged into the batch as it lands:

| Workstream | Item | Model | Worktree | Branch |
|---|---|---|---|---|
| Alarm filters | B30t | Sonnet | `.claude/worktrees/w-alarmfilter` | `claude/b17-alarmfilter` |
| Gateway CORS | B76 | Sonnet | `.claude/worktrees/w-gatewaycors` | `claude/b17-gatewaycors` |
| Comment disclosure | B79 | Haiku | `.claude/worktrees/w-disclosure` | `claude/b17-disclosure` |
| Support form | B77 | Sonnet | `.claude/worktrees/w-supportform` | `claude/b17-supportform` |
| Git config and signing | B82 | Sonnet | `.claude/worktrees/w-gitconfig` | `claude/b17-gitconfig` |
| Foreign identities | B80 | Sonnet | `.claude/worktrees/w-identities` | `claude/b17-identities` |
| Alarm triage design | B78 | Opus | `.claude/worktrees/w-triagedesign` | `claude/b17-triagedesign` |
| Homebrew tap cron | B81 | Sonnet | `.claude/worktrees/w-homebrew` | `claude/b17-homebrew` |
| Workflow concurrency | B85 | Haiku | `.claude/worktrees/w-concurrency` | `claude/b17-concurrency` |

Merged into the batch, off this list when the branch's checks pass: B79, B81, B82, B80's
submit half, B85, B30t, B76, B78's comparison, B77, B88.

Wave 2 takes the DIYA-GL deployed-identifier chain (B71.S3b to S3e, serialized, one worktree) and
the ITSA phase 2 tracks (B11.T20 first, then T11 to T14 on the shared spine). It branches off
`claude/b17-board` once wave 1's PR is stable.

A worktree agent runs `npm run bundle` before any unit, system or browser suite:
`web/public/submit.bundle.js` is gitignored, `pretest` fires only for bare `npm test`, and without
it nine tests fail on a missing file that has nothing to do with the change.

## Ready: Claude Code

- [ ] **B84. Every main deploy fails on the cost export.** `deploy environment from main` run
  34414615591 failed at `cost-CostExportStack`: `AWS::BCMDataExports::Export` answered 400,
  "the columns in the query provided are not a subset of the table FOCUS_1_2_AWS", and the stack
  rolled back. `FOCUS_1_2_COLUMNS` was written in Glue's snake_case; the live schema
  (`aws bcm-data-exports get-table --table-name FOCUS_1_2_AWS`) names all 60 columns in
  PascalCase, with only the three AWS extension columns keeping a lowercase `x_` prefix. Glue and
  the Athena views over `cost_focus` want the snake_case spellings, so the fix derives one from
  the other rather than pairing two lists. The fix is committed on the local branch
  `claude/cost-focus-columns` at `4c74a0b2` and has never been pushed: push it, open the PR, and
  read the next environment deploy to confirm the export creates. Until it does, prod has no
  FOCUS export and the cost panel's source is empty. **Source**: run 34414615591. **Owner**:
  Claude Code. **Model**: Haiku.
- [ ] **B83. `copilot-setup-steps.yml` has failed every run since 2026-08-24.** It runs on pushes
  that touch its own file, so it is a red check on those PRs that teaches everyone to ignore a red
  check. The cause was that the `copilot` GitHub environment held neither `SUBMIT_ACTIONS_ROLE_ARN`
  nor `SUBMIT_DEPLOY_ROLE_ARN`, so `role-to-assume` resolved to an empty string. The job installs
  uv and nothing else, so it needs no AWS credentials at all: the fix removes both configure steps,
  and is committed on the local branch `claude/ops-copilot-setup` at `d158cb45`, never pushed.
  Push it and open the PR. It also leaves the two role ARNs unused on the `copilot` environment,
  where they would hand an unattended agent the ci deployment role, so ask the operator to clear
  them once the PR merges. `security-review.yml` assigns an OWASP issue to GitHub's Copilot coding
  agent with its weekly cron commented out; decide whether either stays in the same pass.
  **Source**: runs on `main` and `claude/b16-board`, 2026-09-09. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod, where B17b.1 is now live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. **Source**: BACKLOG 17b, 17c; issue #19. **Owner**: Claude
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
- [ ] **B11.T20. ITSA phase 2: the submission cost line.** `submission-cost.js` above the submit
  control on every ITSA page that writes, saying what the submission costs before the customer
  sends it. Every page T14, T19 and T22 add includes it, so it lands before or with them.
  **Source**: `PLAN_ITSA_PHASE_2.md` T20; plan row D8. **Owner**: Claude Code. **Model**: Sonnet.
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
- [ ] **B71.S3b. DIYA-GL naming: the CDK and workflow identifiers nobody else consumes.**
  `BooksStack` to `DiyaGlStack` and its literal name in `deploy.yml`, `destroy-ci.yml`,
  `destroy-prod.yml` and `stack-drift.yml`; `booksStackId`, `BOOKS_STACK_NAME`,
  `COGNITO_BOOKS_CLIENT_ID`, the lookup-resources outputs, the `deploy-books` job, the
  headers policy name, `BOOKS_ALLOWED_ORIGINS`, the `cdk.json` key and the CFN outputs, per
  S3a's order; a stack rename is a replacement, so it lands on a ci set first and on prod
  through one deploy of main. It also carries the four `app/functions/books/` modules and
  their unit tests, whose basenames are the deployed Lambda names. **Source**:
  `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B71.S3c. DIYA-GL naming: the Cognito client, the SSM parameter and the toggle flag.**
  `{env}-env-books-client` to `-diya-gl-client`, `/submit/{env}/spreadsheets-books-app-client-id`
  to `-diya-gl-app-client-id`, `--client books` to `--client diya-gl`, each with the window
  S3a sets so the spreadsheets side switches before the old name goes. **Source**:
  `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet. The
  spreadsheets side switches after ours, so nothing gates this.
- [ ] **B71.S3d. DIYA-GL naming: the API routes.** `/api/v1/books`, `/api/v1/books/{bookId}`
  and `/api/v1/books/{bookId}/versions/{version}` to their `diya-gl` forms in `EdgeStack.java`,
  `SubmitApplication.java`, `openapi.json`, `submit.catalogue.toml` and the handlers, both
  paths served for the window S3a sets, in step with the spreadsheets side's `cloud.js`.
  The spreadsheets NM-5 is blocked on this reaching prod. Watch for the shape their NM-4 hit:
  growing the closure can make a module reachable from the browser bundle, where work done at
  module scope runs where it never ran before. **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3.
  **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B71.S3e. DIYA-GL naming: the bucket.** `{prefix}-books-{account}` to
  `{prefix}-diya-gl-{account}` in `DataStack.java`, `SubmitSharedNames.java` and
  `BackupStack.java`. S3a decided the rename needs no data copy: `list-object-versions` on
  `prod-env-books-972912397388` returns nothing and ci holds only behaviour-run objects, and
  the lifecycle rules and the AWS Backup selection follow the CDK name. Re-check both buckets
  first and stop if either holds an object, in which case S3a's copy sequence applies.
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.
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
- [ ] **B86. The main API stamps `access-control-allow-origin: *` on every response.**
  `EdgeStack.java`'s `webResponseHeadersPolicy` sets it with `override(true)` on the whole
  `/api/v1/*` CloudFront behaviour, so it lands on every response whatever API Gateway or the
  Lambda underneath returned. That is why the authoriser's 401 was only visible on the DIYA-GL
  routes: those deliberately opted out of the stamp to keep a strict origin allow list and expose
  `ETag`. A wildcard is not credential-bearing, and these routes carry a bearer token rather than
  a cookie, so this is not the same defect B76 fixed. It is still a decision nobody has made on
  purpose: any origin can read a main-API response from a browser holding a token. Settle whether
  the main API gets the same allow list the storage routes use, or whether the wildcard is the
  intended answer for a public API, and write down which. Found while fixing B76. **Source**:
  B76's fix, 2026-09-10. **Owner**: Claude Code to propose, Operator to choose. **Model**: Sonnet.
- [ ] **B87. The identity audit's code recommendations, 5, 6, 7 and 10.**
  `REPORT_IDENTITY_AUDIT.md` section 8 ranks twelve. Numbers 4 and 9 landed in batch 17, 1 is O37,
  8 is BACKLOG 53, and 2, 3 and 12 need the operator (O38). These four are code and need nobody's
  permission: standardise the co-author trailer to one canonical form across all six `CLAUDE.md`
  files, which is what removes `_developers/archive/PLAN_FLAGGED.md`'s signal 8 and stops fourteen
  forms becoming twenty; create the five `origin:*` labels and apply them from the creating path;
  build the alarm-origin verifier, which re-reads `describe-alarm-history` for the name and window
  an issue body claims and is the strongest proof in the whole design; and add CODEOWNERS and a PR
  template carrying `Closes #N` and an origin line. The verifier is the one with real value, so it
  goes first and can ship without the other three. The trailer edit reaches five sibling
  repositories, so it follows B80b's routing rather than being done from here. **Source**:
  `REPORT_IDENTITY_AUDIT.md` section 8. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B78b. Finish the Bedrock triage path.** `PLAN_ALARM_TRIAGE_ORCHESTRATOR.md` compares
  four options and recommends this one: of the four causes in the failure history, the use-case
  form is filed, prod's Marketplace entitlement now reads authorized, and the twelve-turn cutoff is
  raised, which leaves one invalid CLI flag — `--permission-mode dontAsk` is not a value
  claude-code 2.0.30 accepts. The plan's execution steps are in its last section. Two things it
  found that matter as much as the flag: both `Run triage` and `Filter the output` pipe through
  `tee`, which merges stderr into the next step's input and hands the pipeline `tee`'s exit code,
  so `redact-triage-output.mjs`'s non-zero exits are thrown away and its error text gets posted as
  the triage; and ci's Marketplace entitlement is still `NOT_AVAILABLE`, which is 21 of the 55
  issues. The measured cost is $0.08 to $0.35 a triage, so $17 to $73 a month at 209 alarm issues a
  month — `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` section 6.3 assumed $1.05 a run, 3 to 13 times high.
  The proof is one live prod alarm on a current deployment triaged end to end, not a green badge:
  prod log groups keep three days and a retired deployment's groups are deleted outright, so a
  dispatch against an old issue reads an empty window and answers confidently about nothing.
  B88 fixed the spend guard, so the budget's deny action can see the spend this would create. **Source**: `PLAN_ALARM_TRIAGE_ORCHESTRATOR.md`.
  **Owner**: Claude Code, Operator to check the first triage. **Model**: Sonnet.

## Ready: operator

- [ ] **O35. Close three alarm issues.** #164 (`prod-env-hmrc-submission-failure`): the customer
  chose a period HMRC had no obligation for, retried and was accepted at 14:40 UTC on 2026-09-09;
  nobody wrote to support and no reply is owed. #166 and #167 (the two CIS alarms): both fired on
  our own prod deploys, and B30t stops them doing it again. All three name deployment
  prod-4600d25, which no longer exists. **Source**: this board's alarm pass, 2026-09-10.
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
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
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
  which starts B34.6b. Nothing blocks the reply itself; chase on 2026-09-21 if silent. **Source**: BACKLOG 34b; issue #15.
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
  omission, never a zero, for a field the book does not carry.
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
  selector fix. **Source**: BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17.
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After O16: submit the
  FRS 105 accounts to the XML Gateway test service with the test presenter credentials (a
  GitHub environment secret), read the real acknowledgement and poll responses, settle the
  `Authority` element question (the worked example carries it, FormSubmission-v2-11 does not),
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, record what the sandbox returned in the simulator, then add `prod` to the
  `file-micro-entity-accounts` activity and to `resident-ltd`'s listing. **Source**: BACKLOG
  34b; issue #15. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O16.
- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.
- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32.
- [ ] **B52x. A short extract from the raw export to prove every field fills.** The RawExport
  Lambda reached prod at 18:01 UTC on 2026-09-09, after that morning's 02:15 UTC nightly run,
  so nothing has been exported yet. The first files land at 02:15 UTC on 2026-09-10 in
  `s3://prod-env-analytics-lake-972912397388/exports/prod/2026-09-09/`: 21 CSVs, one per view,
  and 8 JSONs, one per objective. Then pull one day through the notebook's data path
  (`PLAN_ONE_STOP_DASHBOARD.md` D16's export) and list every field with its count of non-empty
  entries, so a field that never fills is found now rather than in three months. **Source**:
  BACKLOG 52; plan row D16. **Owner**: Claude Code. **Model**: Haiku. Blocked until the first
  export exists at 02:15 UTC on 2026-09-10.
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
  Blocked on the spreadsheets plan's LU-14 and H-LU-7 (the brand package existing).

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
