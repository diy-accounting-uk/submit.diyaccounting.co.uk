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

**Prod runs deployment prod-15f3483 (the merge of PR #160, run 34385269183, 2026-09-09 18:3x
UTC), which retired prod-4600d25 in its own destroy-previous job; no spare stands.** A main deploy retires the previous set
itself; a `prod-*-app-*` set left standing by anything else costs $46.88/month until named to
`destroy-prod.yml` (`_developers/archive/PLAN_COST_OPTIMISATION.md`).

The board runs in four sections, in this order: in flight; ready, Claude Code; ready, operator;
blocked (either owner, the blocker named). Within a section, items run by backlog tier, an
alarm or a pipeline failure counting as tier 1, then the untiered. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

Nothing. Batch 15 (PR #160, ITSA phase 2 T1 to T6 and the health alarm's group composites) is
on prod as prod-15f3483 since 2026-09-09 18:3x UTC. Of the merge's runs, the environment
deploy failed at the cost export only (B65); the test run passed on its re-run. T7 (the sandbox proof) and T8 to T10 wait on the operator's word. The
operator's standing instruction (renewed 2026-09-09 07:40 UTC): no board item enters "in
flight" without their word.

## Ready: Claude Code

- [ ] **B30s. The CIS filters' deploy exclusion binds to the last event name only.** Issues
  #165 (`prod-env-cis-iam-policy-changes`, 17:56 UTC), #166 (`-route-table-changes`, 18:22) and
  #167 (`-s3-bucket-policy-changes`, 18:46, the retirement of prod-4600d25) opened during
  main's deploy of 2026-09-09, all from
  `cdk-hnb659fds-cfn-exec-role-972912397388-eu-west-2`, which the exclusion names. The
  deployed pattern reads `{ ($.eventName = A) || … || ($.eventName = Z) && ((type guard)) }`:
  `&&` binds tighter than `||`, so the guard applies to the last event name alone and every
  other event matches unconditionally. In `SecurityDetectionStack.java`, wrap each control's
  event-name chain in its own parentheses before appending the guard, add a test that the
  rendered pattern starts `{ ((` for the eight guarded controls, and prove it with
  `aws logs test-metric-filter` against a `PutRolePolicy` event by the cfn-exec role (must not
  match) and one by an IAM user (must match). Closes #165, #166 and #167. **Source**: issues #165,
  #166. **Owner**: Claude Code. **Model**: Haiku.
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
  `POST /api/v1/interest` answering 2xx. Closes #161. **Source**: CloudTrail
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
  254 before the BooksStack sweep (the 13:06 UTC sweep 34355049696 failed the same way); the
  orphaned BooksStack is gone since, and the pointer still names a set that is not there
  (`ci-claud7ba2` at 19:3x UTC on 2026-09-09). Make the
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
  are PR #160 (`claude/b15-board`); T7 the sandbox proof (needs a ci set and a probe-test
  dispatch per ITSA suite), then T8 to T10, wait on the operator's word
  (stabilising, 2026-09-09 07:40 UTC), under the plan's stated assumptions until O30 answers
  otherwise. ITSA stays behind the environments gate on prod by the operator's decision of
  2026-09-09. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md`. **Owner**: Claude Code. **Model**: Sonnet per track, Opus for T8's
  mapping.
- [ ] **B17b.1. Enable the three VAT read pages on prod.** The operator examined liabilities,
  payments and penalties on ci on 2026-09-09 and they read right: add `prod` to the three
  activities' environments in `web/public/submit.catalogue.toml` (they stay on every bundle),
  PR, the operator merges; the deploy of main is the proof. **Source**: BACKLOG 17b; issue
  #19. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod once B17b.1 is live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. **Source**: BACKLOG 17b, 17c; issue #19. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B52x. A short extract from the raw export to prove every field fills.** The nightly
  raw export's first night is 2026-09-09; as soon as one night exists, pull one day through
  the notebook's data path (`PLAN_ONE_STOP_DASHBOARD.md` D16's export) and list every field
  with its count of non-empty entries, so a field that never fills is found now rather than
  in three months. **Source**: BACKLOG 52; plan row D16. **Owner**: Claude Code. **Model**:
  Haiku.
- [ ] **B25. Backups outside the account: the proven restore.** Issue #11's remainder. The
  vault `submit-cross-account-vault` in submit-backup (914216784828) holds 120 recovery
  points and every prod DynamoDB table's nightly backup copies into it (five tables, copy
  jobs COMPLETED each night; the S3 books bucket joins once B66 lands), but nothing has ever
  been restored from it, and the issue's goal is a restore proven by standing a prod replica
  up in ci, salt included. Build `restore-drill.yml` (dispatch, ci only): assume the ci role,
  take the vault's latest recovery point of each prod table, restore each into ci as a
  `ci-restore-<table>` table, restore the salt secret's backup beside it, compare item
  counts with the source recovery points, then delete the restored tables; the run's summary
  is the proof and the drill re-runs monthly on a cron off the top of the hour. The vault's
  SSO policy downgrade from `AdministratorAccess` and the eu-west-1 copy (BACKLOG 33's open
  questions) are decided in the same PR's description, not built. **Source**: issue #11;
  BACKLOG 33's chain (#2, #25, #33). **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B70.S1. Licensing: the licence files.** `LICENSE` becomes the canonical PolyForm
  Internal Use text with the additional grant, copied byte for byte from the spreadsheets
  repository; `LICENSING.md` maps every top-level directory to the third layer, states the
  source offer and the copyright line and carries the third-party section; `NOTICE` carries
  the company line; `package.json` `license` becomes `SEE LICENSE IN LICENSE`. First of the
  licensing rows; one PR carries the code rows, from `claude/lic-<topic>`. Report the landing
  in `~/.claude/inboxes/spreadsheets.md`. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S1.
  **Owner**: Claude Code. **Model**: Sonnet.

## Ready: operator

- [ ] **O30. Answer the five ITSA phase 2 questions.** `PLAN_ITSA_PHASE_2.md`'s "Open
  questions": whether an annual submission costs a token (the plan assumes not, so a year is
  five tokens), whether the site displays the calculation or signposts HMRC (assumes
  display), which approval stage to apply for first (assumes in-year), whether property income
  is in this phase (assumes not), and whether the sandbox proof uses the phase 1 test user
  plus test-support data (assumes yes). The build proceeds on the assumptions; an answer that
  differs changes T2, T5, T6 or T10 before they start. **Source**: `PLAN_ITSA_PHASE_2.md`.
  **Owner**: Operator. **Model**: none.
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
- [ ] **O32. View the five walkthrough videos.** After B17v.1: watch each recording and say
  which can go up and what reads wrong. **Source**: BACKLOG 17b, 17c. **Owner**: Operator.
  **Model**: none. Blocked on B17v.1.
- [ ] **B17v.2. Publish the walkthrough videos.** After O32: fetch the recordings from their
  capture runs, upload them unlisted with `video-publish`, then the operator runs
  `npm run video:publish -- --public`. The VAT read-page videos publish beside the three VAT
  ones; the accounts and ITSA videos publish as sandbox previews. **Source**: BACKLOG 17b,
  17c. **Owner**: Claude Code, then Operator. **Model**: Haiku. Blocked on O32.
- [ ] **B70.S2. Licensing: the public statement.** `terms.html` (lines 158, 272-275, 431-437)
  and `accessibility.html:349-353` rewritten so the Service is free to use, source available,
  under the PolyForm Internal Use License with the grant for accountants, the contribution
  invitation removed; every page footer gains the licence line and a source link and reads
  `© 2006-2026 DIY Accounting Limited`; `README.md`, `hmrc-fraud-prevention.md` and
  `_developers/MARKETING_GUIDANCE.md` say the new words and the README says the repository
  does not accept contributions; `SECURITY.md` and `TRADEMARKS.md` added from the spreadsheets
  copies; the HMRC approval documents annotated with the date the licence changed; ™ on the
  marks. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S2. **Owner**: Claude Code. **Model**:
  Opus for the terms wording, Sonnet for the rest. Blocked on B70.S1.
- [ ] **B70.S3. Licensing: the headers.** Every comment-capable file carries
  `SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0` and the copyright line in
  its format's comment style; the 28 `-or-later` headers, the battery-pack subtree's MIT
  files and metric-son's `@license MIT` become the PolyForm identifier; the 88 narrow-set and
  about 356 wide-set gaps filled; "Ltd" to "Limited"; a unit test twinned from the
  spreadsheets `app/test/licence-headers.test.js` walks `git ls-files` and fails on a missing,
  mismatched or old-name header, in `npm test`. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md`
  S3. **Owner**: Claude Code. **Model**: Haiku for the sweep, Sonnet for the test. Blocked on
  B70.S1.
- [ ] **B70.S4. Licensing: the OpenAPI document.** `info.license` (name `PolyForm Internal Use
  License 1.0.0`, url the repository's `LICENSE`), `info.contact` and `termsOfService` in
  `createInfoSection()` of the OpenAPI generator and its test; the generated `openapi.json`
  carries them. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S4. **Owner**: Claude Code.
  **Model**: Sonnet. Blocked on B70.S1.
- [ ] **B70.S5. Licensing: the image labels.** `org.opencontainers.image.licenses=LicenseRef-PolyForm-Internal-Use-1.0.0`,
  `vendor`, `title`, `source`, `documentation` and `url` labels on the `Dockerfile`.
  **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S5. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on B70.S1.
- [ ] **B70.S6. Licensing: the third-party lines.** In `NOTICE` and `LICENSING.md`: node-qrcode
  (MIT, its notice restored at the top of `web/public/lib/qrcode.min.js`), the Google "G"
  logo, the PolicyBee logo, the Lighthouse, Playwright, React and OWASP ZAP reports under
  `web/public/tests/`, one Crown copyright and OGL v3.0 line for the HMRC form-field
  standards, the Companies House xsd schemas, the Maven Wrapper, and a runtime dependency
  table from `package.json` with each package's licence read from `node_modules`.
  **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S6. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on B70.S1.
- [ ] **B70.S7. Licensing: the simulator copy.** The deploy workflow runs
  `scripts/build-simulator.js` before it uploads `web/public-simulator/`, so the stale copy is
  replaced; verified by the simulator's `accessibility.html` date matching the live one after
  the next deploy. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S7. **Owner**: Claude Code.
  **Model**: Sonnet. Blocked on B70.S2.
- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph (the MTD approval
  submission and the production-credentials email described the service as AGPL open
  source). **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator.
  **Model**: none. Blocked on B70.S2 reaching main.
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
