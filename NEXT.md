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

**Prod runs deployment prod-e6d3045**, nine stacks, live since its `deploy` run completed at
11:4x UTC on 2026-09-12. `prod-40b194e` is now the spare and costs $35.28 a month until the
operator runs `gh workflow run destroy-prod.yml -f deployment-name=prod-40b194e`. ci runs `ci-annual1`, ten stacks from
08:56, self-destruct about 10:56. `ci-mainb28b` still stands with nine stacks, twelve hours past
its own window and untouched by four `34 2,4,6,8,10,12` UTC sweeps, so the sweep's own selection
needs looking at.

The board runs in four sections, in this order: **machine-only**, **human and machine**,
**human-only**, **blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `human-only` is work no session can do: an external registration, a console action with no
API, a filing against the operator's own company, an email from their address, a decision between
named alternatives. A row whose only human step is merging its PR is machine-only; that is the
standing workflow, not an action the row needs. Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Human items
are briefed for Claude Cowork at the workspace root: `../BRIEF_OPERATOR_TASKS_2026-09-12.md`
carries O42, O37, O16, O33, O36, O38 and the four queued behind machine work (B80b, O32, B17v.2,
B11.T10); `../BRIEF_OPERATOR_TASKS_2026-09-09.md` carries O17, O21 and O23.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## Machine-only

- [ ] **B127. The apex-alias vacate races any expiring ci set, and the fix is unproven.**
  `set origins` strips the apex alias from whichever CloudFront distribution holds it, then waits
  for that distribution to finish deploying. In deploy run 34687925996 the distribution was
  `E3GFQF1I7VAW46`, belonging to `ci-annual1`, whose self-destruct fired at about 10:56 UTC; the
  waiter failed at 10:56:16 with `NoSuchDistribution`, the step died under `set -e`, and all
  thirteen `probe test / behaviour test *-ci` jobs failed behind it. Any ci set reaching its TTL
  while another branch deploys hits this, so it will recur.
  `claude/b28-board` makes every call against the old distribution treat `NoSuchDistribution` as
  already-vacated and skip the rest of the block, while the waiter on our own target distribution
  stays strict and any other AWS error still fails the step. Verified only by a scratch harness
  with `aws` mocked and by actionlint; **no real run has exercised it**, because reproducing it
  means timing a deploy against a self-destruct.
  Remaining: confirm on a real run that a ci set expiring mid-deploy no longer fails the deploy, and
  decide the second window the same agent found — `.github/actions/set-origins/action.yml:365-370`,
  where `transfer_apigw_domain` checks an API Gateway custom domain exists and then calls
  `get-api-mappings` and `delete-domain-name` against it, with no equivalent classification.
  **Source**: deploy run 34687925996, job 103542638824. **Owner**: Claude Code. **Model**: Sonnet.

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
  `view-penalties` (34689889022). Remaining: the two ci captures, which need PR #192 because
  `video-capture.yml`'s `script` choice list only learns the new scripts there, then check all five
  artifacts and write `videos/publish.json`. **Source**: BACKLOG 17b, 17c. **Owner**: Claude
  Code. **Model**: Sonnet.
  **The two missing scene scripts are on `claude/b28-board`**: `videos/file-micro-entity-accounts.json`
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
  **Counted, on `claude/b28-board`.** The 02:15 UTC nightly of 2026-09-12 succeeded (execution
  `0d6aa4b5-a4d8-4337-be9e-b10cbc035be1`, 02:15:16 to 02:20:28 UTC) and wrote 21 CSVs and 8 JSONs
  under `exports/prod/2026-09-11/`. `_developers/EXPORT_ANALYSIS_2026-09-11.md` holds the per-field
  non-empty counts. What the counts found, and the remainder of this row: `v_compliance_status.csv`
  and `v_subscription_renewals_daily.csv` are headers with no rows, every one of the eight objective
  JSONs has an empty `target`, and `median_lead_time_seconds` is missing from four rows across
  operator-effort and retention. Decide per field whether the view is wrong, the source is empty or
  the target was never set, and fix what is wrong.


- [ ] **B117. Gate the ITSA endpoints in the catalogue.** `web/public/submit.catalogue.toml` has
  no entries for the ITSA activities, so `bundleManagement.js`'s `enforceBundles()` treats them as
  unrestricted and lets any signed-in caller through. The gap covers the whole ITSA surface, not
  just the newer endpoints, so the entire ITSA journey is currently free while VAT is gated.
  **Operator decision, 2026-09-11: submissions cost, reads free.** Anything that submits to HMRC
  costs one token like a VAT return — quarterly updates, annual submissions, losses and claims,
  tax liability adjustments, final declaration. Anything that only reads is free: business details,
  obligations, calculations. That matches the existing VAT rule and introduces no new pricing
  concept.
  Add the entries, then confirm `enforceBundles()` actually refuses an ungated caller for each
  submitting activity — the hole existed because nothing tested it. **Source**: the CDK spine
  agent's finding, 2026-09-11. **Owner**: Claude Code. **Model**: Sonnet.
  **The premise was wrong, and the pricing is fixed on `claude/b28-board`.** ITSA was never
  unrestricted: the `self-employed` activity and its `^/api/v1/hmrc/itsa.*` catch-all have gated
  every ITSA path to `resident-itsa` and `resident-pro` since commit `88764fca`. The actual gap was
  pricing — reads charged a token, and the year-end writes charged nothing. Reads now sit in a new
  `self-employed-read` activity at `tokenCost = 0`; `self-employed-year-end` moves to 1;
  `enforceBundles()` is proved to refuse an ungated caller on all nine submitting API paths and to
  admit `resident-itsa`.
  The six year-end handlers now charge what they advertise: `hmrcItsaSelfEmploymentAnnualPut`,
  `hmrcItsaUkPropertyAnnualPut`, `hmrcItsaLossesAndClaimsPut`, `hmrcItsaLossesAndClaimsDelete`,
  `hmrcItsaTaxLiabilityAdjustmentsPut` and `hmrcItsaTaxLiabilityAdjustmentsDelete` call
  `consumeTokenForActivity` under `self-employed-year-end` on the initial request. Both DELETEs
  charge: a delete of a loss claim or an adjustment is a write to HMRC, and the catalogue prices
  the page rather than the verb. Closes on merge of PR #192.
  One behaviour to confirm rather than assume, now on twelve handlers rather than six: the charge
  lands **before** the HMRC call and a failed submission is not refunded. That is pre-existing and
  was copied, not decided. If a failure should refund, say so and it becomes its own row.


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


- [ ] **B123. One attribution for unattended runs, distinct from a session at a terminal.** The
  identity audit's class U is "a model started by a schedule or an event, with nobody watching",
  and it needs to be readable from a commit or a comment without opening the run. Four model-run
  workflows are on main — `alarm-triage.yml`, `agentic-lib-pr.yml`, `agentic-lib-code.yml` and
  `agentic-lib-board.yml` — and they do not agree.
  Settle and write into the workspace `CLAUDE.md` beside the terminal convention: unattended runs
  keep `Co-Authored-By: Claude <noreply@anthropic.com>` and `Claude-Model:` unchanged, because
  identity and provenance do not depend on who started the run, and replace `Claude-Session:` with
  `Claude-Run: <run url>`, because there is no interactive session and a reader needs to tell a run
  nobody watched from one a person drove. Then make all four workflows emit it, and check the
  `origin:unattended-agent` label is applied by each path that opens a PR or an issue — today only
  `alarm-triage.yml` applies it. **Source**: `REPORT_IDENTITY_AUDIT.md` section 3 class U.
  **Owner**: Claude Code. **Model**: Sonnet.
  **Done on `claude/b28-board`.** `alarm-triage.yml` emits the three trailers in its commit and its
  PR body; `agentic-lib-code.yml`'s brief now covers the PR body as well as the commit, and a
  post-run step labels any PR it opened `origin:unattended-agent`. `agentic-lib-board.yml` was
  already correct and opens no PR or issue; `agentic-lib-pr.yml` composes neither, so neither rule
  reaches it. Closes on merge.


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
  **Code complete on `claude/b28-board`.** `http403ForbiddenFromHmrcResponse` now returns
  `http403ForbiddenResponse`; the 20 GET handlers and the 16 write handlers all reach that one
  function. A new `hmrcErrorMessage` helper in `web/public/widgets/status-messages.js` reads
  `error.responseBody.message` (or `errors[0].message`), used at 27 call sites across 15 ITSA and VAT
  pages, which previously showed `result.message` and never HMRC's own text. 489 unit tests pass.
  Remaining: prove a real 403 on a deployed set, since the handlers include live VAT endpoints, and
  the pages' 403 path had never been exercised.


- [ ] **B126. Document that a ci redeploy needs an explicit deployment-name.**
  `.github/actions/get-names/action.yml:112` computes `ci-${CLEANED:0:5}${REF_HASH}` where
  `REF_HASH` hashes the **branch name**, not the commit, so a branch resolves to the same deployment
  name on every deploy. A second deploy of a branch updates the live set in place and
  `deploy.yml`'s `destroy previous` then tears down what it just deployed. Observed in run
  34672307283: stacks `UPDATE_COMPLETE`, `OpsStack` `DELETE_COMPLETE`, five stack jobs failed.
  **Operator decision, 2026-09-12: leave the derivation and the destroy step alone.** Passing an
  explicit `deployment-name` to `deploy.yml` is the intended process for a redeploy, and the ci TTL
  is configurable for a longer window.
  **Documented on `claude/b28-board`**, and the mechanism in this row's own evidence was wrong.
  `deploy.yml`'s `destroy previous` job is gated `environment-name == 'prod'` and never runs for ci.
  What tears a ci set down on a redeploy is that deployment's own `SelfDestructStack`, whose timer
  anchors to the stack's first `CreationTime` and is not reset by the redeploy, so the original
  timer can fire against the stacks the second deploy is updating. `CLAUDE.md` now says that and
  gives the explicit-name dispatch. Closes on merge. **Source**: deploy run 34672307283;
  `deploy.yml:3060`. **Owner**: Claude Code. **Model**: Haiku.


- [ ] **B122. Clear the 214 eslint findings.** `npm run linting` runs again since batch 27, and
  reports 214 errors: 156 auto-fixable `prettier/prettier` formatting, the rest `no-var` and
  `no-empty` under `web/public/`. The lint job reports the total and gates only newly added files,
  so none of this blocks anything today.
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
  **Code half done on `claude/b28-board`, ci step 1 run.** PR #180 created the new bucket but left
  every DIYA-GL Lambda's `DIYA_GL_BUCKET_NAME` pointed at the old one; that is closed, and
  `_developers/RUNBOOK_DIYA_GL_BUCKET_CUTOVER.md` holds the six AWS steps per environment with both
  gates. ci step 1 copied 6 objects from `ci-env-books-367191799875` to
  `ci-env-diya-gl-367191799875`; both buckets now hold 6. prod starts at 16 objects / 146,299 B and
  waits behind ci's step 6, as the runbook orders it.
  Next, after PR #192 deploys: ci steps 3 to 6, then prod steps 1 to 6. Step 6 removes the old
  bucket through CDK, never a raw `aws s3` delete.


- [ ] **O28. Read HMRC's August fraud-prevention-header advisories.** The new monthly check's
  first dry run over the mail mirror found HMRC's 2026-09-02 email reporting August 2026 with
  advisories to review. Open it (from noreply@tax.service.gov.uk, subject "Improve fraud
  prevention headers for DIY Accounting Submit"), read which headers it names, and hand the list
  to Claude Code for the fix in `app/lib/fraudPreventionHeaders.js` or wherever the named header
  is built. **Source**: B22's first run, 2026-09-08. **Owner**: Operator. **Model**: none.


- [ ] **B73. The email hash secret has never existed in any account.** `initializeEmailHashSecret()`
  reads `${env}/submit/email-hash-secret`, and `aws secretsmanager list-secrets` shows no such
  secret in ci or prod; no Lambda role is granted it. `PLAN_PASSES_V2.md` still has "Add
  `EMAIL_HASH_SECRET` to Secrets Manager and wire to Lambdas" unchecked, so the call has always
  failed in a deployed environment and the warn-and-carry-on path hid it. Passes now fetch the
  secret only when a pass carries an email restriction, so the failure surfaces on those passes
  alone; an email-restricted pass can still be neither created nor redeemed anywhere. Creating
  the secret material is an AWS write and a decision about the value, so the operator settles it,
  then the grant goes in beside the salt's in `AccountStack.java`. **Source**: ci `pass-post` log,
  2026-09-09. **Owner**: Claude Code. **Model**: Haiku.
  **In flight on PR #191.** Both secrets now exist: `ci/submit/email-hash-secret` and
  `prod/submit/email-hash-secret`, created 2026-09-12 11:00 BST with independent 48-byte random
  values. The grant is on `claude/ops-email-hash-grant`: a new `EmailHashSecretHelper` mirroring
  `SubHashSaltHelper`, applied to the four pass Lambdas that reach `passService.js` — `passGet`,
  `passPost`, `passAdminPost`, `passGeneratePost`. `passMyPassesGet` is excluded because it does not
  use `passService`. `./mvnw clean verify` passes, 220 tests. `test`, `identity-guard`, `CodeQL` and
  `verify-commit-signatures` are green; `deploy` and `deploy environment` are running. Remaining:
  the merge, then redeem an email-restricted pass on ci to prove the fetch works.

## Human and machine

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


- [ ] **O42. Create two fine-grained PATs for the agentic-lib workflows.** Each of the three
  refuses to start without its token. The split is the safety property: `AUTO_MERGE_TOKEN` merges
  but does not write code, `AGENT_TOKEN` pushes a `claude/*` branch, opens a PR and commits
  `NEXT.md` but cannot merge or touch `main`. `GITHUB_TOKEN` can be neither: a merge with it does
  not trigger `on: push`, so the prod deploy would never fire, and a branch pushed with it triggers
  no checks.
  **Operator decision, 2026-09-12: fine-grained PATs now, not waiting for O38's apps.** Both scoped
  to this repository: contents and pull-requests write for both, plus issues write for
  `AGENT_TOKEN`. Set them as repository secrets `AUTO_MERGE_TOKEN` and `AGENT_TOKEN`.
  They are yours personally and carry no separate identity, which is what O38 exists to fix, so
  swapping them for `diya-ops` and `diya-agent` when O38 lands stays worth doing. Then B124 proves
  the workflows. **Source**: `.github/workflows/agentic-lib-*.yml`. **Owner**: Operator, then Claude
  Code. **Model**: none.


- [ ] **O43. Subscribe the sandbox application to the Self Assessment Individual Details (MTD)
  API.** One Developer Hub action, no command. The ITSA sandbox year stops at
  `GET individuals/person/itsa-status/{nino}/{taxYear}` with `403 RESOURCE_FORBIDDEN` because the
  sandbox application (client id ending `v4tV`) is not subscribed to that API. It is the endpoint
  `app/functions/hmrc/hmrcItsaStatusGet.js` calls, and it was missing from the runbook's
  subscription list, so the earlier subscription pass did not cover it. Add it on
  developer.service.hmrc.gov.uk and tell Claude Code, which resumes B11.T7r from call 7.
  **Source**: the sandbox run of 2026-09-12. **Owner**: Operator. **Model**: none.

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
  Resume from call 7 once O43 lands. **Source**: `PLAN_ITSA_PHASE_2.md` T7; the sandbox run of
  2026-09-12. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O43.

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
  **Source**: `.github/workflows/agentic-lib-*.yml`. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on O42.


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

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
