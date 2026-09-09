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

**Prod runs deployment prod-15f3483 (the merge of PR #160, run 34385269183, 2026-09-09 18:29
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

**Batch 16 on `claude/b16-board`.** Wave A, six worktree sub-agents off `main` at 0aa5e4ac,
each owning a disjoint set of files:

| Workstream | Items | Model | Owns |
|---|---|---|---|
| CDK prod fixes | B30s, B67, B68, B66, B65 | Sonnet | `infra/main/**` five stacks, `passPost.js` |
| Workflows | B64, B25 | Sonnet | `.github/workflows/**`, `scripts/**` |
| DIYA-GL design | B71.S3a | Opus | `PLAN_DIYA_GL_NAMING.md` |
| Catalogue and prose | B17b.1, B71.S1 | Haiku | `submit.catalogue.toml`, four plan docs |
| Licensing files | B70.S1 | Sonnet | `LICENSE`, `LICENSING.md`, `NOTICE`, `package.json` |
| ITSA sandbox | B11.T7 (the script and runbook) | Sonnet | `scripts/itsa-sandbox-year.js`, `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` |

Wave B, dispatched as their blockers cleared. Their worktrees merge `claude/b16-board` first,
since wave A's work is not on `main`:

| Workstream | Items | Model | Owns |
|---|---|---|---|
| Licensing statement | B70.S2 | Opus | `terms.html`, `accessibility.html`, the footers, `README.md`, `SECURITY.md`, `TRADEMARKS.md` |
| Licensing metadata | B70.S4, S5, S6 | Sonnet | the OpenAPI generator, `Dockerfile`, `NOTICE`, `LICENSING.md`'s third-party section |
| DIYA-GL identifiers | B71.S2 | Sonnet | `app/functions/books/`, `s3BooksRepository.js`, `booksCors.js`, `booksEntitlement.js`, their tests and npm scripts |
| Vault restore grants | B25's remainder | Sonnet | `CrossAccountBackupVaultStack.java` |
| VAT failure metric | B30r | Haiku | `hmrcVatReturnPost.js` and its test |
| Raw export check | B52x | Haiku | `PLAN_ONE_STOP_DASHBOARD.md` D16 |

Merged into `claude/b16-board` and waiting on the branch's checks: B70.S1 (the `LICENSE` text
matches the spreadsheets copy byte for byte, `LICENSING.md` maps every top-level directory to
the PolyForm layer, `NOTICE` carries the company line, `package.json` reads `SEE LICENSE IN
LICENSE`), B17b.1 (the three VAT activities gain `prod`, with the catalogue test split so the
self-employed activity's ci-only listing is asserted on its own), B71.S1 (the DIYA-GL prose
across the four plan documents), B70.S4, S5 and S6 (the OpenAPI licence fields with a first
test for the generator, the OCI image labels, and the third-party lines with a 26-row runtime
dependency table), and B64 and B25's workflow half (the pointer is deleted rather than written
empty, in `destroy-prod.yml` as well as `destroy-ci.yml`, and `restore-drill.yml` is written).
Each comes off this list when the branch's checks pass.

A worktree agent runs `npm run bundle` before any unit, system or browser suite:
`web/public/submit.bundle.js` is gitignored, `pretest` fires only for bare `npm test`, and
without it nine tests fail on a missing file that has nothing to do with the change.

Agents commit in their worktrees and never push. The coordinator merges each verified commit
into `claude/b16-board`, pushes the batch once, and raises the PR when the branch is testing
and deploying. B70.S3 (the header sweep) touches every tracked file, so it lands after every
other code row in this batch, never beside one.

Batch 15 (PR #160, ITSA phase 2 T1 to T6 and the health alarm's group composites) is on prod as
prod-15f3483 since 2026-09-09 18:29 UTC. Of the merge's runs, the environment deploy failed at
the cost export only (B65); the test run passed on its re-run.

## Ready: Claude Code

- [ ] **B11.T7. ITSA phase 2: the sandbox proof.** `PLAN_ITSA_PHASE_2.md` T7, after T1 to T6
  which are on prod in prod-15f3483. Owns `scripts/itsa-sandbox-year.js` and
  `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`: file a whole tax year against the sandbox with
  one test user (four quarterly updates, an annual submission, a triggered and adjusted
  summary, an `intent-to-finalise` calculation, a final declaration), using
  `mtd-sa-test-support-api/1.0` to create the business and set the ITSA status and its
  vendor-state checkpoints to reset between runs, then correct the simulator scenarios against
  what HMRC returned. Needs a ci set standing and a `probe-test.yml` dispatch per ITSA suite.
  Proof: a `204` from the final declaration and the fraud header validator clean on the same
  header set. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T7. **Owner**: Claude Code.
  **Model**: Sonnet.
- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod once B17b.1 is live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. **Source**: BACKLOG 17b, 17c; issue #19. **Owner**: Claude
  Code. **Model**: Sonnet.
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

- [ ] **B11.T9. ITSA phase 2: the DIYA-GL-to-submission path.** `PLAN_ITSA_PHASE_2.md` T9: the
  MCP tools `derive_itsa_quarterly_update` and `derive_itsa_annual_submission` in the MCP
  package, and an import control on `annualSubmission.html` that fills the form from a book.
  **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T9. **Owner**: Claude Code. **Model**:
  Sonnet. Blocked on the spreadsheets repository's ITSA-T8 (the two self-employed derivations)
  and on `PLAN_SUBMISSION_MCP.md` M1.
- [ ] **B11.T10. ITSA phase 2: the recognition pack.** `PLAN_ITSA_PHASE_2.md` T10:
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
  questionnaires, and the two draft emails for the operator to send. **Source**: BACKLOG 11;
  `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code, then Operator. **Model**: Haiku.
  Blocked on B11.T7.
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
- [ ] **B70.S3. Licensing: the headers.** Every comment-capable file carries
  `SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0` and the copyright line in
  its format's comment style; the 28 `-or-later` headers, the battery-pack subtree's MIT
  files and metric-son's `@license MIT` become the PolyForm identifier; the 88 narrow-set and
  about 356 wide-set gaps filled; "Ltd" to "Limited"; a unit test twinned from the
  spreadsheets `app/test/licence-headers.test.js` walks `git ls-files` and fails on a missing,
  mismatched or old-name header, in `npm test`. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md`
  S3. **Owner**: Claude Code. **Model**: Haiku for the sweep, Sonnet for the test. Blocked on
  B70.S1.
- [ ] **B70.S7. Licensing: the simulator copy.** The deploy workflow runs
  `scripts/build-simulator.js` before it uploads `web/public-simulator/`, so the stale copy is
  replaced; verified by the simulator's `accessibility.html` date matching the live one after
  the next deploy. **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` S7. **Owner**: Claude Code.
  **Model**: Sonnet. Blocked on B70.S2, which is in flight.
- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph (the MTD approval
  submission and the production-credentials email described the service as AGPL open
  source). **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator.
  **Model**: none. Blocked on B70.S2, which is in flight, reaching main.
- [ ] **B70.LU15. Licensing: the brand package.** Pin `@diy-accounting-uk/brand`, copy assets
  and tokens at build, import the tokens, delete the local logo, favicon and token copies;
  the footer, favicon and title conventions read from the words file. **Source**:
  `PLAN_LICENSING_UPLIFT_SUBMIT.md` LU-15. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on the spreadsheets plan's LU-14 and H-LU-7 (the brand package existing).

- [ ] **B71.S3b. DIYA-GL naming: the CDK and workflow identifiers nobody else consumes.**
  `BooksStack` to `DiyaGlStack` and its literal name in `deploy.yml`, `destroy-ci.yml`,
  `destroy-prod.yml` and `stack-drift.yml`; `booksStackId`, `BOOKS_STACK_NAME`,
  `COGNITO_BOOKS_CLIENT_ID`, the lookup-resources outputs, the `deploy-books` job, the
  headers policy name, `BOOKS_ALLOWED_ORIGINS`, the `cdk.json` key and the CFN outputs, per
  S3a's order; a stack rename is a replacement, so it lands on a ci set first and on prod
  through one deploy of main. **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude
  Code. **Model**: Sonnet.
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
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on B71.S3a and the spreadsheets plan's NM-5.
- [ ] **B71.S3e. DIYA-GL naming: the bucket.** If S3a decides the bucket is renamed:
  `{prefix}-books-{account}` to `{prefix}-diya-gl-{account}` in `DataStack.java`,
  `SubmitSharedNames.java` and `BackupStack.java`, with the data copied, the backup plan and
  retention rules following, and the old bucket emptied and deleted after a verified copy.
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.
  Blocked on B71.S3a.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
