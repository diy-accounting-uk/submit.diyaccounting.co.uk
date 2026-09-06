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

**Prod runs deployment prod-cfb43ee (main's deploy of the PR #141 merge, run 34038618085);
the deploy retired prod-3778d47 and no spare stands.** A main deploy retires the previous set itself; a `prod-*-app-*` set
left standing by anything else costs $46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

Nothing. No sub-agent runs and no batch branch is open; the next batch starts from main as
`claude/b9-board` when its first track lands.

## Ready: Claude Code

- [ ] **B10.4. Prove the ITSA Obligations and quarterly-update suites against the sandbox on
  ci.** Both endpoints are on main and prod behind the `environments` gate (PR #141), and main
  deploys run only the prod suites, which the gate skips. Dispatch `probe-test.yml` for ci with
  `itsaObligationsBehaviour` and `itsaSelfEmploymentPeriodBehaviour`, or let the next branch
  push's ci deploy run them, and read the results. Row 10's remainder after that: the dashboard
  page the catalogue names (`hmrc/itsa/dashboard.html`) does not exist. **Source**: BACKLOG 10;
  issues #16, #20. **Owner**: Claude Code. **Model**: Fable (coordinator).
- [ ] **B30o. Prove the triage chain on prod.** `SUBMIT_ALARM_TRIAGE_ROLE_ARN` is set on both
  environments and the day guard counts only runs whose `run-triage` job executed (PR #139).
  Labelling #140 `triage` at 12:01 UTC on 2026-09-06 ran the chain (run 34031866561): the role
  was assumed, the guardrail read, and Bedrock answered 403, "not authorized to perform the
  required AWS Marketplace actions (aws-marketplace:ViewSubscriptions,
  aws-marketplace:Subscribe)"; the redaction script posted that failure line and nothing else.
  Anthropic models on Bedrock are Marketplace-listed and the first call subscribes the
  account, so the triage role in `ObservabilityStack.java` grants those two actions, pinned in
  the CDK test (4316f0ce, merged in PR #141 and deployed to both environments by the
  environment re-run 34038617995). Next step: label an open alarm issue `triage`. Verified when
  that run posts a triage comment with the guardrail's anonymised output. **Source**: BACKLOG 30; issue #18.
  **Owner**: Claude Code. **Model**: Fable (coordinator).

Batches 4 (PR #136), 5 (PR #137) and 6 (PR #139) are merged. The items below are code complete
on main and each names the event that verifies it.

- [ ] **C1. CodeQL runs only when test.yml would.** `codeql.yml` triggers on every push to main
  and every pull request, so each docs-only push to main today ran it (four times between
  16:18 and 18:39 UTC on 2026-09-06). Give its `push` and `pull_request` triggers the same
  `paths` list as `test.yml` (app, infra, tests, behaviour-tests, web, the env files, cdk.json,
  Dockerfile, package and pom files, the catalogue, the workflows and the lint and test
  configs); the weekly schedule stays. The spreadsheets repo has the same gap in its own
  `codeql.yml` and its own session makes that change. **Source**: operator, 2026-09-06.
  **Owner**: Claude Code. **Model**: Haiku.
- [ ] **D1. The PITR custom resource waits for a new table's backups.** Every environment deploy
  that creates an async-requests table fails `<env>-env-DataStack` on that table's `EnsurePITR`
  resource with "Backups are being enabled for the table" (DynamoDB's
  ContinuousBackupsUnavailableException): `ensurePointInTimeRecovery` in
  `infra/main/java/.../utils/KindCdk.java` calls UpdateContinuousBackups the moment the
  CreateTable custom resource returns, before DynamoDB has finished turning on the table's
  default backups. A re-run succeeds because the table is ready by then. Two main deploys hit
  it in a day: run 33993674189 (2026-09-05 21:42, the ITSA Business Details table) and run
  34038617995 (2026-09-06 14:19, the Obligations and Self Employment period tables), prod both
  times; ci passed the same runs, so it is a timing race, not a prod difference. Replace the
  `AwsCustomResource` with a `Provider`-backed custom resource whose `onEvent` calls
  UpdateContinuousBackups and whose `isComplete` polls DescribeContinuousBackups until
  point-in-time recovery reads ENABLED, retrying the update while the backups are still being
  enabled (`app/functions/infra/ensurePitr.js`, next to `selfDestruct.js`); unit test on the
  handler, CDK test that every ensured table has the resource. **Source**: deploy-environment
  runs of 2026-09-05 and 2026-09-06. **Owner**: Claude Code. **Model**: Sonnet.


## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O12. Close #138 as stale.** Its alarm went with prod-0967fab (destroyed 12:15 UTC on
  2026-09-06); the issue carries a comment with the cause and the recommendation to close.
  **Source**: board render 2026-09-06. **Owner**: Operator.
- [ ] **B17a.5. Publish the videos** on https://www.youtube.com/@DIYAccountingSubmit with
  titles and descriptions drafted from the captions. The prod recordings are workflow
  artifacts, each with mp4, vtt, transcript and stills and 30-day retention:
  `video-view-obligations-prod` on run 33952515598, `video-submit-return-prod` on run
  33953044775, and `video-view-return-prod` on run 34017736028 (the return on screen is the one
  filed off camera, Box 6 at £5,000). The ITSA Business Details recording is ci-only until the
  activity leaves the gate: `video-itsa-business-details-ci` on run 34002898819. **Source**:
  BACKLOG 17a. **Owner**: Operator (an upload via the YouTube Data API can follow once the
  pattern settles).
- [ ] **O11. Companies House filing: the developer-hub and ci steps.** The developer hub keys
  an application to one Companies House environment, sandbox ("test application") or
  production ("live application"). The hub holds three: "DIY Accounting Submit - test"
  (sandbox) and the live "- ci" and "- prod", whose API keys serve the read-only lookup, which
  reads real company data from both environments. Filing on ci runs against the sandbox, so
  its OAuth client belongs on the test application, shared by local, proxy and ci; prod's
  filing client goes on the live "- prod" application when the gate lifts (B34.5). On the test
  application at
  developer.company-information.service.gov.uk/manage-applications: create a key of type OAuth
  web client (or open the one that exists) and register the three sandbox redirect URIs from
  `PLAN_COMPANIES_HOUSE_REST_FILING.md`'s operator steps (localhost:3000, local.submit:3443,
  ci-submit, each ending `/companies-house/filingCallback.html`); put its client id as the
  `COMPANIES_HOUSE_CLIENT_ID` variable and its secret as the `COMPANIES_HOUSE_CLIENT_SECRET`
  secret on the GitHub `ci` environment (done 2026-09-06: key "submit filing", three redirect
  URIs, id in `.env.ci`, secret on ci, and `ci/submit/companies-house/client_secret` in AWS
  since main's environment deploy of the PR #139 merge). Remaining: on the ci set PR #141's
  deploy creates, open the two filing activities on the ci site and take one change through the sandbox with your own Companies
  House sandbox sign-in. No credentials go into GitHub for this: Companies House filings need
  a person to authorise them, so an automated ci run would need a robot account with an
  authenticator secret, which is not wanted. **Source**: BACKLOG 34; issue #15. **Owner**:
  Operator.

## Blocked: operator

- [ ] **O16 / B34b. Chase Companies House for the XML Gateway test presenter credentials on
  2026-09-21.** The presenter account exists (ID E0000052288, code in the operator's
  credentials store); the test presenter credentials and the accounts specification were
  requested from xml@companieshouse.gov.uk on 2026-09-05. When they arrive, put the code on the
  GitHub environments as a secret and tell Claude Code, which starts B34.6. **Source**: BACKLOG
  34b; issue #15. **Owner**: Operator. Date-gated: chase on 2026-09-21.
- [ ] **O17 / B34.7. Automated Companies House sandbox sign-in for the filing suites, only if
  wanted.** Companies House has no HMRC-style create-test-user API: its test data generator
  makes companies only, and a sandbox user is a real account on
  identity-sandbox.company-information.service.gov.uk with an authenticator second factor. An
  automated ci run of the two filing suites therefore needs a throwaway sandbox account the
  operator registers, with its email as `TEST_COMPANIES_HOUSE_USER_ID`, its password as
  `TEST_COMPANIES_HOUSE_PASSWORD` and its authenticator secret as
  `TEST_COMPANIES_HOUSE_TOTP_SECRET` on the ci GitHub environment, plus the test application's
  REST key as `COMPANIES_HOUSE_SANDBOX_API_KEY` for creating the run's test company. The parked
  local branch `claude/companies-house-filing-ci-sandbox` (ef091559) has everything except the
  TOTP step, which Claude Code adds the way the Cognito lane computes its code. Claude Code
  asks before starting. **Source**: BACKLOG 34; issue #15. **Owner**: Operator decides, then
  Claude Code. **Model**: Sonnet. Blocked on the operator wanting it.
- [ ] **O9 / B47. Watch the revived weekly `compliance` and `stack-drift` crons fire on their
  own** on Monday 2026-09-07 06:00 UTC (`codeql` fired on its schedule on 2026-09-06, run
  34022009649). If one misses, revive it the same way as on 2026-08-31 and tell Claude Code.
  **Source**: BACKLOG 47. **Owner**: Operator. Date-gated: 2026-09-07.

## Blocked: Claude Code

- [ ] **B34.5. Lift the gate on the Companies House filings for prod.** After O11 and the
  operator's examination on ci: an OAuth web client key on the existing live application
  "DIY Accounting Submit - prod" (the one whose API key serves prod's lookup) with the prod
  redirect URI
  `https://submit.diyaccounting.co.uk/companies-house/filingCallback.html`, its client id in
  `.env.prod` and its secret as `COMPANIES_HOUSE_CLIENT_SECRET` on the GitHub `prod`
  environment (operator steps, briefed when they come due); then `prod` joins the two filing
  activities' `environments` in `web/public/submit.catalogue.toml`, `deploy.yml` runs the two
  filing suites against prod, and the pricing question in `PLAN_COMPANIES_HOUSE_REST_FILING.md`
  Q1 gets its answer before the activities leave the free `default` bundle. **Source**: BACKLOG
  34; issue #15. **Owner**: Claude Code, with the operator's hub and secret steps. **Model**:
  Sonnet. Blocked on O11 and the operator's look at the filings on ci.
- [ ] **B34.6. Companies House accounts filing through the XML Gateway.** FRS 105 micro-entity
  accounts as iXBRL in an XML envelope against the test presenter credentials: an Opus design
  pass (envelope, presenter authentication, the accounts spec, where the iXBRL comes from,
  simulator routes) then a Sonnet build, with the presenter code reaching the build as a
  GitHub environment secret. **Source**: BACKLOG 34b; issue #15. **Owner**: Claude Code.
  **Model**: Opus design, then Sonnet. Blocked on O16.
- [ ] **G3. Confirm a real `purchase` lands in prod**: the next live
  checkout should appear in `diyaccounting-ga4.analytics_523400333.events_*`
  (`bq --project_id=diyaccounting-ga4 --location=europe-west2`). No event of that name has
  ever reached the export. **Source**: none. **Owner**: Claude Code (read-only query).
  **Model**: Haiku. Blocked on a live sale.
## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
