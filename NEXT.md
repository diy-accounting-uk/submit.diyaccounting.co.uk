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

**Batch 16 on `claude/b16-board`, PR #168.** The branch is deploying. `test` and CodeQL are
green; `deploy environment` failed at `ci-env-BackupStack`: IAM answered 404 for
`arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForS3Restore`. Checked against
IAM: the S3 pair lives at the root path and the DynamoDB pair under `service-role/`, so both S3
policies moved. The fix is committed and waiting on the running `deploy`.

Merged and locally verified (`npm test` 2701 passed, `./mvnw clean verify` green), off this list
when the branch's checks pass: B30s, B67, B68, B66, B65 (the five prod defects), B30r, B64 and
B25 including the vault's restore grants, B70.S1 to S6 (the licence files, the public statement,
the headers across 1238 files with a test that walks `git ls-files`, the OpenAPI fields, the
image labels, the third-party lines), B71.S1, B71.S2 and B71.S3a, B17b.1, and B11.T7's script
and runbook.

Still running as worktree sub-agents:

| Workstream | Items | Model | Owns |
|---|---|---|---|
| ITSA property design | The five O30 answers, then UK property | Opus | `PLAN_ITSA_PHASE_2.md` |
| Simulator rebuild | B70.S7 | Sonnet | `deploy.yml`, `scripts/build-simulator.js` |

A worktree agent runs `npm run bundle` before any unit, system or browser suite:
`web/public/submit.bundle.js` is gitignored, `pretest` fires only for bare `npm test`, and
without it nine tests fail on a missing file that has nothing to do with the change.

Two rules this batch proved. A whole-tree sweep runs alone, and it skips what a tool reads as
data: generated Swagger output under `web/public/docs/api/`, which `mvnw verify` rewrites, and
`.claude/commands/`, where a command with no front matter takes its description from its first
line. B71.S3b to S3e change deployed resource names, so they wait for this batch to prove green.

## Ready: Claude Code

- [ ] **B72. AWS WAF blocks every DIYA-GL book save on prod.** `PUT /api/v1/books/{bookId}`
  never reaches API Gateway: a Logs Insights query over `/aws/apigw/prod-env/access` for any PUT
  on the books routes across three hours matched zero records, and
  `wafv2 get-sampled-requests` on `prod-15f3483-app-waf` shows eight book PUTs blocked in that
  window, every one by `AWS#AWSManagedRulesCommonRuleSet#SizeRestrictions_BODY`, including the
  spreadsheets ci case's own request and our probe's `/api/v1/books/book-1`. That rule blocks a
  body over 8KB, which is all CloudFront hands WAF by default; `BOOKS_MAX_BYTES` is 2MB, so the
  storage API is built to accept a book 256 times larger than the edge will pass and has never
  taken a real one on prod. A CloudFront block returns before the origin, so there is no
  access-log row and no CORS header, and the browser reports `net::ERR_FAILED`. Fix the rule in
  `EdgeStack.java` without weakening the common rule set on routes that do not need a large
  body, and pin it with a CDK test. Its twin: every error response on the storage routes must
  carry the CORS header the preflight already grants, so a 4xx or 5xx reads as its real status
  rather than as a CORS failure. **Source**: WAF sampled requests, 2026-09-09; the spreadsheets
  repository's LP-24. **Owner**: Claude Code. **Model**: Opus.
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
- [ ] **B74. A missing bundle costs the deploy 25 minutes.** `generatePassActivityBehaviour`
  waits on `#generatePassBtn` until Playwright's timeout rather than failing when the enabling
  bundle never arrives, so each test takes 5.8 minutes to fail and its retry held run
  34402276934 open for 25 minutes after every other job had finished. Fail fast on the disabled
  button with the reason, the way the other suites do. Pre-existing. **Source**: run
  34402276934. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B17v.1. Capture the five walkthrough videos.** One video each for the three VAT read
  pages (liabilities, payments, penalties; against prod once B17b.1 is live, in the 17a
  pattern: `videos/*.json`, `auth: "user"`, `site-video-capture`), one for the micro-entity
  accounts filing and a fresh one for ITSA (business details through the quarterly update),
  both against a ci set since neither activity goes to prod, each described on screen and in
  its `publish.json` entry as a sandbox preview. The ITSA recording replaces the 2026-09-07
  `itsa-business-details` one. **Source**: BACKLOG 17b, 17c; issue #19. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **B71.S3b. DIYA-GL naming: the CDK and workflow identifiers nobody else consumes.**
  `BooksStack` to `DiyaGlStack` and its literal name in `deploy.yml`, `destroy-ci.yml`,
  `destroy-prod.yml` and `stack-drift.yml`; `booksStackId`, `BOOKS_STACK_NAME`,
  `COGNITO_BOOKS_CLIENT_ID`, the lookup-resources outputs, the `deploy-books` job, the
  headers policy name, `BOOKS_ALLOWED_ORIGINS`, the `cdk.json` key and the CFN outputs, per
  S3a's order; a stack rename is a replacement, so it lands on a ci set first and on prod
  through one deploy of main. It also carries the four `app/functions/books/` modules and
  their unit tests, whose basenames are the deployed Lambda names. **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude
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
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet. Both
  prefixes are served from this row's first deploy and the spreadsheets side switches after,
  so nothing gates this.
- [ ] **B71.S3e. DIYA-GL naming: the bucket.** `{prefix}-books-{account}` to
  `{prefix}-diya-gl-{account}` in `DataStack.java`, `SubmitSharedNames.java` and
  `BackupStack.java`. S3a decided the rename needs no data copy: `list-object-versions` on
  `prod-env-books-972912397388` returns nothing and ci holds only behaviour-run objects, and
  the lifecycle rules and the AWS Backup selection follow the CDK name. Re-check both buckets
  first and stop if either holds an object, in which case S3a's copy sequence applies.
  **Source**: `PLAN_DIYA_GL_NAMING.md` NM-S3. **Owner**: Claude Code. **Model**: Sonnet.

## Ready: operator

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

- [ ] **B52x. A short extract from the raw export to prove every field fills.** The RawExport
  Lambda reached prod at 18:01 UTC on 2026-09-09, after that morning's 02:15 UTC nightly run,
  so nothing has been exported yet. The first files land at 02:15 UTC on 2026-09-10 in
  `s3://prod-env-analytics-lake-972912397388/exports/prod/2026-09-09/`: 21 CSVs, one per view,
  and 8 JSONs, one per objective. Then pull one day through the notebook's data path
  (`PLAN_ONE_STOP_DASHBOARD.md` D16's export) and list every field with its count of non-empty
  entries, so a field that never fills is found now rather than in three months. **Source**:
  BACKLOG 52; plan row D16. **Owner**: Claude Code. **Model**: Haiku. Blocked until the first
  export exists on 2026-09-10.
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
- [ ] **O33. Tell HMRC's SDS team the licence changed.** One paragraph (the MTD approval
  submission and the production-credentials email described the service as AGPL open
  source). **Source**: `PLAN_LICENSING_UPLIFT_SUBMIT.md` H-LU-9. **Owner**: Operator.
  **Model**: none. Blocked on B70.S2, which is in flight, reaching main.
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
