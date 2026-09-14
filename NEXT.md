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

**Prod runs deployment prod-b364438** (main at b364438e, the daily 04:11 UTC deploy cron run
5h39m late as run 34830100013, promoted 11:0x UTC on 2026-09-14, which destroyed `prod-5ca7bca`);
the only prod set.
**ci at 08:05 UTC**: no set standing; the sweep (run 34820856912) found none and set
`/submit/ci/last-known-good-deployment` to None.

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **human and machine**, **human-only**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `human-only` is work no session can do: an external registration, a console action with no
API, a filing against the operator's own company, an email from their address, a decision between
named alternatives. A row whose only human step is merging its PR is machine-only; that is the
standing workflow, not an action the row needs. Within a section, items run by the size of the
change to committed files, least first (operator, 2026-09-13); a row that changes nothing
committed — a comment, a run, a scan, a console action — comes before any code. Operator items
are briefed in `../BRIEF_OPERATOR_RUNBOOK_2026-09-13.md` at the workspace root,
with the detail behind each task in the four `../BRIEF_OPERATOR_TASKS_*.md` files
(`2026-09-13` carries the rows the earlier three do not).
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

- [ ] **B17v.1. Capture the five walkthrough videos.** The three prod captures are done
  (`view-liabilities` run 34651931632, `view-payments` 34689643435, `view-penalties` 34689889022).
  The `itsa-quarterly-update` capture (run 34774550386) stalled on the dashboard defect PR #201
  fixed; the three `itsa-business-details` captures on `ci-vatview` (runs 34790185457,
  34790343028, 34790629770) failed on browser errors and the scene fix sits on local branch
  `claude/b30-videos` (182acf07, worktree `.claude/worktrees/b30-videos`); no ci set stands, so
  both ci captures need a fresh ci deploy of `main`
  (`gh workflow run deploy.yml -f environment-name=ci -f deployment-name=<name>`).
  Then check all five artifacts and write `videos/publish.json`, replacing the 2026-09-07
  `itsa-business-details` entry. Two things the scripts could not settle: the quarterly-update
  script stops with the form filled except `businessId` (only known at run time), and
  `itsa-business-details.json` may no longer pass since the activity's first page is
  `dashboard.html`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.


- [ ] **B80b. The identity guard has to reach the other four repositories.** Submit carries
  `.github/allowed-commit-identities.yml`, `.github/workflows/identity-guard.yml` and
  `scripts/check-commit-identities.sh`: a pull-request check that fails when a commit's author email
  is not on a plain, human-edited allow list. Spreadsheets carries it on main (29e13023); the other
  three are open PRs on branch `claude/ops-identity-guard` in each repository, awaiting O46's
  review of their allow lists: www #31, root #32, archive #35. Left here: merge each once O46
  approves it.
  **Operator decisions, 2026-09-12.** All four from worktrees in this session, one PR each, no
  sibling checkout touched — the method already used for the attribution-pointer PRs. Each allow
  list is derived from that repository's own author history, and the PR body prints every address
  with its commit count and date range for O46's review. The check fails the PR, matching submit,
  rather than reporting non-blocking.
  **Source**: B80's fix. **Owner**: Claude Code. **Model**: Haiku per repository. **Size**: ~12 files.

## Machine-only

- [ ] **B47. Read the Monday crons' first run on their new slots.** `compliance.yml` (06:06 UTC
  Monday) and `stack-drift.yml` (06:36) moved off the top of the hour after firing five hours late
  on 2026-09-07; 2026-09-14 is their first Monday. Neither had fired by 11:50 UTC, and the same
  morning GitHub ran `deploy.yml`'s 04:11 cron at 09:50. Read both workflows' run lists: a
  schedule-triggered run dated 2026-09-14 closes backlog row 47, however late; none by Saturday's
  keepalive (08:15 UTC) makes `keepalive.yml` red and the row a fix. **Source**: BACKLOG 47.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: no committed files.

- [ ] **B30x. The CIS console-sign-in-without-MFA alarm fires on SSO sign-ins.** Issue #206:
  `prod-env-cis-console-signin-without-mfa` fired at 23:42 UTC on 2026-09-13 for the operator's
  own SSO console sign-in (CloudTrail: `ConsoleLogin`, `userIdentity.type = AssumedRole`,
  `AWSReservedSSO_AdministratorAccess`, `MFAUsed = No`, which is what every federated sign-in
  reports). CIS 3.2's own filter adds `$.userIdentity.type = "IAMUser"`; add that clause to the
  metric filter in `ObservabilityStack.java` with its test, and the issue closes when it reaches
  prod. **Source**: issue #206. **Owner**: Claude Code. **Model**: Haiku. **Size**: ~2 files.

- [ ] **B52v. Review the sign-in navigation on the operator dashboard.** The operator asked on
  2026-09-13 for the sign-in path of `https://submit.diyaccounting.co.uk/operator/dashboard.html`
  to be reviewed. The page carries its own auth section (`web/public/operator/dashboard.html`
  lines 90-93: "Not logged in" and a `../auth/login.html` link) and shows "Not authorised to view
  the operator dashboard." (line 300) when the bundle is missing. Walk the path signed out, signed
  in without the bundle, and signed in with it: does the page return to itself after sign-in, does
  the denial name the missing pass, and does the header match the rest of the site's sign-in
  controls. Fix what the walk shows, with a browser test under `web/browser-tests/`. The operator's first attempt at 23:38 UTC on 2026-09-13,
  signed in, ended in a 5xx: issues #204 (`prod-e371587-app-api-5xx`) and #203
  (`operator-snapshot-get-log-errors`); that deployment's logs are gone, so reproduce on
  `prod-b364438` or read the log of the next attempt (`/aws/lambda/prod-b364438-app-operator-snapshot-get`;
  `app/functions/analytics/operatorSnapshotGet.js`)
  and make the no-bundle path a 403 with a message naming the operator pass. Both issues close
  with this row. **Source**:
  operator, 2026-09-13. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** Submission 000004 (presenter
  E0000052288, company 06846849, 2026-09-13 19:04 UTC) was ACCEPTED by the XML Gateway test
  service; every `GetSubmissionStatus` poll for it answers 9999 "No presenter ID supplied". Since
  PR #207 the status poll logs the redacted request and response XML. Left: deploy a ci set from
  `main` (`gh workflow run deploy.yml -f environment-name=ci -f deployment-name=<name>`; none
  stands), poll 000004 once on it and read what the gateway saw; O44 asks Companies
  House in parallel. The `prod` listing (held as unreferenced local commit 946251d4) waits on a
  poll that returns a status. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: no committed files.

- [ ] **B25c. Issue #11, backups outside the account.** The drill's own state is now known and
  written up in `_developers/RESTORE_DRILL.md`: `restore-drill.yml` has never run, and two things
  stop it. The vault's restore grant names a role nothing can assume (B105), and the backup
  account's stack has not been deployed since before that grant landed (O41). What is proven
  meanwhile is the copy side: fresh completed recovery points exist for all five critical prod
  tables and both books buckets, and `restore-test.yml`'s monthly in-account restore has passed
  three of its last four runs, most recently restoring 4826 receipt items against a live source of
  4832. That comment is posted (issuecomment-5653323425, 2026-09-13). The drill ran clean on 2026-09-14 (run 34790429557, batch
  b30's O41x, on main since 5ca7bca9). Left: comment on #11 with that result and close it. **Source**: issue #11. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: no committed files.

- [ ] **B152. `watch-ci.sh` reports `MERGEABLE` for a head with no runs yet.** In the minute after a
  push the latest run per workflow still belongs to the previous head, so the probe called PR #207
  ready on 45bdfac4 before that sha had a run. Report `MERGEABLE` only when every latest run's
  `headSha` equals the PR's `headRefOid`. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: ~1 file.

- [ ] **B147. A direct question gets its answer as the whole reply.** Three times on 2026-09-13
  the operator asked where the dashboards were and the answer went inside a running turn, where
  their client showed only a summary; the links never reached them. Write into `CLAUDE.md`: when
  the operator asks a question, answer it in a reply that ends the turn, links and commands in
  full, and resume the work in the next turn. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: ~1 file.

- [ ] **B151. The sanctioned squash when `rebase -i` is blocked.** Batch b30 was rebuilt as one
  commit per task with a fresh branch and 19 `cherry-pick -n`s because `git rebase -i --autosquash`
  is not allowed here. Write that path into the do-next skill's landing section, and list
  `git rebase -i --autosquash <base>` on an unpushed batch branch among the commands the operator
  may choose to allow in `.claude/settings.json`; that allowlist is theirs. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: ~1 file.

- [ ] **B150. Agents that wait on a Monitor never come back, and one edited the primary checkout.**
  The videos agent handed each capture wait to a Monitor and sat idle for six hours with three
  failed runs unread; the skills agent's shell started in the primary checkout and its edits landed
  on `main` uncommitted. In the do-next brief shape: every Bash call starts with `cd <worktree>` or
  uses `git -C`; a wait is a `sleep` loop inside one Bash call with a timeout, never a Monitor or a
  backgrounded wait. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: ~1 file.

- [ ] **B149. Imported log groups must exist in the synth.** Deploy 34792364909 failed creating
  `ci-claud3386-app-OpsStack`: B128's worker metric filters named `/aws/lambda/<worker>` groups
  the Lambda construct never creates (a worker shares its ingest function's group). Add a CDK test
  over the application synth that every `AWS::Logs::MetricFilter` `LogGroupName` in an app stack
  matches an `AWS::Logs::LogGroup` created in the same synth. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **B148. Nested permissions checked before a push.** Deploy 34791268179 died at startup:
  `probe-test.yml`'s new job requested `issues: write` and `deploy.yml`'s 29 calls grant neither;
  actionlint does not check it. In `test.yml`'s `validate workflow syntax` job, for every workflow
  with `workflow_call`, read each job's `permissions` and fail when a caller in this repository
  grants less. **Source**: REPORT_SESSION_oVpgsO_2026-09-14.md. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Human and machine

- [ ] **O28. Send `Gov-Client-Multi-Factor` on every request: mandate MFA in the pool.** Every
  monthly advisory HMRC has raised is this header missing (`../REPORT_HMRC_HEADER_ADVISORIES.md`).
  Step 2b is on main (#198, b0e3d2be): the browser sends its Cognito ID token as
  `X-Id-Token`, `customAuthorizer.js` verifies it against the access token's `sub` and passes
  `custom:mfa_method`, the federated flag and `auth_time` to `buildFraudHeaders.js`, which builds
  the header (TOTP for an enrolled native user, OTHER for federated Google) and warns
  `HMRC REQUIRED HEADER MISSING:` for a password-only native user, whom only the pool setting
  reaches. The prod async-requests table holds nothing (TTL), so the scan could not size the
  cohorts; `prod-env-hmrc-api-requests` keeps 20 days and showed 3 production VAT POSTs from 3
  users, 2 without the header.
  Left, the human half first: `IdentityStack.java:184` is `.mfa(Mfa.OPTIONAL)`. With REQUIRED a
  returning native-auth customer who never enrolled meets Cognito's hosted-UI "Set up multi-factor
  authentication" interstitial right after their password — QR code or manual secret, then a
  6-digit confirm — with no skip; federated Google users see nothing. Walk that path once as a new
  customer on ci and say go. Then the machine half: the one-word change, its CDK test, and a ci
  deploy proving native sign-in still completes. **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`.
  **Owner**: Operator decides, Claude Code changes. **Model**: Haiku. **Size**: ~2 files.

## Human-only

- [ ] **B52z. Issue the operator pass and open the dashboard.** The `operator` pass type is on
  main (PR #207) and on prod since prod-5ca7bca. The operator's half:
  ```
  ! gh workflow run generate-pass.yml -f pass-type=operator -f email=<the email you sign in to submit with> -f environment=prod
  ```
  redeem the QR from the run's artifact, and open
  https://submit.diyaccounting.co.uk/operator/dashboard.html. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D1. **Owner**: Operator. **Model**: none.

- [ ] **O46. Approve the three allow lists.** Each of B80b's PRs (www #31, root #32, archive #35)
  prints every author address with its commit count and date range; strike or approve each before
  merge, because an address on the list is an identity the guard will accept from then on.
  **Source**: B80's fix. **Owner**: Operator. **Model**: none.

- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34; **Owner**: Operator. **Model**: none.

- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.

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

- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph: the MTD approval
  submission and the production-credentials email described the service as AGPL open source, and
  the PolyForm licence files are on main and on prod since prod-318271f. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator. **Model**: none.

- [ ] **O45. A token that can write issues in the spreadsheets repository.** The support form's
  page links, its Lambda's `SUPPORT_GITHUB_REPO` and the spreadsheets `support.md` template are all
  on the two mains (PR #198, spreadsheets PR #109). The Lambda's token
  (`{env}/submit/github/issue_bot_token`, read through `OPS_GITHUB_TOKEN_SECRET_ARN`) is scoped to
  submit, so the form cannot post there until it is replaced. Two named alternatives: a fine-grained
  PAT covering both repositories as the interim, or O38's `diya-ops` app installed on both as the
  destination. Either way the value goes on the `ci` and `prod` GitHub environments under the
  existing secret name and reaches Secrets Manager through `deploy-environment.yml`. **Source**:
  B135. **Owner**: Operator. **Model**: none.


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


- [ ] **O44. Tell Companies House's XML team what B34.6b submitted.** One email from your address
  to Neal at `xml@companieshouse.gov.uk`, naming: presenter E0000052288, company 06846849, test
  package reference 0012; submissions 000002 and 000003 (2026-09-13 18:19 UTC) rejected with error
  9999 "No element 'Authority'", since fixed; submission 000004 (19:04 UTC) acknowledged with no
  errors; and that every `GetSubmissionStatus` for 000004 answers 9999 "No presenter ID supplied".
  Ask whether 000004 was accepted and whether status lookups are enabled for this presenter.
  **Source**: BACKLOG 34b. **Owner**: Operator. **Model**: none.

## Blocked

- [ ] **B52y. The five wired objectives fill on the next nightly.** PR #207 gave
  `low-running-cost`, `security`, `retention`, `operator-effort` and `compliance` their
  observations; the 02:15 UTC snapshot after 5ca7bca9 reaches prod is the first that carries
  them. That run raised `prod-env-operator-snapshot-publish-errors` (issue #208, 03:18 UTC):
  read `/aws/lambda/prod-env-operator-snapshot-publish` for 03:15 on 2026-09-14, fix the
  observation whose query errors (`app/functions/analytics/operatorSnapshotPublish.js`), then check `snapshots/prod/latest.json` for
  any observation that answers null where its view has rows (two views are monthly or quarterly grain, so a 30-day
  window can be empty by design). **Source**: `PLAN_ONE_STOP_DASHBOARD.md` D7, D13, D14, D15.
  Closes #208. **Owner**: Claude Code. **Model**: Sonnet. Blocked on
  `aws sso login --sso-session diyaccounting` (the log read). **Size**: ~1 file.

- [ ] **B137. `uniqueReference` identifies the user, not the authentication event.** In the
  `Gov-Client-Multi-Factor` header, `uniqueReference` is a SHA-256 of `sub + ":" + factorType`, so
  it is stable per user per factor type by design. HMRC's spec expects a reference identifying the
  authentication **event**. They have not flagged it and it is no part of the current advisory, so
  this is a separate reading of the spec rather than a defect they have raised. Decide whether to
  change it, and note that O28's step 2b touches the same code — sequence it after, not with.
  **Source**: `../REPORT_HMRC_HEADER_ADVISORIES.md`. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O28 step 2b. **Size**: ~1 file.

- [ ] **B34.7. Run and fix the filing suites' sandbox sign-in.** Batch 9 (6957651c) carries
  the suites' sandbox sign-in with the authenticator step, off by default: `deploy.yml` and
  `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of O17's four
  values that is empty. Against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O17. **Size**: ~1 file.

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
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on the operator lifting the 2026-09-12 halt. **Size**: ~3 files.

- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. One application now covers
  both approval stages, and the checklist answers for all nine APIs in the minimum functionality
  standards with a build behind each. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10.
  **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on B11.T7r, B11.T21 and
  B11.T22. **Size**: ~3 files.

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
  and on `PLAN_SUBMISSION_MCP.md` M1. **Size**: ~4 files.

- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the brand package existing, now planned in the spreadsheets repository's
  `PLAN_DIYACCOUNTING_BRAND.md`. **Size**: ~6 files.

- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32. **Size**: ~1 file.

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
