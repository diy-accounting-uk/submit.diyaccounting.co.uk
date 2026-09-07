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

**Prod runs deployment prod-c6e18fd (the 04:11 UTC scheduled deploy of main, run 34105362721,
which ran at 09:19). prod-c980ac9 was named to `destroy-prod.yml` by the operator at 2026-09-07 evening; B53 holds
the decision that stops it recurring.** A main deploy
retires the previous set itself; a `prod-*-app-*` set left standing by anything else costs
$46.88/month until named to `destroy-prod.yml`
(`_developers/archive/PLAN_COST_OPTIMISATION.md`). Drift findings live in issue #43.

The board runs in five sections, in this order: in flight; ready for Claude Code; ready for
the operator (each briefed for Claude Cowork in `../BRIEF_OPERATOR_TASKS_2026-09-04.md` at the
workspace root); blocked operator items; blocked Claude Code items.

## In flight

PRs #148 (the accounts filing), #149 (the books Cognito client) and #150 (the books storage
API) are merged and deployed; prod carries the first BooksStack. No batch branch is open; the
next starts from main as `claude/b12-board`.

- [ ] **B30o. Prove the triage chain on prod.** The resolver fix merged in PR #147 (a missing
  alarm is evidence; composite alarms are listed). Relabelling the closed #138 `triage` at
  00:04 UTC on 2026-09-07 (run 34068635237) stopped at the day guard: more than three triage
  runs executed in the previous 24 hours. The guard clears after 12:01 UTC on 2026-09-07; then
  the operator labels any alarm issue `triage` (#138 serves, closed or not). Verified when that
  run posts the guardrail's anonymised comment. **Source**: BACKLOG 30; issue #18. **Owner**:
  Operator labels, Claude Code reads the run.
## Ready: Claude Code

- [ ] **B53. Stop the scheduled deploy leaving an orphan prod set.** `deploy.yml` carries
  `schedule: cron '11 4 * * *'`, so main deploys to prod every day whether or not it changed.
  On a schedule event `set-origins` reports no existing deployment, so `destroy previous`
  takes the sweep path; the sweep's candidates are the CloudFront alias targets that look like
  `prod-*` plus the last-known-good pointer, which the run's own earlier job had already moved
  to the new set, so the replaced set is never considered (run 34105362721: "No prod stacks
  found for destruction"). The operator ran `gh workflow run destroy-prod.yml -f
  deployment-name=prod-c980ac9` on 2026-09-07; confirm the eight `prod-c980ac9-app-*` stacks
  are gone. The second step is yours to decide: fix the sweep to consider every deployed prod
  set older than eight hours that is not the pointer, or drop the daily schedule, which
  deploys a fresh prod set every day whether or not anything changed. **Source**: this
  session's read of the prod account, 2026-09-07. **Owner**: Operator decides; Claude Code
  builds either. **Model**: Sonnet.
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
  Related open work the plan's panels depend on, each tagged with its panel: B30o and
  BACKLOG 30a (alarms; the audit re-run due 2026-09-13 becomes a nightly view), B47a and
  issue #43 (the DORA and drift panels), B39.1 and issue #13 (web vitals on the sibling
  sites), BACKLOG 43 (the cost panel replaces the monthly hand check), BACKLOG 49 (GA4 changes
  as code for D3), BACKLOG 27a, 46, 48 and issue #11 (the security panels), issue #18 (Slack
  alerting: the operator is closing it on 2026-09-07; Telegram and GitHub issues are enough). Superseded and archived on 2026-09-07:
  `PLAN_SECURITY_DETECTION_UPLIFT.md`, `SLACK_INTEGRATION_PLAN.md`, `PLAN_MCP_SERVER.md`.
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
- [ ] **B52d. Lake views.** Submissions by activity including the four Companies House
  events; sources; the availability SLI and error budget from the probe metrics; alarm state
  changes by family through the existing Firehose pattern; DORA rows (name, environment,
  branch, sha, run id, duration, lead time, failure, recovery) from the deploy and destroy
  workflows. **Source**: BACKLOG 52; plan rows D1, D6, D8. **Owner**: Claude Code. **Model**:
  Sonnet.
- [ ] **B52e. Cost panel.** A FOCUS 1.2 Data Export from the management account into the
  lake; the budgets and the anomaly monitor from
  `_developers/archive/PLAN_COST_INSTRUMENTATION.md`; cost per submission as the unit figure.
  **Source**: BACKLOG 52; plan row D7. **Owner**: Claude Code, the operator's yes for the
  management-account export. **Model**: Sonnet. Blocked on that yes.
- [ ] **B52f. Security panels.** Security Hub and GuardDuty findings and the GitHub alert
  counts into the lake nightly; `lifecycle.toml` with each runtime's, dependency's,
  certificate's and registration's end date, checked nightly against the AWS deprecation
  lists and endoflife.date; an SBOM from the build matched against CISA's KEV catalogue;
  CloudTrail metric filters for console sign-ins, root use, IAM and security-group changes;
  WAF logs to the lake; the rotation record (S4). **Source**: BACKLOG 52; plan row D13.
  **Owner**: Claude Code. **Model**: Sonnet, Opus for the traffic baselines. Waits on S1 for
  the standards' findings.
- [ ] **B52g. The page.** A private static page on submit behind an `operator` bundle no
  customer holds, drawn from a nightly snapshot the metrics-publish Lambda writes, organised
  by the five objectives with deep links on every row and `experiments.toml` annotations; the
  first experiment written from a baseline month, the hypothesis the operator's. **Source**:
  BACKLOG 52; plan rows D1, D9, D11. **Owner**: Claude Code. **Model**: Sonnet. Waits on
  B52d for the first views.
- [ ] **B52h. Raw export and index.** One CSV per view and one JSON per objective to
  `s3://<lake>/exports/<env>/<date>/` nightly; `scripts/analytics-pull.sh` to
  `~/projects/diy-accounting-limited/analytics/<env>/`; an `analytics` source in
  `../index/corpus.toml`; `reindex` after each pull. **Source**: BACKLOG 52; plan row D12.
  **Owner**: Claude Code, the corpus change at the workspace root. **Model**: Sonnet. Waits
  on B52d.
- [ ] **S1. AWS Config recorder and Security Hub at CIS 5.0.** Both subscribed standards are
  `INCOMPLETE` with reason `NO_AVAILABLE_CONFIGURATION_RECORDER`, and the one critical finding
  says so. Add the recorder and delivery channel to the environment CDK (a recurring charge
  per recorded item; name the figure in the PR), replace CIS 1.2.0 with 5.0, keep the AWS
  Foundational standard, and triage the fourteen low and one medium findings. **Source**: the
  prod account, 2026-09-07; `PLAN_ONE_STOP_DASHBOARD.md` security section. **Owner**: Claude
  Code, the operator's yes on the charge. **Model**: Sonnet.
- [ ] **S2. CodeQL's 44 open high alerts.** 33 are `js/clear-text-logging`, 4 clear-text
  storage, 2 CORS with credentials, and one each of incomplete sanitisation, incomplete URL
  sanitisation, missing rate limiting, unvalidated dynamic method call and a weak algorithm.
  Fix each or dismiss it with the reason on the alert; a dismissal without a reason is a fix
  not done. **Source**: GitHub code scanning, 2026-09-07. **Owner**: Claude Code. **Model**:
  Sonnet.
- [ ] **S3. CloudTrail multi-region.** `prod-env-trail` records eu-west-2 only; the WAF,
  the RUM monitor and the canaries' us-east-1 side are unseen. Set `IsMultiRegionTrail` in
  `ObservabilityStack`, ci first. **Source**: the prod account, 2026-09-07. **Owner**: Claude
  Code. **Model**: Sonnet.
- [ ] **S4. A rotation record for secrets.** Every environment deploy rewrites every Secrets
  Manager secret from the GitHub environment, so `LastChangedDate` is the last deploy and
  `LastRotatedDate` is empty for all twelve. Keep the real rotation date per secret in a
  record the deploy carries forward (a tag on the secret set only when the value changes, or
  `secrets-rotation.toml` in the repo), and rotate the ones older than a year. **Source**: the
  prod account, 2026-09-07. **Owner**: Claude Code; the operator rotates the third-party
  values. **Model**: Sonnet.
- [ ] **S5. Runtime lifecycle.** The four canaries run `syn-nodejs-puppeteer-11.0`, a Node 20
  runtime; move them to the current Synthetics runtime. Three Lambdas run `NODEJS_22_X`
  beside 23 on 24; move them. Record in `lifecycle.toml` (B52f) the ACM certificate's
  2027-02-06 expiry and confirm it auto-renews by DNS validation, the local certificate
  (BACKLOG 48), Java 25, the CDK major and Playwright. **Source**: the prod account,
  2026-09-07. **Owner**: Claude Code. **Model**: Haiku.
- [ ] **B50. Add the books app client to the native-auth toggle.** The spreadsheets session
  asked on 2026-09-07 (inbox): `scripts/toggle-cognito-native-auth.js` reads only the
  `UserPoolClientId` output of the identity stack, so the spreadsheets ci behaviour case
  cannot sign in to the books pages without Google. Read the `BooksUserPoolClientId` output
  as well and apply the same `COGNITO` provider change to that client on enable and disable
  (the credentials file stays one file); one-line reply to the spreadsheets inbox when it is
  on main. **Source**: BACKLOG 50; spreadsheets board H16. **Owner**: Claude Code. **Model**: Sonnet.

## Ready: operator (brief: `../BRIEF_OPERATOR_TASKS_2026-09-04.md`)

- [ ] **O22. Preview one set of micro-entity accounts on ci.** The accounts filing activity
  (`file-micro-entity-accounts`, ci only) is on main since PR #148: open it on a standing ci
  set (any branch push or `gh workflow run deploy.yml -f environment-name=ci` from main makes
  one), fill the FRS 105 balance sheet with round figures and use Preview, which renders the
  iXBRL without calling Companies House; then Submit, which goes to the simulator gateway on
  ci and shows the acknowledgement and poll. Say what reads wrong; the operator's eye on the
  form and the rendered accounts is the check no test gives. **Source**: BACKLOG 34b; issue
  #15. **Owner**: Operator.
- [ ] **O21. File one registered-office or registered-email change on prod.** Both activities
  are live on submit.diyaccounting.co.uk since prod-4463ec1 (2026-09-07 00:5x UTC), free on the
  `default` bundle, with the live Companies House filing client. A real filing changes a real
  company's register, so this is the operator's own company and sign-in. Tell Claude Code how
  it went; a receipt or an error message is enough. **Source**: BACKLOG 34; issue #15.
  **Owner**: Operator.

## Blocked: operator

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
  **Owner**: Operator.
- [ ] **O17 / B34.7. Automated Companies House sandbox sign-in for the filing suites.** Batch
  9 (6957651c) carries the suites' sandbox sign-in with the authenticator step, off by default:
  `deploy.yml` and `probe-test.yml` run the two filing suites only when the dispatch input
  `runCompaniesHouseSandboxFiling` is `true`, and the run fails fast naming any of the four ci
  environment values that is empty. Companies House has no create-test-user API, so the
  operator registers a throwaway account on
  identity-sandbox.company-information.service.gov.uk with an authenticator second factor and
  puts on the GitHub `ci` environment: the variable `TEST_COMPANIES_HOUSE_USER_ID` (its email)
  and the secrets `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET` (the
  authenticator secret) and `COMPANIES_HOUSE_SANDBOX_API_KEY` (the test application's REST key,
  for creating the run's test company). Then, against a standing ci set:
  `gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-set>
  -f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`
  and the same for `changeRegisteredEmailBehaviour`; the first run's screenshots guide any
  selector fix. **Source**: BACKLOG 34; issue #15. **Owner**: Operator registers and sets the
  values, then Claude Code runs and fixes. **Model**: Sonnet. Blocked on the four values.
## Blocked: Claude Code

- [ ] **B52i. The company P&L and balance sheet on the page.** The company's diya-gl book,
  saved to the DIYA cloud by `../PLAN_FINANCE_AUTOMATION.md` phase 2, derived nightly with the
  Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the five objectives beside
  the last set filed at Companies House. **Source**: BACKLOG 52; plan row D10. **Owner**:
  Claude Code. **Model**: Sonnet. Blocked on the finance plan's phases 1 and 2 (no code yet)
  and on M1 and M3.
- [ ] **B34.6b. Companies House accounts filing: the sandbox proof and the price.** After
  B34.6a and O16: submit the FRS 105 accounts to the XML Gateway test service with the test
  presenter credentials (a GitHub environment secret), read the real acknowledgement and poll
  responses, correct the envelope and iXBRL where the sandbox's own validation differs from
  the public schemas, and record what the sandbox returned in the simulator. With it, the
  `resident-company` bundle: the operator decided on 2026-09-07 that the two register filings
  stay free on `default` and limited-company work is priced when accounts filing lands, so
  this item adds the bundle to the catalogue with accounts filing in it (a Stripe product and
  price through `stripe-catalogue-sync`, the price the operator's). **Source**: BACKLOG 34b;
  issue #15. **Owner**: Claude Code, price from the operator. **Model**: Sonnet. Blocked on
  O16 and B34.6a.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
