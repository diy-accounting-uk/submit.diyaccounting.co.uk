# PLAN: The one-stop dashboard

Status: open, drafted 2026-09-07, reshaped the same evening around objectives, levers and
experiments, then widened to eight objectives with the optimisation and reinvestment loop. No code written.
Backlog row 52; NEXT.md B52a is the first row.

One page the operator opens to see how DIY Accounting is doing against eight objectives, which levers
are being pulled, and how each running experiment is moving its metric. The same data, exported
raw and indexed in this workspace, is what Claude Code and Cowork read to propose the next
experiment. The customer journeys it measures cross three sites: the apex and holding page
(`../root.diyaccounting.co.uk`, and the gateway at `../www.diyaccounting.co.uk`), the
spreadsheets site with the books pages (`../spreadsheets.diyaccounting.co.uk`), and this one.

## User assertions (verbatim)

> one for the one stop shop dashboard I want for DIY Accounting (note that the customer
> journeys should span ../spreadsheets ../root* and this directory) and ultimately I want the
> actual company P&L and balance sheet on there (delivered with ../PLAN_FINANCE_AUTOMATION.md)

> My goals to push up are: uptime, conversations to submissions, conversions to paid, low
> running costs. I would like these general areas displayed in terms of their performance from
> observations and also on the same dashbard if not another axis, I would like to see the levers
> I have to influence those goals. I don't mind a bit of duplication to help with comparison and
> please see what the 2026 observation standards are (I would like to align to something modern
> and recognisable), and I would also like your advise on whether cloudwatch dashboards are the
> best place for this, and I would also like to be able to download the raw data so that it can
> be indexed here for you (Claude code) to access.

> Higher level goal: I want to be able to get enough information to have Claude Code or Cowork
> advise on experiments to work on my goals and I want the dashboards to see how these are
> progressing.

From the notebook page (2026-09-07), numbered as written: 1 revenue (donation, subscription);
2 visitors (human, bot, synthetic) to diya, submit (subscribe, submit) and spreadsheets
(donate, download), with goals; 3 downloads by product over time; 4 submissions by activity
over time; 5 sources over time; 6 alarms over time; 7 AWS cost over time; 8 deployments over
time tagged by branch. Boxed beside them: deep links; an invoicing MCP; trigger an MCP chat
service.

## The two dashboards today

Read from the prod account on 2026-09-07 (`aws cloudwatch get-dashboard`).

**`prod-env-operations`**, built by `ObservabilityStack` per environment, thirteen widgets:
RUM p75 LCP, RUM p75 INP, RUM JS errors, GitHub probe tests, VAT submissions, HMRC
authentications, bundle operations, sign-ups and Cognito auth, bundle grants and cap
enforcement, active bundle allocations, Lambda errors, Lambda throttles, Lambda p95 duration.

- The three "all functions, all deployments" widgets never render. Each is a `SEARCH` over
  every `prod-*` Lambda function; CloudWatch holds about 4,700 `Errors` series under that
  prefix (retired deployments keep their series for fifteen months, and each function has a
  series per alias and version) against a limit of 500 series per widget. About 230 of them are
  canary functions, which the widgets were not meant to show at all.
- Five of the thirteen are business counts, not operations: VAT submissions, HMRC
  authentications, bundle operations, sign-ups, bundle grants. They count Lambda invocations of
  the live deployment, which is a fair proxy on the day and wrong as history, because a deploy
  renames the functions.

**`prod-env-analytics`**, built by `AnalyticsDashboard` from the lake's nightly metrics, eight
widgets: active users, sessions by country, submissions by outcome, login-to-submission
conversion, revenue by product, passes issued and redeemed, HMRC failures by class, and the
GA4-versus-Stripe-versus-events reconciliation.

- Three widgets are empty over two weeks (sessions by country, passes, bundle grants on the
  other board) and the conversion widget reads zero against 22 to 38 daily active users and a
  handful of submissions. Each is either a metric the publisher never emits with that dimension
  or a view whose join finds nothing; B52a checks each one at the source before anything is
  moved.
- Submissions, sign-ups and bundle activity appear on both dashboards from different sources
  (Lambda invocations there, activity events here). That duplication is worth keeping once,
  deliberately, as the reconciliation widget already does for purchases: same quantity, two
  sources, side by side.

## Objectives, observations and levers

The page is organised by the eight objectives, not by data source. Each objective has one headline
observation, its target, the supporting observations that explain it, and the levers the
operator can pull, each with the metric that shows the lever moved. Experiments sit under the
objective they serve.

| Objective | Headline observation (the SLI) | Target (the SLO) | Supporting observations | Levers, each with its own metric |
|---|---|---|---|---|
| Uptime | Availability of the customer journey: probe pass rate over sign-in, obligations, submit on prod | 99.9 % monthly, error budget shown | Golden signals per route (latency p95, request rate, error rate, saturation as throttles); Core Web Vitals p75 (LCP, INP, CLS); alarm count by family; HMRC and Companies House upstream error rate | Deploy frequency and change failure rate (DORA); alarm consolidation (B30); provisioned concurrency; canary coverage of each activity |
| Conversion to submission | Signed-in users who complete a submission within 30 days, by activity | Set from the first month's baseline, then raise | Funnel: visit, sign-in, HMRC or Companies House authorisation, first obligation view, first submission; drop-off per step; HMRC failures by class; synthetic and bot traffic excluded | Landing copy and demo videos (B17); the CSV and books import (row 16, `PLAN_SUBMISSION_MCP.md`); activity gating and free-bundle scope; email nudges after sign-in without a submission |
| Conversion to paid | Paying customers as a share of submitters; revenue per month by product, subscriptions and donations | Set from baseline | Checkout starts and completions; renewals and churn; passes issued and redeemed; donations by channel; downloads by product on spreadsheets as the top of the funnel | Price and bundle catalogue (`stripe-catalogue-sync`); the free-bundle boundary; the donate prompt on the books pages; the resident-company bundle when accounts filing lands |
| Low running cost | Monthly AWS and Google spend, and cost per submission | Steady-state target from the cost plan, cost per submission falling | Cost by service and by environment (FOCUS columns); spare deployment sets standing; canary and alarm spend; Lambda duration and memory | Deployment lifecycle (`destroy-*` workflows); alarm and canary cuts (B30o); scheduled ingestion cadence; log retention; reserved capacity |
| Security | Days since the last unhandled finding above medium, across Security Hub, GuardDuty, CodeQL, Dependabot and secret scanning | Zero open above medium; every finding triaged within a week; the 72-hour breach clock never starts | Vulnerability and lifecycle calendar; global exploits matched to our stack; intrusion signals; rate-limit and WAF blocks; concerning traffic; secrets and access age; backup and restore proof | Dependency updates and runtime upgrades; WAF rules and thresholds; Security Hub standards and AWS Config; alarm coverage of the detection stacks; the pen test (row 27a); backups outside the account (issue #11) |
| Retention | Submitters in a quarter who also submitted the previous quarter, and paying customers renewing | Set from baseline, then raise | Returning submitters by activity; renewals and cancellations by bundle; time from period end to submission; receipts viewed; sign-ins without a submission | Reminder emails before a period end; the obligations and receipts views; the books import so the second return is easier than the first; the renewal price |
| Operator effort | Operator interventions per week: hand-dispatched workflows, console visits, support emails answered, alarm issues a person touched, board items closed by hand | Falling every month; the automation's whole purpose | Interventions by kind; agent hours per landed item; mean time an alarm issue waits for a person; the ratio of Claude Code commits to operator commits | Every automation row on the board; the triage chain; the inbox and board skills; the operator brief |
| Compliance | Open compliance findings across the checks below, and days since the last finding above advisory | Zero open; every monthly HMRC report "correct"; every accessibility run clean | Accessibility (pa11y, axe WCAG 2.1 AA and 2.2 AA from `compliance.yml`); HMRC's monthly fraud-prevention header report (correct, advisories, errors, zero traffic); HMRC production-approval questionnaires kept current; MTD terms-of-use items; Companies House presenter and test-account standing and the XML Gateway package reference; ICO registration and the 72-hour breach clock; privacy commitments; licence and attribution checks | Header fixes; the accessibility fixes; the questionnaires' answers; the presenter account's details; the privacy policy; backlog 22's email-to-parser path |

The company P&L and balance sheet sit above the eight objectives as the outcome they serve.

**Experiments.** An experiment is a row in `experiments.toml` at this repo's root: id, objective,
hypothesis, lever, the metric watched, start, end, the deployment or catalogue change that
began it, and the result once written. The page draws each experiment's start and end as a
vertical annotation on the metric it watches and lists open experiments under their objective. The
file is in git, so it is indexed, and Claude reads the experiment's window against the raw
export to say whether the metric moved. Proposing an experiment is then a chat with the
export, the objective table and this file in context; nothing else is needed for the advice, and
the page shows whether the advice worked.

## Standards to align with

Recognisable in 2026, each mapped to one part of the page:

- **SLIs and SLOs with error budgets, and the four golden signals** (latency, traffic, errors,
  saturation), from Google's SRE practice, for uptime. The probe suites already measure the
  customer journey; the SLI is their pass rate.
- **Core Web Vitals** (LCP, INP, CLS at p75) for page experience. RUM already records p75 LCP
  and INP on submit; CLS and the two sibling sites are the gap.
- **OpenTelemetry semantic conventions** for naming the custom metrics and their attributes.
  The traces, metrics and logs conventions are stable in 2026. The `Submit/Analytics` and
  `Submit/BundleCapacity` metrics keep their namespaces but take OTel names and attribute keys
  (`http.route`, `error.type`, `deployment.environment.name`), so a future move off CloudWatch
  is a re-export, not a rename.
- **DORA's five delivery metrics** (deployment frequency, lead time for changes, change
  failure rate, failed deployment recovery time, deployment rework rate) for the deployments
  panel, computed from the Actions runs and the alarm issues each deploy opens. This is the
  notebook's "deployments by branch" made comparable to anyone else's.
- **FinOps FOCUS** for cost. AWS Data Exports has published FOCUS 1.2 since re:Invent 2025;
  the specification is at 1.3 with 1.4 ratified in June 2026. The cost panel reads a FOCUS
  export rather than the CUR 2.0 the cost instrumentation plan named, so the columns
  (`BilledCost`, `ServiceName`, `Tags`) match the FinOps Framework vocabulary and any tool.
  Cost per submission is the unit-economics figure the framework asks for.
- **GA4 key events and funnels** for the two conversion objectives, with the AARRR stages
  (acquisition, activation, retention, revenue, referral) as the funnel's labels, which is the
  product vocabulary most readers know.

## Where each dashboard lives

**CloudWatch keeps the operations dashboard and nothing else.** It is the right place for
live signals: the alarms, RUM, Lambda and API Gateway metrics are born there, it costs about
$3 a month, and it refreshes in seconds. It is the wrong place for the objectives page: a widget
cannot show a table or a balance sheet, metrics fall off after fifteen months so a year-on-year
line dies, the 500-series limit already breaks three widgets, the console needs a sign-in the
operator does not want to make daily, and nothing on it can be indexed for Claude.

**The objectives page is a private static page on submit, generated nightly from the lake.** The
metrics-publish Lambda that already runs each night writes one snapshot per environment
(`snapshot.json`, plus one CSV per view) to a prefix the site serves behind the operator's own
sign-in, on an activity gated to an `operator` bundle that no customer holds. The page is plain
HTML with the site's chart style, reads the snapshot, draws the objective table, the panels, the
experiment annotations and the deep links. Where a live figure helps (today's probe pass rate,
the current alarm list), the page reads it through the existing API with the operator's token,
so the nightly snapshot and the live value sit side by side.

**GA4 stays in BigQuery; everything else is rolled by hand on the lake.** The operator's
decision of 2026-09-07. The BigQuery export is the source for every visitor, funnel, download
and source panel: scheduled queries in the `diyaccounting-ga4` project write one daily
aggregate table per panel, and the nightly job copies those aggregates into the lake beside
the Athena views, so the page and the raw export read one place. The Data API pull in
`ga4ReportPull.js` stays only until each of its consumers has a BigQuery-fed replacement,
then goes. Looker Studio is not used; the GA4 panels are drawn by the same page code as the
rest.

## Raw data for indexing

Every figure on the page must be readable by Claude without the page. The nightly job writes,
beside the snapshot, one CSV per Athena view and one JSON per objective (observation, target,
supporting metrics, levers, open experiments) to `s3://<lake>/exports/<env>/<date>/`. A pull
script in this repo (`scripts/analytics-pull.sh`, the shape of `drive/pull.sh`) syncs that
prefix to `~/projects/diy-accounting-limited/analytics/<env>/` at the workspace root, and that
tree is added to `index/corpus.toml` as its own source, the way `../PLAN_FINANCE_AUTOMATION.md`
adds `staging`. The pull runs from the operator's SSO session, read-only, and `reindex`
follows it. The FOCUS cost export and the DORA rows land in the same tree. Nothing under
`analytics/` is committed to a repository.

## The security dashboard

A fifth objective with its own panels on the same page, read from the prod account on
2026-09-07.

**What exists.** GuardDuty is on with no findings in its statistics. Security Hub is on with
the CIS AWS Foundations Benchmark 1.2.0 and the AWS Foundational Security Best Practices
subscribed, both `INCOMPLETE` because the account has no AWS Config recorder; its one
critical finding says exactly that, beside one medium and fourteen low. CloudTrail runs as a
single-region trail. `EdgeStack` carries a WAF with the managed rule groups and a rate rule
(2,000 requests per five minutes per IP) with an alarm on it. `SecurityDetectionStack` alarms
on DynamoDB data-event patterns (scan and data theft, issues #9 and #10, closed 2026-09-05)
and `ScanDetectionStack` alarms on one IP raising 404s at rate. On GitHub: CodeQL has 44 open
high alerts, 33 of them `js/clear-text-logging`; Dependabot has none open and 85 fixed;
secret scanning has none. Lambda runs Node 22 and 24; the four canaries run
`syn-nodejs-puppeteer-11.0` on Node 20. The ACM certificate runs to 2027-02-06; the local
development certificate is backlog row 48 (due November 2026). Every environment deploy
rewrites every secret in Secrets Manager, so their change dates carry no rotation age; a
rotation record has to be kept separately.

**Panels.**

| Panel | Shows | Source | Gap |
|---|---|---|---|
| Vulnerabilities | Open CodeQL, Dependabot and secret-scanning alerts by severity and age; Security Hub findings by severity; GuardDuty findings | GitHub API nightly into the lake; Security Hub and GuardDuty findings through EventBridge into the lake | An AWS Config recorder so the standards complete; the CIS benchmark moved from 1.2.0 to 5.0; a nightly GitHub alerts pull |
| Support lifecycle | A calendar: Node LTS and Lambda runtime deprecations, the canary runtime, Java and CDK majors, Playwright, the base image digest age, certificate expiries, the ICO registration renewal, Stripe API version | A `lifecycle.toml` in the repo with each item's end date and the source URL, checked nightly against the AWS deprecation lists and endoflife.date | The file and the check |
| Global stability and exploits | CISA Known Exploited Vulnerabilities matched against the lockfiles and the base image SBOM; AWS Health events for the two accounts; HMRC and Companies House API status; GitHub and npm status | KEV feed nightly; AWS Health API; the upstream status pages | An SBOM from the build (`npm sbom`), the KEV match, the Health pull |
| Intrusion signals | GuardDuty by type; CloudTrail: console sign-ins, root use, IAM and security-group changes, access-key use; Cognito failed sign-ins, password resets and new-device sign-ins by hour; the two detection stacks' alarms | CloudTrail is already in CloudWatch Logs; Cognito through its own CloudTrail events | Metric filters and a view for each; a multi-region trail |
| Rate limits | WAF rate-rule blocks by IP and path; API Gateway throttles by route; Cognito throttles; the WAF managed rule group matches by rule | WAF and API Gateway metrics exist; WAF logs to the lake | WAF logging to S3 into the lake |
| Concerning traffic | 404 scan hits per IP; request spikes per path against a seven-day baseline; geography changes; bot share; credential-stuffing shape on the token routes; HMRC fraud-prevention header validation failures | CloudFront logs in the lake, `ScanDetectionStack`, the HMRC validator feedback | Views and the baseline |
| Secrets and access | Age since each secret's last real rotation; GitHub token ages; the GA4 service-account key age; who holds SSO, GitHub org, Stripe and Google console access | The rotation record; IAM Identity Center; the GitHub org API | The rotation record |
| Data protection | PITR on every table; the cross-account vault's last copy (issue #11); the last restore test; retention TTLs running; the 72-hour breach clock's runbook link | Backup and DynamoDB APIs | The restore test as a scheduled proof |

**Standards to align with, for this objective.** The OWASP Top 10 and ASVS for the application
findings; NIST Cybersecurity Framework 2.0 for the panel headings (identify, protect, detect,
respond, recover); the CIS AWS Foundations Benchmark at its current major in Security Hub;
OpenSSF Scorecard for the repositories and SLSA provenance for the published packages;
CISA's KEV catalogue as the exploit feed. The row is D13.

## Optimisation and the reinvestment loop

The operator's aim, stated 2026-09-07: enough data to have Claude propose experiments,
optimisation across several variables at once, and a feedback loop that reinvests income for
sustained growth and excellence in the other objectives. The operator will buy traffic
(Google Ads) and boost articles to generate data where the organic volume is too small to
measure.

**What is being optimised.** A scalar score over the objectives, each objective's reading
normalised against its target and weighted, subject to constraints (a cash reserve, the
uptime SLO, zero open findings above medium). The levers split into continuous ones (spend
per channel and per week, price, the free-bundle boundary as a number of submissions, Lambda
memory, provisioned concurrency, the WAF rate threshold, the reinvestment fraction) and
discrete ones (a feature on or off, a page variant). The methods differ by lever type.

**The ladder of methods, and where each fits.** Linear algebra was the first rung, not the
whole answer: a least-squares fit is a first-order model of the response, and Newton-Raphson
is what finds the optimum of a second-order one. Each rung below needs more data than the
one before and handles more shape.

1. **Least squares on the export** (first-order). Ranks levers within a block by estimated
   effect per unit cost. Honest for the cost block, which is linear in usage, and for the
   funnels after taking logs. It says which lever to test next, not what its effect is.
2. **Response-surface methods** (second-order). A designed set of experiments over two or
   three continuous levers fits a quadratic; a Newton step on the fitted surface gives the
   next setting; repeat as the surface is refined. This is Newton-Raphson applied where it
   belongs, to a smooth model fitted from noisy runs, not to the noisy data directly.
   Quasi-Newton (BFGS) does the same without forming the Hessian by hand.
3. **Bayesian optimisation** with a Gaussian-process model. The standard in 2026 for noisy,
   expensive experiments over a handful of continuous knobs, because it chooses each next
   experiment by expected improvement and works from a few dozen evaluations. This is the
   rung for price, the bundle boundary and the infrastructure knobs.
4. **Bandits** (Thompson sampling) for allocation. Ad spend across channels, article boosts
   across articles, and page variants are allocation problems, not surface problems: the
   bandit shifts budget towards what pays while it keeps sampling the rest. It runs
   continuously and needs no fitted surface.
5. **Marketing-mix modelling** for spend to revenue. Response to spend saturates and lags
   (adstock), so the recognisable models are Bayesian MMMs with Hill saturation curves,
   which is what Google's Meridian and Meta's Robyn implement as open source. Saturation
   makes the spend objective concave, so once the curves are fitted, gradient methods on
   them are well behaved and the budget split across channels is a constrained convex
   problem with a closed form at the margin: spend until the marginal return per pound is
   equal across channels.
6. **The reinvestment loop as a control problem.** Income in a month sets the next month's
   budget through a reinvestment fraction; budget through the fitted curves sets traffic;
   traffic through the funnels sets submissions and income. That is a discrete-time system
   with a delay (the VAT quarter dominates the lag), and the fraction is the control input.
   The page shows the loop's state (trailing income, reserve, budget, return per pound,
   payback period) and the fraction is a lever with a floor on the reserve. Change it slowly,
   once per cycle, and hold it when the estimated return per pound drops below one; a fast
   controller on a quarterly signal oscillates.

**Making the bought traffic identifiable.** Spend without a design measures nothing. Each
paid test is an experiment row: on-off weeks or geographic splits so the effect has a
control, a holdout for incrementality, and the metric watched named before it starts. The
sources panel then reads per-channel return, and the boosted articles read as a source
each. The Ads accounts were cancelled in 2026 (`google-analytics.toml`), so a new account
with conversion import from GA4's key events is an operator step before the first test.

**What the operator sees.** Under each objective the page lists the open experiments with
their predicted and observed effect, and one line from the optimiser: the next experiment it
would run, the lever, the setting, the expected effect with its interval, and the cost. Claude
reads the same export and the same models when asked for advice, so the page and the advice
agree. Rows D16 and D17.

## Panel by panel

| Panel | Objective | Source today | Gap | Work |
|---|---|---|---|---|
| Availability SLI and error budget | Uptime | Probe results as `behaviour-test` metrics; alarms as GitHub issues | The pass-rate SLI over a month, the budget, alarm state changes into the lake by family | D1, D6 |
| Golden signals and web vitals | Uptime | Operations dashboard, three widgets broken | Narrow the searches to the live deployment; add CLS; RUM on the two sibling sites | B52a, D3 |
| Funnel to submission | Conversion to submission | `v_login_to_submission_funnel`, `v_signup_to_first_submission`, conversion widget reads zero | Verify the views; add the Companies House events; synthetic and bot exclusion; cross-site sessions | B52a, D1, D3, D4 |
| Submissions by activity | Conversion to submission | `v_submissions_daily` counts VAT only | Add the Companies House events, group by activity | D1 |
| Sources | Both conversions | `sessionDefaultChannelGroup` pulled | A view and a panel | D1 |
| Revenue, checkout, renewals | Conversion to paid | `v_revenue_daily` from the Stripe pull | Donations: confirm the Payment Links' account, label by product; PayPal donations from the finance plan; churn from the subscriptions table stream | D2 |
| Downloads by product | Conversion to paid | Event counts by name only | Product parameter from the BigQuery export | D5 |
| Cost and cost per submission | Low running cost | Nothing deployed | FOCUS 1.2 export from the management account into the lake; budgets and the anomaly monitor from the cost plan | D7 |
| DORA delivery metrics | Uptime, cost | SSM pointer only | One lake row per deploy and destroy: name, environment, branch, sha, run id, duration, lead time from the PR; failure and recovery from the alarm issues | D8 |
| Returning submitters and renewals | Retention | Receipts and subscriptions tables, activity events | A view keyed by hashed subject across quarters; renewal and cancellation events from the subscriptions stream | D14 |
| Operator interventions | Operator effort | Actions runs by trigger and actor, issue timelines, the mail mirror, the boards' git history | A nightly pull of runs, issues and commits by actor; a classification of each intervention | D14 |
| Compliance findings | Compliance | `compliance.yml` weekly; HMRC's monthly email and `app/lib/fraudPreventionHeaderReport.js`; the questionnaires in `_developers/reference/` | The accessibility results into the lake; backlog 22's email-to-parser path; a `compliance.toml` for the standing items (questionnaires, presenter account, ICO, terms of use) with a date and an owner each | D15 |
| Experiments | All | none | `experiments.toml`, annotations, the open list per objective | D11 |
| Raw export and index | All | none | The nightly export, the pull script, the corpus source | D12 |
| Deep links | All | none | Every row links to its object | D9 |
| Company P&L and balance sheet | Outcome | none | The company's diya-gl book through the finance plan; nightly derivation with the Ltd engine | D10 |
| Invoicing MCP, chat trigger | Horizon | none | The finance plan's vouchers and invoices as tools on the submission MCP; a button that opens a chat with the export attached | after `PLAN_SUBMISSION_MCP.md` M4 |

## Decisions

1. **The lake is the store; both dashboards and the export are renders of it.** Live signals
   stay in CloudWatch. Everything else reads an Athena view or a metric that exists or is
   added to `AnalyticsStack`. No second pipeline.
2. **Operations in CloudWatch, objectives on the page.** Explained under "Where each dashboard
   lives". The business widgets leave the operations dashboard; one deliberate duplicate per
   quantity stays where two sources measure the same thing.
3. **One GA4 property, one visitor.** The three sites keep their streams in the shared
   property; cross-domain measurement is configured so an apex arrival that subscribes on
   submit is one session with one source. The root holding page moves to the gateway stream.
4. **Synthetic traffic is tagged, not suppressed.** The client sets a GA4 user property and a
   RUM session attribute from the rule `classifyActor` applies on the server; every visitor
   panel splits on it; the SLI counts synthetic runs as the measurement they are.
5. **Targets are set from a month of baseline, then written into the objective table.** Nothing is
   invented before the data exists; the uptime SLO alone starts at 99.9 % because the probes
   already give a month of history.
6. **The company accounts come from the same engine customers use**, through the finance plan
   and `PLAN_SUBMISSION_MCP.md`, never from a spreadsheet read by hand.

## Sequence

Rows are `claude/dash-<n>-<topic>` branches here unless the table names another repo. B52a is
on NEXT.md.

| Row | What | Waits on | Owner, model |
|---|---|---|---|
| B52a | The split: narrow the three broken searches to the live deployment's functions and drop the canaries from them; move the five business widgets off the operations dashboard; find why sessions by country, passes and the conversion widget show nothing; write the objective table's first column as the analytics dashboard's new layout until the page exists | none | Claude Code, Sonnet |
| D1 | Views for submissions by activity, sources, the availability SLI and error budget; the page skeleton, the snapshot writer, the `operator` bundle and activity gate | B52a | Claude Code, Sonnet |
| D2 | Donations and churn: confirm the Stripe account, label the Payment Links' charges; renewals and churn from the subscriptions stream; PayPal donations once the finance plan's pull exists | finance plan phase 1 for PayPal | Claude Code, Sonnet; operator confirms the account |
| D3 | Synthetic tagging in the two `analytics.js` files and the RUM client; RUM and CLS on spreadsheets; the root page's stream id; cross-domain linking and the key events on the property | none; the GA4 changes through backlog row 49's tooling or the Admin API script | Claude Code, Sonnet; three repos |
| D4 | Bot share from CloudFront logs by user-agent class; the visitors panel by human, bot, synthetic | D3 | Claude Code, Sonnet |
| D5 | Downloads by product from the BigQuery export | the export, already on | Claude Code, Sonnet |
| D6 | Alarm state changes into the lake; alarms by family; the error budget burn | D1 | Claude Code, Sonnet |
| D7 | FOCUS 1.2 Data Export from the management account into the lake, tags, budgets, the anomaly monitor; cost per submission | operator's yes for the management-account export | Claude Code, Sonnet; the cost plan is the design, with the export format changed |
| D8 | DORA rows from the deploy and destroy workflows and the alarm issues; the panel | none | Claude Code, Sonnet |
| D9 | Deep links on every row | D1 | Claude Code, Haiku |
| D10 | The company P&L and balance sheet from the company's cloud book | finance plan phase 2; `PLAN_SUBMISSION_MCP.md` M1, M3 | Claude Code, Sonnet |
| D11 | `experiments.toml`, the annotations, the open list; the first experiment written from a baseline month | D1 | Claude Code, Sonnet; the hypothesis is the operator's |
| D12 | The raw export, `scripts/analytics-pull.sh`, the `analytics` corpus source, `reindex` | D1 | Claude Code, Sonnet; the corpus change at the workspace root |
| D13 | The security panels: AWS Config recorder and the CIS 5.0 standard, findings and GitHub alerts into the lake, `lifecycle.toml` and its check, the SBOM and KEV match, the CloudTrail metric filters, WAF logs, the rotation record | D1; the operator's yes for Config and the multi-region trail (an environment deploy) | Claude Code, Sonnet; Opus for the traffic baselines |
| D14 | Retention and operator-effort views: returning submitters by quarter keyed by hashed subject, renewals and cancellations from the subscriptions stream; a nightly pull of Actions runs by trigger and actor, issue timelines and commits by author, classified into interventions | D1 | Claude Code, Sonnet |
| D15 | The compliance panel: accessibility results from `compliance.yml` into the lake; backlog 22's path from HMRC's monthly email to `fraudPreventionHeaderReport.js` and the result into the lake; `compliance.toml` for the standing items with dates and owners | D1; `PLAN_FRAUD_HEADER_EMAIL_CHECK.md` | Claude Code, Sonnet |
| D16 | The optimiser: a notebook over the raw export that computes the per-block correlations, fits the block models (linear cost, log-linear funnels, Hill curves for spend), ranks levers by effect per unit cost, and proposes the next experiment with its predicted effect; Bayesian optimisation for the continuous knobs and a bandit for allocations once experiments exist | D12; three months of export | Claude Code, Opus for the models, Sonnet for the notebook |
| D17 | The reinvestment loop: trailing income, reserve, budget, return per pound and payback on the page; the reinvestment fraction as a lever with a reserve floor; paid-traffic experiments as rows with on-off or geographic controls; the Ads account with GA4 conversion import | D2, D16; the operator opens the Ads account and sets the reserve floor | Claude Code, Sonnet; the operator's decisions |

## B52d design

Five Athena views and three writers. Each view is one `.sql` file under
`infra/main/resources/analytics/views/`, one `ViewDefinition` in `BusinessViews.VIEWS`, one
`CfnNamedQuery` and one `CREATE OR REPLACE VIEW` custom resource, exactly as the ten existing
views work. Three of the five read tables that do not exist yet, so the writers come first.

### The three new sources

| Source | Writer | S3 prefix under the lake | Glue table |
|---|---|---|---|
| CloudWatch alarm state changes | EventBridge rule to a Firehose stream | `curated/alarm-state-changes/year=/month=/day=/` | `alarm_state_changes` |
| Deploy and destroy runs | a workflow step | `curated/dora/dt=<date>/<run-id>-<attempt>.json` | `dora_runs` |
| Probe runs | the same workflow step | `curated/probe/dt=<date>/<run-id>-<suite>.json` | `probe_runs` |

Everything lands under `curated/`, so the lake's `age-curated` and `expire-curated` lifecycle
rules cover the new prefixes unchanged. The paths carry no `env=` key, because ci and prod have
separate accounts and separate lake buckets; the environment is a column instead.

#### The alarm writer

New construct `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AlarmStateChangeDelivery.java`,
built by `AnalyticsStack` beside `TableChangeDelivery` and modelled on it.

**Rule.** A `Rule` on the default bus, id `AlarmToLakeRule`, name `{env}-env-alarm-to-lake`,
source `aws.cloudwatch`, detail type `CloudWatch Alarm State Change`, `detail.alarmName` matched
on the single prefix `{envName}-`. One rule per environment, not per deployment: `OpsStack`'s
`AlarmStateChangeRule` is built once per live deployment and two of its prefixes overlap, so
copying that shape would double every environment-scoped row while two sets are up. The
`{envName}-` prefix covers `{env}-env-` and `{env}-<slug>-app-` alike and excludes the `check-`
alarms, matching what `alarmToGithubIssue.js` already sees.

**Stream.** A `CfnDeliveryStream`, `DirectPut`, named
`sharedNames.alarmStateChangeDeliveryStreamName` = `{env}-env-alarm-state-changes`, log group from
`sharedNames.deliveryStreamLogGroupName(...)`, prefix
`curated/alarm-state-changes/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/`,
error prefix `errors/alarm-state-changes/...`, buffering 900 s and 128 MiB, Parquet with Snappy
and a `schemaConfiguration` on the Glue table. The rule targets it with `FirehoseDeliveryStream`,
as `ActivityToLakeRule` does.

**Transform.** `app/functions/analytics/alarmStateChangeTransform.js`, a Firehose processor built
like `activityEventTransform.js`, function name `{env}-env-alarm-state-change-transform`, handler
`app/functions/analytics/alarmStateChangeTransform.handler`. EventBridge delivers the envelope
with no trailing newline and ISO-8601 timestamps, and the JSON SerDe takes neither, so the
transform reuses `toParquetTimestamp` and writes one flat row per line. It flattens the fields
`resolveAlarmDetail` in `alarmToGithubIssue.js` already names, and imports `alarmFamilyKey` and
`alarmDeploymentSlug` from `app/lib/alarmName.js` so one definition of a family serves the issue
chain and the lake.

**Columns** for `alarm_state_changes`, partition projection on `year`/`month`/`day` over
2026–2035, the shape `TableChangeDelivery.buildGlueTable` uses: `event_id string`,
`event_ts timestamp` (from `detail.state.timestamp`), `ingest_ts timestamp`, `alarm_name string`,
`alarm_arn string` (`resources[0]`), `family string`, `deployment_slug string`, `state string`,
`previous_state string`, `reason string`, `region string`, `namespace string`,
`metric_name string`, `period_seconds bigint`, `threshold double` (from the parsed
`state.reasonData`), `env string`, `detail_json string`.

**Tests.** `app/unit-tests/analytics/alarmStateChangeTransform.test.js`: a real alarm state
change envelope flattens to the declared columns, `family` drops the deployment slug, and a
record that will not parse comes back `ProcessingFailed`. `AlarmStateChangeDeliveryTest.java`,
shaped like `TableChangeDeliveryTest`: one rule carrying the `aws.cloudwatch` pattern and the
`{envName}-` prefix, one delivery stream writing the curated prefix with Parquet conversion, and
one Glue table with the columns above.

#### The DORA and probe writer

One composite action, `.github/actions/put-lake-row/action.yml`, with inputs `bucket`, `key` and
`row`. It pipes the JSON string to `aws s3 cp - s3://<bucket>/<key>`. The bucket,
`{env}-env-analytics-lake-<account>`, is an input the caller resolves from the `names` job.

Credentials are the two-hop OIDC every job already uses: `vars.SUBMIT_ACTIONS_ROLE_ARN`
(`github-actions-role`), then `vars.SUBMIT_DEPLOY_ROLE_ARN` (`github-deploy-role`), both created
by `infra/aws-accounts/setup-oidc-roles.sh`. `github-deploy-role` carries `AdministratorAccess`
and the lake bucket policy denies only non-TLS traffic, so this writes with no policy change. If
that role is scoped down later, keep `s3:PutObject` on
`arn:aws:s3:::{env}-env-analytics-lake-*/curated/dora/*` and `.../curated/probe/*`.

**Callers.** `deploy.yml` gains a final job `record-dora` with `if: always()`, needing `names`,
`deploy-publish`, `set-origins` and the `web-test` fan-in. `destroy-ci.yml` and `destroy-prod.yml`
gain the same step at the end of `destroy`, also `if: always()`. `probe-test.yml` writes one probe
row per suite in `publish-cloudwatch-metric`, beside the existing `put-metric-data` call.

**The DORA row**, one JSON object per file at `curated/dora/dt=<YYYY-MM-DD>/<run-id>-<attempt>.json`:

| Column | Source |
|---|---|
| `workflow` | `github.workflow`: `deploy`, `destroy-ci`, `destroy-prod` |
| `environment`, `deployment` | `needs.names.outputs.environment-name`, `.deployment-name` |
| `branch`, `sha` | `github.ref_name`, `github.sha` |
| `run_id`, `run_attempt`, `run_number`, `actor`, `trigger` | the matching `github.*` contexts, with `event_name` as `trigger` |
| `started_at` | `gh api repos/${{ github.repository }}/actions/runs/${{ github.run_id }} --jq .run_started_at` |
| `finished_at`, `duration_seconds` | `date -u +%FT%TZ` in the step, and the difference from `started_at` |
| `conclusion` | `success` when every needed job's `result` is `success`, else `failure` |
| `merged_at` | `gh api repos/${{ github.repository }}/commits/${{ github.sha }}/pulls --jq '.[0].merged_at'` |
| `lead_time_seconds` | `finished_at` minus `merged_at`; both null for a push with no pull request |

Change failure rate and time to restore are not columns. They come from joining these rows to the
`[ALARM]` issues the triage chain opens, on environment and time, which is D14's nightly pull.

**The probe row** at `curated/probe/dt=<date>/<run-id>-<suite>.json`: `environment`,
`deployment`, `suite`, `run_id`, `run_attempt`, `finished_at`, `duration_seconds`, `trigger` and
`passed`, the same `needs.behaviour-test.result == 'success'` the CloudWatch metric already reads.
The `behaviour-test` metric in the apex-domain namespace stays as it is; the row is what Athena
can read, and one step writes both, so they agree.

**Glue tables.** New construct `.../stacks/analytics/WorkflowRunTables.java`, built by
`AnalyticsStack` and modelled line for line on `Ga4Tables`: two `CfnTable`s, `dora_runs` and
`probe_runs`, `classification=json`, one `dt` partition-projection column (`date`, `yyyy-MM-dd`,
range `2026-01-01,NOW`, one-day interval) and a `storage.location.template` of
`s3://<lake>/curated/{dora,probe}/dt=${dt}/`. Test `WorkflowRunTablesTest.java`, shaped like
`Ga4TablesTest`.

### The five views

Every view reads a catalogue table, never a raw source, and each is added to `BusinessViews.VIEWS`
with its `readTables` so the shared IAM grant covers it. `AnalyticsStack` adds the dependency edges
in `businessViews.viewResources.forEach`: the alarm table for view 4, `WorkflowRunTables` for 3 and 5.

**1. `v_submissions_by_activity_daily`** — source `activity_events_all`, partitioned
year/month/day by projection over `curated/activity-events/`.

```sql
CREATE OR REPLACE VIEW v_submissions_by_activity_daily AS
SELECT day, activity, outcome,
       count(*)                   AS completions,
       count(DISTINCT hashed_sub) AS customers
FROM  (SELECT date(event_ts) AS day, hashed_sub,
              coalesce(outcome, 'success') AS outcome,
              CASE event
                WHEN 'vat-return-submitted'                            THEN 'vat-return'
                WHEN 'vat-return-failed'                               THEN 'vat-return'
                WHEN 'itsa-self-employment-period-created'             THEN 'itsa-period'
                WHEN 'companies-house-accounts-submitted'              THEN 'ch-accounts'
                WHEN 'companies-house-accounts-accepted'               THEN 'ch-accounts'
                WHEN 'companies-house-accounts-failed'                 THEN 'ch-accounts'
                WHEN 'companies-house-registered-office-address-filed' THEN 'ch-registered-office'
                WHEN 'companies-house-registered-email-address-filed'  THEN 'ch-registered-email'
                WHEN 'company-profile-viewed'                          THEN 'company-lookup'
              END AS activity
       FROM   activity_events_all
       WHERE  actor = 'customer')
WHERE  activity IS NOT NULL
GROUP  BY 1, 2, 3
```

Panel: a `GraphWidget` titled "Completions by Activity" on a new `CompletionsByActivity` metric,
`dimension: {name: "Activity", column: "activity"}`, summing `completions` over outcomes.
`v_submissions_daily` stays: it answers the VAT-only question and three metrics already read it.

**2. `v_traffic_sources_daily`** — source `ga4_traffic` (`dt` projection over
`curated/ga4/report=traffic/`), which already carries `sessionDefaultChannelGroup`.

```sql
CREATE OR REPLACE VIEW v_traffic_sources_daily AS
SELECT date(parse_datetime(date, 'yyyyMMdd')) AS day,
       coalesce(sessionDefaultChannelGroup, 'unassigned') AS channel,
       sum(sessions)        AS sessions,
       sum(newUsers)        AS new_users,
       sum(engagedSessions) AS engaged_sessions,
       if(sum(sessions) = 0, NULL,
          cast(sum(engagedSessions) AS double) / sum(sessions)) AS engagement_rate
FROM   ga4_traffic
GROUP  BY 1, 2
```

Panel: "Sessions by Channel", metric `SessionsByChannel` dimensioned `Channel`. The GA4 pull
writes `date` as `yyyyMMdd`; check one row of `curated/ga4/report=traffic/` before trusting that.

**3. `v_availability_sli_daily`** — source `probe_runs`.

```sql
CREATE OR REPLACE VIEW v_availability_sli_daily AS
SELECT date(from_iso8601_timestamp(finished_at)) AS day,
       suite,
       count(*)                                     AS runs,
       count_if(passed)                             AS passes,
       cast(count_if(passed) AS double) / count(*)  AS pass_rate,
       count(*) - count_if(passed)                  AS failed_runs,
       0.001 * count(*)                             AS budget_runs,
       (0.001 * count(*)) - (count(*) - count_if(passed)) AS budget_remaining_runs
FROM   probe_runs
GROUP  BY 1, 2
```

The 99.9 % target comes from the plan's decision 5 and sits in the SQL as `0.001`. The budget is
counted in probe runs, the resolution the measurement has: the scheduled probe runs two suites
every four hours, so a month holds about 360 runs per suite and one failure spends more than a
month's budget. Finer resolution comes from raising the probe cadence in the workflow's cron.
Panels: "Availability SLI" (a `SingleValueWidget` on `ProbePassRate`, dimensioned `Suite`) and
"Error Budget Remaining" (a `GraphWidget` on `ErrorBudgetRemaining`, same dimension).

**4. `v_alarm_state_changes_daily`** — source `alarm_state_changes`.

```sql
CREATE OR REPLACE VIEW v_alarm_state_changes_daily AS
SELECT date(event_ts) AS day,
       family,
       env,
       count_if(state = 'ALARM' AND previous_state <> 'ALARM') AS times_fired,
       count_if(state = 'OK'    AND previous_state =  'ALARM') AS times_cleared,
       count(DISTINCT alarm_name)                              AS alarms_in_family,
       max(event_ts)                                           AS last_change_ts
FROM   alarm_state_changes
GROUP  BY 1, 2, 3
```

Panel: "Alarms Fired by Family", metric `AlarmsFired` dimensioned `Family`. Minutes in alarm need
each ALARM paired with its next OK, a window function over the same table; that belongs with D6's
burn chart, not here.

**5. `v_dora_runs_daily`** — source `dora_runs`.

```sql
CREATE OR REPLACE VIEW v_dora_runs_daily AS
SELECT date(from_iso8601_timestamp(finished_at)) AS day,
       workflow,
       environment,
       count(*)                                          AS runs,
       count_if(conclusion = 'success')                  AS successes,
       approx_percentile(duration_seconds, 0.5)          AS median_duration_seconds,
       approx_percentile(lead_time_seconds, 0.5)         AS median_lead_time_seconds,
       cast(count_if(conclusion <> 'success') AS double) / count(*) AS failure_rate
FROM   dora_runs
GROUP  BY 1, 2, 3
```

Panels: "Deployment Frequency" (`Deploys`, dimensioned `Environment`), "Lead Time for Changes"
(`DeployLeadTimeHours`) and "Deploy Failure Rate" (`DeployFailureRate`). The row keeps `branch`,
`sha`, `run_id` and `actor` for the deep links D9 adds.

### Verifying each view

**In CDK.** `BusinessViewsTest` already asserts one named query and one custom resource per view,
one singleton provider, and that every declared name appears in a `CREATE OR REPLACE VIEW`
statement exactly once. Raising `VIEW_COUNT` to 15 and adding the five names to
`expectedViewNames` is the whole change; a missing `.sql` file fails the synth in `loadResourceText`.

**In the nightly run.** Every view gets a `METRIC_DEFINITIONS` entry in
`analyticsMetricsPublish.js`, so an Athena error stops the run and a day with no rows leaves a
visible gap on the widget. That takes the count from 23 metrics to 31, about $2.40 a month more.

**Emptiness.** `DataQuality` runs one DQDL ruleset over `activity_events` today, named in the
runner Lambda's `GLUE_DATA_QUALITY_*` environment variables. Widen it to a list: the construct
takes a target per table and the Lambda reads one `GLUE_DATA_QUALITY_TARGETS` JSON array of
`{table, ruleset, curatedPrefix}`, starting an evaluation run per entry. Two new rulesets,
`{env}_env_alarm_state_changes_dq` and `{env}_env_dora_runs_dq`, each carry `RowCount > 0`,
`IsComplete` on the timestamp column, and for alarms `ColumnValues "state" in
["ALARM","OK","INSUFFICIENT_DATA"]`. `{prefix}-data-quality-rules-failed` is dimensioned by
ruleset name, so the same loop builds one alarm per target and `DataQualityTest` asserts three.

## Verification

- Each panel's figure for one day is reproduced by hand from its source: a GA4 explore, the
  Stripe dashboard, the GitHub issues list, Cost Explorer, the Actions run list.
- The three operations widgets render, and no canary appears in them.
- A probe run against prod appears in the visitors panel as synthetic and in no other class,
  and counts in the availability SLI.
- A visit that starts on the apex and subscribes on submit is one GA4 session with the apex's
  source.
- `corpus-loom` answers "what was the submission conversion in the week of an experiment's
  start" from the pulled export alone.
- The company balance sheet on the page equals the Ltd engine's published balance sheet for
  the same book, and its prior-year column equals the last set filed at Companies House.
- The optimiser's proposed experiment, once run, lands inside the interval it predicted more
  often than not over a quarter; a proposal that keeps missing is a model to refit, not a
  lever to keep pulling.
- A paid-traffic week shows in the sources panel as its own source with a control week
  beside it.
- The page is reachable signed in as the operator and returns the site's normal denial to any
  other user and to the synthetic users.

## Dependencies outside this repository

| Dependency | Where | State |
|---|---|---|
| Downloads, donations and books events, `analytics.js` and RUM on the spreadsheets site | `../spreadsheets.diyaccounting.co.uk` | Events exist; tagging and RUM are D3 |
| The root holding page's GA4 stream id | `../root.diyaccounting.co.uk` | One-line change, D3 |
| Cross-domain linking and key events on GA4 property 523400333 | Google Analytics Admin; backlog row 49 wants this as code | Operator or the Admin API script |
| The BigQuery export and its scheduled queries | `diyaccounting-ga4` project; the GA4 service account in Secrets Manager | Export on; queries are D5 |
| FOCUS 1.2 Data Export from the management account | AWS management account 887764105431 | Designed as CUR 2.0 in the cost plan, not applied; format changes to FOCUS |
| The `analytics` corpus source | `../index/corpus.toml` at the workspace root | D12 |
| The company's diya-gl book | `../PLAN_FINANCE_AUTOMATION.md` phases 1 and 2 | Drafted 2026-08-31, no code |
| The Ltd engine as a published package | spreadsheets board H7 | Ready to start |
| Which Stripe account holds the donation Payment Links | Stripe dashboard | Operator confirms |
| A Google Ads account with GA4 conversion import, and the article-boost channels | Google Ads; the publishing platforms | Operator opens; both earlier Ads accounts were cancelled |
| HMRC's monthly fraud-prevention header email reaching the parser | `PLAN_FRAUD_HEADER_EMAIL_CHECK.md`, backlog 22 | Parser built; the path is that plan's open work |

## Distance

The uptime objective is closest: the probes, RUM and alarms exist, and B52a plus D1 and D6 turn
them into an SLI with a budget. The two conversion objectives have their funnel views built and
apparently broken (the zero), so B52a's check decides whether that is a day's fix or a
rebuild; the cross-site and synthetic work (D3, D4) is small and spread over three repos. Cost
is one export away once the operator says yes on the management account. Experiments and the
raw export (D11, D12) are new but small, and they are what turns the page from a report into
the loop the operator asked for: data Claude can read, a hypothesis in a file, and a line that
shows whether it moved. The company accounts remain the far end, waiting on the finance plan.

## Related work and its disposition

Swept on 2026-09-07 across this repo's plans, boards and open issues.

| Item | Relation to this plan | Disposition |
|---|---|---|
| `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md`, NEXT.md B30o | The alarms panel reads the same state-change events; the triage chain's anonymised comments are the deep link | Keep; B30o proves the chain, D6 lands the events in the lake |
| `PLAN_ALARM_TEARDOWN.md`, BACKLOG 30a (re-run the audit, due 2026-09-13) | Alarm and canary cuts are the running-cost lever; the audit's counts are the baseline | Keep; the audit becomes a nightly view under D6 |
| `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` | Chaos checks that each alarm fires; the uptime SLI depends on the alarms being true | Keep as reference; not scheduled |
| BACKLOG 47, NEXT.md B47a, issue #43 | The scheduled workflows feed the DORA and drift panels; #43 closes on a green scheduled drift run | Keep; B47a |
| BACKLOG 39, NEXT.md B39.1, issue #13 (multi-URL Lighthouse) | Web vitals for the sibling sites, which the uptime objective wants at p75 | Keep; D3 takes the RUM half, Lighthouse stays the lab measure |
| BACKLOG 43 | The monthly bill check against the cost plan's target | Keep; the cost panel (D7) replaces the hand check once FOCUS lands |
| BACKLOG 49 | GA4 property changes as code; D3's cross-domain and key-event changes go through it or the Admin API script | Keep |
| BACKLOG 27a (pen test), 46 (corpus credentials), 48 (certbot) , issue #11 (backups outside the account) | Security panels: lifecycle, secrets, data protection | Keep; each feeds a row of the security table |
| `PLAN_FRAUD_HEADER_EMAIL_CHECK.md`, BACKLOG 22 | The compliance panel's HMRC header report is that plan's parser with its email path built | Keep; D15 |
| Issue #18 (alerting in Slack with agents raising issues) | The alarm-to-issue chain delivered the issue half; Slack was not chosen | Operator's call: close, or re-scope to the alarms panel |
| `_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md` | Phases 0 to 3 delivered in January 2026; phase 4's ideas are the security panels | Archived 2026-09-07 |
| `_developers/backlog/SLACK_INTEGRATION_PLAN.md` | Superseded by the alarm-to-issue chain | Archived 2026-09-07 |
| `_developers/backlog/PLAN_MCP_SERVER.md` | Superseded by `PLAN_SUBMISSION_MCP.md` | Archived 2026-09-07 |
| `_developers/backlog/METRIC_SON_DESIGN.md` | A second presentation of the same metrics | Keep as a horizon |
| `_developers/archive/PLAN_USAGE_DATA_PIPELINE.md`, `PLAN_SCHEDULED_INGESTION.md`, `PLAN_GA4.md`, `PLAN_COST_INSTRUMENTATION.md`, `PLAN_COST_OPTIMISATION.md`, `PLAN_ALARM_CONSOLIDATION.md`, `PLAN_SYNTHETIC_NAMING_ALIGNMENT.md` | The delivered designs this plan builds on | Reference only |

## Related

- `_developers/archive/PLAN_USAGE_DATA_PIPELINE.md`, `_developers/archive/PLAN_GA4.md`,
  `_developers/archive/PLAN_COST_INSTRUMENTATION.md`, `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md`
- `.claude/skills/board/SKILL.md` renders the work board; this page renders the business.
- `_developers/backlog/METRIC_SON_DESIGN.md` can sit on the page as a second presentation of
  the same metrics.
- `../PLAN_FINANCE_AUTOMATION.md`, `PLAN_SUBMISSION_MCP.md`
- Standards: Google SRE workbook (SLOs, golden signals); web.dev Core Web Vitals;
  opentelemetry.io semantic conventions; dora.dev; focus.finops.org (specification 1.3, 1.4);
  GA4 key events.
