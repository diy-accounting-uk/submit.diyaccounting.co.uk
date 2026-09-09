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

**Prod runs deployment prod-4600d25 (the scheduled deploy of main, run 34331976471,
2026-09-09 08:57 UTC, the 04:11 cron arriving late), which retired prod-ebaeb7d in its own
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

PR #160 (batch 15, ITSA phase 2 T1 to T6 and the health alarm's group composites) merged to
main at 15f3483c, 2026-09-09 17:49 UTC. The merge's environment deploy 34385269212 and deploy
34385269183 (which retires prod-4600d25) are running; the board of their landing reads the
cost export (B65, expected to fail again) and the new prod set. Prod's afternoon opened four
alarm issues on prod-4600d25 (#161 to #164): three are one cause, B67, and the fourth is a
customer's 400 that the alarm should not count, B30r. T7 (the sandbox proof) and T8 to T10
wait on the operator's word. No agent runs. The operator's standing instruction (renewed
2026-09-09 07:40 UTC): no board item enters "in flight" without their word.

## Ready: Claude Code

- [ ] **B67. The account stack's Lambdas cannot read the salt secret.** CloudTrail on prod:
  `interest-post` was denied `secretsmanager:GetSecretValue` on `prod/submit/user-sub-hash-salt`
  at 14:04 and 14:07 UTC on 2026-09-09 and answered `500` to two `POST /api/v1/interest`
  (issues #163 `prod-app-api-5xx` and #162 `prod-app-account-stack-health`), and `pass-post`,
  `pass-admin-post` and `pass-get` have been denied the same read on every prod set since at
  least prod-c6d0ed3 (they warn "Email hash secret not available" and carry on); every one of
  these denials also fires `prod-env-cis-unauthorized-api-calls` (#161), which is the filter
  doing its job. In `AccountStack.java` the salt grant goes to `bundleGet` and the async pairs
  (lines ~284, ~364, ~471) but not to these four; grant it where the others get it, and make
  `passPost.js`'s "not available" path throw rather than warn, since a pass hashed without the
  salt is a wrong pass. Proof: no `GetSecretValue` denial in CloudTrail after the deploy and
  `POST /api/v1/interest` answering 2xx. Closes #161, #162, #163. **Source**: CloudTrail
  2026-09-09. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B68. The alarm-to-issue Lambda cannot describe alarms.** CloudTrail: `prod-4600d25-app-alarm-to-github-issue`
  was denied `cloudwatch:DescribeAlarms` at 14:05:53 UTC on 2026-09-09 while opening #162; it
  opened the issue anyway, so the read is used for the issue's detail. Grant `DescribeAlarms`
  (resource `*`) to that role in `OpsStack.java` beside its other reads. **Source**: CloudTrail
  2026-09-09. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B30r. A customer's 400 counts as a VAT submission failure.** Issue #164
  (`prod-env-hmrc-submission-failure`, 14:38 UTC on 2026-09-09): `hmrc-vat-return-post`
  answered `400` "No matching obligation found for date range" twice (14:37, 14:39) and the
  same customer's return was accepted at 14:40 (202, 202, 200). Nobody wrote in; no reply is
  owed. The `VatSubmissionFailure` metric counts a period the customer chose wrong as a
  failure, so the alarm pages on a customer correcting a date. In `hmrcVatReturnPost.js`,
  emit the failure metric only for what is ours or HMRC's (a thrown error, an HMRC 5xx, a
  network failure), not for a validation 400 the page shows the customer; keep the
  `vat-return-failed` activity event for the funnel. #164 closes as understood.
  **Source**: issue #164. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B66. The nightly S3 backup of the prod books bucket fails.** `verify-backups.yml`'s
  scheduled runs failed on 2026-09-08 (34218296772) and 2026-09-09 (34343588837): the AWS
  Backup job for `arn:aws:s3:::prod-env-books-972912397388` at 02:00 UTC fails both nights
  with "AWS Backup does not have permission to describe resource", so the DIYA-GL books
  bucket, new since batch 12, has no backup. Grant the backup role the S3 backup permissions
  (`AWSBackupServiceRolePolicyForS3Backup` and its restore twin, or the equivalent statements)
  where `BackupStack.java` builds it, and check the bucket's own policy does not deny the
  service role; the proof is the next night's job and `verify-backups.yml` green.
  **Source**: runs 34343588837, 34218296772. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B65. The FOCUS cost export rejects `SELECT *`.** Main's environment deploy
  34328646892 got past the bucket policy (B61's fix held) and failed creating
  `AWS::BCMDataExports::Export` `FocusExport` in `cost-CostExportStack`: the Data Exports API
  answers `ValidationException: SELECT * is not supported`, so the stack rolled back and the
  cost panel has no export. In `CostExportStack.java`, give the export's query statement an
  explicit column list (the FOCUS 1.0 columns the panel's Athena table in
  `CostFocusIngestion.java` reads; keep the two in step) and prove it with the environment
  deploy of main. **Source**: run 34328646892. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B64. The ci sweep fails clearing the last-known-good pointer.** `destroy-ci.yml`'s
  scheduled run 34324345123 (07:32 UTC on 2026-09-09, the 02:34 slot arriving five hours late;
  every cron here has been firing hours late since 2026-09-08) removed `ci-claud87a7` and then
  failed at "Clear last-known-good pointer if it names a deployment with no stacks left":
  `aws ssm put-parameter` with an empty value answers `ValidationException`, so the step exits
  254 before the BooksStack sweep (the 13:06 UTC sweep 34355049696 failed the same way), and
  `ci-clauddf1b-app-BooksStack` still stands. Make the
  step delete the parameter (`aws ssm delete-parameter`) or write a sentinel the readers
  understand (grep `last-known-good-deployment` in `.github/workflows/` and `scripts/` for
  every reader and make them agree), and let the sweep run on. **Source**: run 34324345123.
  **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B11. ITSA phase 2: annual summaries and the final declaration.** The design is
  `PLAN_ITSA_PHASE_2.md` on main: ten tracks, the four endpoint tracks holding the CDK and
  server spine one at a time (T1 the quarterly update's token charge and receipt, then T2 the
  annual submission, T3 the final-declaration obligation and ITSA status, T4 the adjustable
  summary, T5 the calculation and final declaration, T6 the year-end pages, T7 the sandbox
  proof), with T8 the engine derivations in the spreadsheets repository alongside, T9 the
  books-to-submission path after T8 and T6, and T10 the recognition pack after T7. T1 to T6
  are PR #160 (`claude/b15-board`); T7 the sandbox proof (needs the branch's ci set and a
  probe-test dispatch per ITSA suite), then T8 to T10, wait on the operator's word
  (stabilising, 2026-09-09 07:40 UTC), under the plan's stated assumptions until O30 answers
  otherwise. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: Sonnet per track, Opus for T8's
  mapping.
## Ready: operator

- [ ] **O30. Answer the five ITSA phase 2 questions.** `PLAN_ITSA_PHASE_2.md`'s "Open
  questions": whether an annual submission costs a token (the plan assumes not, so a year is
  five tokens), whether the site displays the calculation or signposts HMRC (assumes
  display), which approval stage to apply for first (assumes in-year), whether property income
  is in this phase (assumes not), and whether the sandbox proof uses the phase 1 test user
  plus test-support data (assumes yes). The build proceeds on the assumptions; an answer that
  differs changes T2, T5, T6 or T10 before they start. **Source**: `PLAN_ITSA_PHASE_2.md`.
  **Owner**: Operator. **Model**: none.
- [ ] **O31. Delete the merged origin branch `claude/b14-board`.** PR #159 is on main.
  **Source**: none. **Owner**: Operator. **Model**: none.
- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34;
  issue #15. **Owner**: Operator. **Model**: none.
- [ ] **O27. Examine the three VAT read pages on ci.** Liabilities, payments and penalties are
  on main, ci only, on every bundle. Open them on a standing ci set, read each against the
  HMRC figures the sandbox returns, and say what reads wrong or that they can go to prod.
  Unblocks B17b. **Source**: BACKLOG 17b; issue #19. **Owner**: Operator. **Model**: none.
- [ ] **O22. Preview one set of micro-entity accounts on ci.** The accounts filing activity
  (`file-micro-entity-accounts`, ci only) is on main since PR #148: open it on a standing ci
  set (any branch push or `gh workflow run deploy.yml -f environment-name=ci` from main makes
  one), fill the FRS 105 balance sheet with round figures and use Preview, which renders the
  iXBRL without calling Companies House; then Submit, which goes to the simulator gateway on
  ci and shows the acknowledgement and poll. Say what reads wrong; the operator's eye on the
  form and the rendered accounts is the check no test gives. **Source**: BACKLOG 34b; issue
  #15. **Owner**: Operator. **Model**: none.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
  **Owner**: Operator. **Model**: none.
- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.
- [ ] **O28. Read HMRC's August fraud-prevention-header advisories.** The new monthly check's
  first dry run over the mail mirror found HMRC's 2026-09-02 email reporting August 2026 with
  advisories to review. Open it (from noreply@tax.service.gov.uk, subject "Improve fraud
  prevention headers for DIY Accounting Submit"), read which headers it names, and hand the list
  to Claude Code for the fix in `app/lib/fraudPreventionHeaders.js` or wherever the named header
  is built. **Source**: B22's first run, 2026-09-08. **Owner**: Operator. **Model**: none.
## Blocked

- [ ] **B17b. VAT read-page videos.** After O27: add `prod` to the three activities'
  environments in `web/public/submit.catalogue.toml`, record liabilities, payments and
  penalties one video each in the 17a capture pattern (`videos/*.json`, `auth: "user"`,
  `site-video-capture`), and publish them with `video-publish` beside the others. **Source**:
  BACKLOG 17b; issue #19. **Owner**: Claude Code. **Model**: Sonnet for the capture, Haiku
  for the publish. Blocked on O27.
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
- [ ] **O16 / B34b. Activate the XML Gateway test presenter account.** Companies House's XML
  team (Ioan, xml@companieshouse.gov.uk) replied on 2026-09-07: they activate a test account
  once they have the presenter's name, contact name, address, email address and telephone
  number, and then issue the test presenter credentials to use in every test submission; the
  specification they pointed at is the public TIS set the build already follows. Reply with
  the five details (DIY Accounting Limited; Antony Cartwright; the registered office, 37
  Sutherland Avenue, Leeds, LS8 1BY; antony@diyaccounting.co.uk; the telephone number). When
  the credentials arrive, put them on the GitHub `ci` environment as the secrets
  `COMPANIES_HOUSE_PRESENTER_ID` and `COMPANIES_HOUSE_PRESENTER_CODE` and tell Claude Code,
  which starts B34.6b. Chase on 2026-09-21 if silent. **Source**: BACKLOG 34b; issue #15.
  **Owner**: Operator. **Model**: none.
- [ ] **B52l. The optimiser.** A notebook over the raw export: per-block correlations, the
  block models (linear cost, log-linear funnels, Hill saturation for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and
  interval; Bayesian optimisation for the continuous knobs and a Thompson-sampling bandit for
  allocations once experiments exist. Its one line per objective goes on the page. **Source**:
  BACKLOG 52; plan row D16 and the optimisation section. **Owner**: Claude Code. **Model**:
  Opus for the models, Sonnet for the notebook. Blocked on three months of the raw export,
  whose first night is 2026-09-09.
- [ ] **D2. The Monday crons' first proof.** `compliance.yml` at 06:06 and `stack-drift.yml` at
  06:36 UTC on 2026-09-14 fire as schedule events; `keepalive.yml`'s staleness step is the
  standing check. **Source**: B47a. **Owner**: Claude Code. **Model**: Haiku. Blocked on the
  date.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
