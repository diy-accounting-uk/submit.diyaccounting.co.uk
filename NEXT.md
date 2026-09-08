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

**Prod runs deployment prod-c6e18fd (the 2026-09-07 scheduled deploy of main, run 34105362721);
no spare stands. B53b holds the decision that stops a spare recurring.** A main deploy
retires the previous set itself; a `prod-*-app-*` set left standing by anything else costs
$46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in six sections, in this order: in flight; ready and unblocking other items;
ready; blocked on a machine task; blocked on a human task; blocked on a date. Operator items
are briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the workspace root.
Every item names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or
`none` for a human step.

## In flight

Batch 12 gathers on `claude/b12-board` (local, from main at 7e11b39c); one push and one PR when
the wave's tracks are merged and green. Wave 1 runs in worktrees under `.claude/worktrees/`, one
agent per file area; each item's body stays in its section below until it is verified on main.

| Items | Agent | Model | Worktree |
|---|---|---|---|
| B34.8, B34.9, B54 (catalogue) | merged to the batch at fc21444a; the Stripe test and live runs wait on the operator's "go" | Sonnet | — |
| B47a, B53a, S4a (workflows) | workflows | Sonnet | `agent-afb14a84da1eaeaee` |
| B52a (the two prod dashboards) | dashboards | Sonnet | `agent-ac96c52c3e6f5cc58` |
| S1, S3 (Config recorder, CIS 5.0, multi-region trail) | security CDK | Sonnet | `agent-a5fa40edd14329921` |
| S2 (CodeQL fixes; dismissals written up for the operator) | codeql | Sonnet | `agent-a6e21bbdd321cc0a4` |
| S5, B50 (runtimes, `lifecycle.toml`, the DIYA-GL client in the toggle) | merged to the batch at 82aeadbb | Haiku | — |
| B10.5, B10.6 (ITSA endpoints, facts, client comparison) | itsa | Sonnet | `agent-ade3c05057d2d847a` |
| B22 (fraud-header email check) | fraud-header | Sonnet | `agent-a3e396613eb4ac63a` |
| B52d and B55 designs into their plan docs | design | Opus | `agent-a09db863e980dd495` |

Wave 2 starts as wave 1's tracks merge: B52d and B55 from the designs, B10.4 against the batch's
ci set, B52b, B52c (submit's part). The Stripe test and live runs for B34.9 and B54 wait on the
operator's "go" per `stripe-catalogue-sync`.

## Ready, unblocking others

- [ ] **B52a. Split the two prod dashboards into operations and business.**
  `prod-env-operations` (thirteen widgets, `ObservabilityStack`) carries five business counts
  and three widgets that never render: the "all functions, all deployments" searches match
  about 4,700 `prod-*` Lambda series (retired deployments' functions, canaries, one series per
  alias and version) against CloudWatch's 500 per widget. Narrow those searches to the live
  deployment's functions and exclude `cwsyn-*`; move VAT submissions, HMRC authentications,
  bundle operations, sign-ups and bundle grants off it. On `prod-env-analytics`
  (`AnalyticsDashboard`), find at the source why sessions by country and passes are empty over
  two weeks and why login-to-submission conversion reads zero against daily active users and
  submissions, then lay the widgets out as the objective table's first column (uptime, conversion
  to submission, conversion to paid, running cost) from `PLAN_ONE_STOP_DASHBOARD.md`. One
  deliberate duplicate per quantity stays where two sources measure it. **Source**: BACKLOG
  52; `PLAN_ONE_STOP_DASHBOARD.md` row B52a. **Owner**: Claude Code. **Model**: Sonnet.
  Related open work the plan's panels depend on, each tagged with its panel: BACKLOG 30
  and 30a (alarms; the audit re-run due 2026-09-13 becomes a nightly view), B47a and
  issue #43 (the DORA and drift panels), B39.1 and issue #13 (web vitals on the sibling
  sites), BACKLOG 43 (the cost panel replaces the monthly hand check), BACKLOG 49 (GA4 changes
  as code for D3), BACKLOG 27a, 46, 48 and issue #11 (the security panels). Unblocks B52d.
- [ ] **B52d. Lake views.** Submissions by activity including the four Companies House
  events; sources; the availability SLI and error budget from the probe metrics; alarm state
  changes by family through the existing Firehose pattern; DORA rows (name, environment,
  branch, sha, run id, duration, lead time, failure, recovery) from the deploy and destroy
  workflows. **Source**: BACKLOG 52; plan rows D1, D6, D8. **Owner**: Claude Code. **Model**:
  Sonnet. Unblocks B52g, B52h, B52j and B52k.
- [ ] **B47a. Why the Monday 06:00 UTC schedules do not fire.** `compliance.yml` and
  `stack-drift.yml` both carry `cron: '0 6 * * 1'`; neither ran on 2026-09-07 (checked at 09:00
  UTC), the second miss after the 2026-08-31 revival, and `codeql.yml`'s Sunday schedule did
  fire on 2026-09-06. Both were dispatched by hand at 09:0x UTC on 2026-09-07 instead. Find the
  cause from GitHub's rules for scheduled workflows (the workflow must be on the default
  branch, schedules are dropped after 60 days without activity, high-load delays, a disabled
  workflow state visible with `gh workflow view <name>` and the Actions API's `state`), and
  compare the two files' histories with `codeql.yml`'s; fix what is found (a re-enable through
  the API, or a change to the files) and record how a future miss is detected (the
  `keepalive.yml` workflow may already exist for this; read it). Issue #43 closes when the next
  scheduled `stack-drift` run is green. Feeds `PLAN_ONE_STOP_DASHBOARD.md`'s DORA and
  drift panels (D8). **Source**: BACKLOG 47; issue #43.
  **Owner**: Claude Code. **Model**: Sonnet. Unblocks the close of issue #43.
- [ ] **S1. AWS Config recorder and Security Hub at CIS 5.0.** Both subscribed standards are
  `INCOMPLETE` with reason `NO_AVAILABLE_CONFIGURATION_RECORDER`, and the one critical finding
  says so. Add the recorder and delivery channel to the environment CDK (a recurring charge
  per recorded item; name the figure in the PR), replace CIS 1.2.0 with 5.0, keep the AWS
  Foundational standard, and triage the fourteen low and one medium findings. **Source**: the
  prod account, 2026-09-07; `PLAN_ONE_STOP_DASHBOARD.md` security section. **Owner**: Claude
  Code, the operator's yes on the charge. **Model**: Sonnet. Unblocks B52f.
- [ ] **S4a. A rotation record for secrets.** Every environment deploy rewrites every Secrets
  Manager secret from the GitHub environment, so `LastChangedDate` is the last deploy and
  `LastRotatedDate` is empty for all twelve. Keep the real rotation date per secret in a
  record the deploy carries forward (a tag on the secret set only when the value changes, or
  `secrets-rotation.toml` in the repo) and list the ones older than a year. Unblocks S4b.
  **Source**: the prod account, 2026-09-07. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B53b. Decide: fix the prod sweep or drop the daily schedule.** `deploy.yml` carries
  `schedule: cron '11 4 * * *'`, so main deploys to prod every day whether or not it changed.
  On a schedule event `set-origins` reports no existing deployment, so `destroy previous`
  takes the sweep path; the sweep's candidates are the CloudFront alias targets that look like
  `prod-*` plus the last-known-good pointer, which the run's own earlier job had already moved
  to the new set, so the replaced set is never considered (run 34105362721: "No prod stacks
  found for destruction"; prod-c980ac9 stood until the operator's destroy at 21:31 UTC). The
  choice: fix the sweep to consider every deployed prod set older than eight hours that is not
  the pointer, or drop the daily schedule, which deploys a fresh prod set every day whether or
  not anything changed. Unblocks B53c. **Source**: the prod account, 2026-09-07. **Owner**:
  Operator. **Model**: none.
- [ ] **O17. Register the Companies House sandbox test user and set four ci values.**
  Companies House has no create-test-user API, so the operator registers a throwaway account
  on identity-sandbox.company-information.service.gov.uk with an authenticator second factor
  and puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its
  email) and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`
  (the authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's
  REST key, for creating the run's test company). Unblocks B34.7. **Source**: BACKLOG 34;
  issue #15. **Owner**: Operator. **Model**: none.
- [ ] **O25. Say yes to the FOCUS cost export from the management account.** The cost panel
  needs an AWS Data Exports FOCUS 1.2 export from account 887764105431 into the analytics
  lake, a write in the management account with a small monthly charge for the export bucket.
  A yes here, and whether it goes in `root.diyaccounting.co.uk`'s CDK or this repo's
  environment deploy through the management-account role. Unblocks B52e. **Source**: BACKLOG
  52; plan row D7. **Owner**: Operator. **Model**: none.
- [ ] **O27. Examine the three VAT read pages on ci.** Liabilities, payments and penalties are
  on main, ci only, on every bundle. Open them on a standing ci set, read each against the
  HMRC figures the sandbox returns, and say what reads wrong or that they can go to prod.
  Unblocks B17b. **Source**: BACKLOG 17b; issue #19. **Owner**: Operator. **Model**: none.
- [ ] **B10.4. ITSA sandbox proof: one quarterly update filed.** Business Details, Obligations
  and the cumulative period-summary POST are on main behind the environments gate
  (`hmrcItsaBusinessDetailsGet.js`, `hmrcItsaObligationsGet.js`,
  `hmrcItsaSelfEmploymentPeriodPost.js`). Create an HMRC sandbox test user with a
  self-employment business through the create-test-user API, run the three against
  test-api.service.hmrc.gov.uk from a ci set with the `Gov-Test-Scenario` values
  `_developers/hmrc/ITSA_SPIKE.md` names, and record the accepted update's response in the
  simulator. Unblocks B11. **Source**: BACKLOG 10; issues #16, #20. **Owner**: Claude Code.
  **Model**: Sonnet.
- [ ] **B10.6. The ITSA facts and the client recommendation.** Confirm from gov.uk the MTD for
  Income Tax mandate dates and income thresholds as they stand (the row proposed about £20k)
  and write them into `_developers/hmrc/ITSA_SPIKE.md`; then a one-page comparison of an
  OpenAPI-generated client from `_developers/reference/hmrc-mtd-self-employment-business-api-5.0.yaml`
  against the hand-rolled pattern the VAT client uses, with a recommendation. Unblocks O26.
  **Source**: BACKLOG 10. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B22. Fraud-prevention header email check.** The parser
  `app/lib/fraudPreventionHeaderReport.js` is built and tested; `PLAN_FRAUD_HEADER_EMAIL_CHECK.md`
  recommends a scheduled script over the gyb mail mirror at the workspace root, alerting
  through the operational Telegram path when a month reads advisories, errors or zero
  traffic. Build that path and write each month's result where B52k's compliance panel can
  read it. Unblocks B52k's HMRC row. **Source**: BACKLOG 22; HMRC compliance. **Owner**:
  Claude Code. **Model**: Sonnet.

## Ready

- [ ] **B34.8. The standalone company-lookup page to prod.** The operator has seen it on ci
  and calls it ready. Add `prod` to the `company-lookup` activity's `environments` in
  `web/public/submit.catalogue.toml` (the two register filings already carry it); one PR.
  **Source**: BACKLOG 34; issue #15. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B34.9. The `resident-ltd` bundle and the `resident-pro` union.** The operator's
  decision of 2026-09-07: a single-function bundle `resident-ltd` at 99p a month shaped like
  `resident-vat` and `resident-itsa` (`allocation = "on-subscription"`, 100 tokens, `P1M`,
  `stripePriceAmount = 99`), carrying `file-micro-entity-accounts` as a metered activity at
  one token; the two register filings stay free on `default`; `resident-pro` covers the union
  of VAT, ITSA and ltd, so its activity lists gain the ITSA and accounts activities.
  `listedInEnvironments` keeps `resident-ltd` off prod's listing until B34.6b puts the
  accounts activity there. Then `stripe-catalogue-sync`: the product and price in test, then
  live, and the ids onto `.env.ci`, `.env.prod` and the GitHub environments. **Source**:
  BACKLOG 34b; issue #15. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B10.5. The remaining ITSA phase 1 endpoints, one PR each.** From
  `_developers/reference/hmrc-mtd-self-employment-business-api-5.0.yaml`: list, retrieve and
  amend the cumulative period summaries, each as `hmrcItsa<Name>.js` with the simulator route,
  the unit tests and the page, shaped as the three on main; every self-employment path takes
  the `businessId` Business Details returns. **Source**: BACKLOG 10; issues #16, #20.
  **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B53a. The ci sweep and the stale ci pointer.** `destroy-ci.yml`'s 14:23 UTC sweep on
  2026-09-07 left `ci-claudd9a1-app-BooksStack` standing alone (a set reduced to one stack is
  not swept); the 22:09 UTC run removed it. Two fixes remain: make the sweep count any
  `*-app-*` stack when it sizes a set, and clear `/submit/ci/last-known-good-deployment` when
  the set it names is gone (it still reads `ci-claudd9a1` with no stacks behind it).
  **Source**: the ci account, 2026-09-07. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B52b. GA4 in BigQuery: one daily aggregate per panel.** Scheduled queries in the
  `diyaccounting-ga4` project over the `analytics_523400333` export write one daily table per
  panel: sessions by host and source, funnel steps, key events, downloads by product with the
  product parameter. The nightly job copies them into the lake beside the Athena views. The
  Data API pull in `ga4ReportPull.js` retires once each of its consumers reads the BigQuery
  table instead. **Source**: BACKLOG 52; `PLAN_ONE_STOP_DASHBOARD.md` D5 and the BigQuery
  decision. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **B52c. Three sites, one visitor.** Synthetic tagging in submit's and spreadsheets'
  `analytics.js` and the RUM client from the rule `classifyActor` applies; RUM and CLS on
  spreadsheets; the root holding page moved from the submit stream to the gateway stream;
  cross-domain linking and the four key events (subscribe, submit, donate, download) on
  property 523400333 through backlog 49's tooling or the Admin API script. One PR per repo.
  **Source**: BACKLOG 52; plan rows D3, D4. **Owner**: Claude Code. **Model**: Sonnet.
- [ ] **S2. CodeQL's 44 open high alerts.** 33 are `js/clear-text-logging`, 4 clear-text
  storage, 2 CORS with credentials, and one each of incomplete sanitisation, incomplete URL
  sanitisation, missing rate limiting, unvalidated dynamic method call and a weak algorithm.
  Fix each or dismiss it with the reason on the alert; a dismissal without a reason is a fix
  not done. **Source**: GitHub code scanning, 2026-09-07. **Owner**: Claude Code. **Model**:
  Sonnet.
- [ ] **S3. CloudTrail multi-region.** `prod-env-trail` records eu-west-2 only; the WAF,
  the RUM monitor and the canaries' us-east-1 side are unseen. Set `IsMultiRegionTrail` in
  `ObservabilityStack`, ci first. **Source**: the prod account, 2026-09-07. **Owner**: Claude
  Code. **Model**: Haiku.
- [ ] **S5. Runtime lifecycle.** The four canaries run `syn-nodejs-puppeteer-11.0`, a Node 20
  runtime; move them to the current Synthetics runtime. Three Lambdas run `NODEJS_22_X`
  beside 23 on 24; move them. Record in `lifecycle.toml` (B52f) the ACM certificate's
  2027-02-06 expiry and confirm it auto-renews by DNS validation, the local certificate
  (BACKLOG 48), Java 25, the CDK major and Playwright. **Source**: the prod account,
  2026-09-07. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B50. Add the DIYA-GL app client to the native-auth toggle.** The spreadsheets session
  asked on 2026-09-07 (inbox): `scripts/toggle-cognito-native-auth.js` reads only the
  `UserPoolClientId` output of the identity stack, so the spreadsheets ci behaviour case
  cannot sign in to the DIYA-GL pages without Google. Read the `BooksUserPoolClientId` output
  as well and apply the same `COGNITO` provider change to that client on enable and disable
  (the credentials file stays one file); one-line reply to the spreadsheets inbox when it is
  on main. **Source**: BACKLOG 50; spreadsheets board H16. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **O23. Open a Google Ads account for the paid-traffic experiments.** Both earlier Ads
  accounts were cancelled (`google-analytics.toml`); the reinvestment loop (plan row D17) needs
  one with conversion import from GA4 property 523400333's key events, and a reserve floor
  the loop must not spend below. Name the floor to Claude Code with the account id; the first
  test is designed as on-off weeks before any spend. **Source**: `PLAN_ONE_STOP_DASHBOARD.md`
  D17. **Owner**: Operator. **Model**: none.
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

- [ ] **B54. The `resident-diya-gl` bundle at 99p a month.** The bundle the storage API's put
  route checks (`BOOKS_BUNDLE_ID` in `BooksStack`) is `resident-diya-gl`, titled "DIYA-GL" (the
  operator's naming of 2026-09-08: DIYA-GL in titles and prose, `diya-gl` in identifiers, never
  "books" as a product name). It sits in `web/public/submit.catalogue.toml` shaped like
  `resident-itsa` (`allocation = "on-subscription"`, `stripePriceAmount = 99`, `gbp`, `month`)
  carrying the DIYA-GL storage put as its activity. `resident-diya-gl`, `resident-ltd` and
  `resident-itsa` are listed for purchase on ci only (`listedInEnvironments` without `prod`) until
  the operator lifts each one; the catalogue change is on the batch. Remaining:
  `stripe-catalogue-sync`: the product and price in test, then live, and the ids onto `.env.ci`,
  `.env.prod` and the GitHub environments. **Source**: spreadsheets board LP-21;
  `PLAN_DIYA_GL_STORAGE.md` section 6. **Owner**: Claude Code. **Model**: Sonnet.

## Blocked on a machine task

- [ ] **B55. Checkout and the portal for DIYA-GL tokens.** `POST /api/v1/billing/checkout` and
  the portal route sit behind the main Cognito authoriser, whose audience is the Submit app
  client, so a token from the DIYA-GL client (`BooksCognitoAuthorizer`'s audience) is refused.
  Accept the DIYA-GL audience on those two routes, or add DIYA-GL-scoped twins under
  `BooksCognitoAuthorizer`; checkout takes the `resident-diya-gl` bundle; the proof is a behaviour
  case on ci that subscribes with a DIYA-GL token and then puts a book. The spreadsheets side
  (the subscribe button and the portal link in the account panel) is that board's LP-18 and
  waits on this. **Source**: spreadsheets board LP-18; `PLAN_DIYA_GL_STORAGE.md` section 9.
  **Owner**: Claude Code. **Model**: Sonnet. Blocked on B54.

- [ ] **O26. Decide the ITSA client approach and the token cost per submission.** From
  B10.6's comparison, pick generated or hand-rolled; and set whether a quarterly update costs
  the same one token as a VAT return. **Source**: BACKLOG 10. **Owner**: Operator. **Model**:
  none. Blocked on B10.6.
- [ ] **B11. ITSA phase 2: annual summaries and the final declaration.** The annual submission
  and the final declaration (crystallisation) endpoints, then the recognition application and
  the finder listing, which follow BACKLOG 11a's parked questionnaire. An Opus design pass
  first, since the annual summary carries the whole year's figures and the books import
  (`PLAN_SUBMISSION_MCP.md`) is the natural source. **Source**: BACKLOG 11. **Owner**: Claude
  Code. **Model**: Opus design, then Sonnet. Blocked on B10.4.
- [ ] **B52g. The page.** A private static page on submit behind an `operator` bundle no
  customer holds, drawn from a nightly snapshot the metrics-publish Lambda writes, organised
  by the eight objectives with deep links on every row and `experiments.toml` annotations; the
  first experiment written from a baseline month, the hypothesis the operator's. **Source**:
  BACKLOG 52; plan rows D1, D9, D11. **Owner**: Claude Code. **Model**: Sonnet. Waits on
  B52d for the first views.
- [ ] **B52h. Raw export and index.** One CSV per view and one JSON per objective to
  `s3://<lake>/exports/<env>/<date>/` nightly; `scripts/analytics-pull.sh` to
  `~/projects/diy-accounting-limited/analytics/<env>/`; an `analytics` source in
  `../index/corpus.toml`; `reindex` after each pull. **Source**: BACKLOG 52; plan row D12.
  **Owner**: Claude Code, the corpus change at the workspace root. **Model**: Sonnet. Waits
  on B52d.
- [ ] **B52j. Retention and operator-effort views.** Returning submitters by quarter keyed
  by hashed subject, renewals and cancellations from the subscriptions stream; a nightly pull
  of Actions runs by trigger and actor, issue timelines and commits by author, classified into
  operator interventions. **Source**: BACKLOG 52; plan row D14. **Owner**: Claude Code.
  **Model**: Sonnet. Waits on B52d.
- [ ] **B52k. Compliance panel.** Accessibility results from `compliance.yml` (pa11y, axe
  WCAG 2.1 AA and 2.2 AA) into the lake; HMRC's monthly fraud-prevention header email to
  `app/lib/fraudPreventionHeaderReport.js` along `PLAN_FRAUD_HEADER_EMAIL_CHECK.md`'s path
  (BACKLOG 22) with the result into the lake; `compliance.toml` for the standing items (the
  HMRC questionnaires, terms-of-use items, the Companies House presenter and test account,
  ICO registration, the 72-hour breach clock) with a date and an owner each. **Source**:
  BACKLOG 52 and 22; plan row D15. **Owner**: Claude Code. **Model**: Sonnet. Waits on B52d.
- [ ] **B52f. Security panels.** Security Hub and GuardDuty findings and the GitHub alert
  counts into the lake nightly; `lifecycle.toml` with each runtime's, dependency's,
  certificate's and registration's end date, checked nightly against the AWS deprecation
  lists and endoflife.date; an SBOM from the build matched against CISA's KEV catalogue;
  CloudTrail metric filters for console sign-ins, root use, IAM and security-group changes;
  WAF logs to the lake; the rotation record (S4). **Source**: BACKLOG 52; plan row D13.
  **Owner**: Claude Code. **Model**: Sonnet, Opus for the traffic baselines. Waits on S1 for
  the standards' findings.
- [ ] **B52l. The optimiser.** A notebook over the raw export: per-block correlations, the
  block models (linear cost, log-linear funnels, Hill saturation for spend), levers ranked by
  effect per unit cost, and the next experiment proposed with its predicted effect and
  interval; Bayesian optimisation for the continuous knobs and a Thompson-sampling bandit for
  allocations once experiments exist. Its one line per objective goes on the page. **Source**:
  BACKLOG 52; plan row D16 and the optimisation section. **Owner**: Claude Code. **Model**:
  Opus for the models, Sonnet for the notebook. Blocked on B52h and three months of export.
- [ ] **S4b. Rotate the third-party secrets S4a lists as older than a year.** HMRC, Stripe,
  Google, Telegram, Companies House and the GitHub issue bot token, each in its own console,
  then the new value onto the GitHub environments. **Source**: S4a. **Owner**: Operator.
  **Model**: none. Blocked on S4a.

## Blocked on a human task

- [ ] **B17b. VAT read-page videos.** After O27: add `prod` to the three activities'
  environments in `web/public/submit.catalogue.toml`, record liabilities, payments and
  penalties one video each in the 17a capture pattern (`videos/*.json`, `auth: "user"`,
  `site-video-capture`), and publish them with `video-publish` beside the others. **Source**:
  BACKLOG 17b; issue #19. **Owner**: Claude Code. **Model**: Sonnet for the capture, Haiku
  for the publish. Blocked on O27.
- [ ] **B53c. Build B53b's choice.** Either the sweep change in `destroy-prod.yml` (candidates
  from `DEPLOYED_DEPLOYMENT_NAMES`, older than `SELF_DESTRUCT_DELAY_HOURS`, not the pointer)
  or the schedule's removal from `deploy.yml`; ci first where the change is shared. **Source**:
  B53b. **Owner**: Claude Code. **Model**: Sonnet. Blocked on B53b.
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
- [ ] **B52e. Cost panel.** The FOCUS 1.2 Data Export O25 approves, into the lake; the
  budgets and the anomaly monitor from `_developers/archive/PLAN_COST_INSTRUMENTATION.md`;
  cost per submission as the unit figure. **Source**: BACKLOG 52; plan row D7. **Owner**:
  Claude Code. **Model**: Sonnet. Blocked on O25.
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof.** After O16: submit the
  FRS 105 accounts to the XML Gateway test service with the test presenter credentials (a
  GitHub environment secret), read the real acknowledgement and poll responses, settle the
  `Authority` element question (the worked example carries it, FormSubmission-v2-11 does not),
  correct the envelope and iXBRL where the sandbox's own validation differs from the public
  schemas, record what the sandbox returned in the simulator, then add `prod` to the
  `file-micro-entity-accounts` activity and to `resident-ltd`'s listing. **Source**: BACKLOG
  34b; issue #15. **Owner**: Claude Code. **Model**: Sonnet. Blocked on O16.

## Blocked on a date

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

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
