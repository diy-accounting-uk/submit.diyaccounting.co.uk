# PLAN: The one-stop dashboard

Status: open, drafted 2026-09-07, reshaped the same evening around goals, levers and
experiments. No code written. Backlog row 52; NEXT.md B52a is the first row.

One page the operator opens to see how DIY Accounting is doing against four goals, which levers
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

## Goals, observations and levers

The page is organised by the four goals, not by data source. Each goal has one headline
observation, its target, the supporting observations that explain it, and the levers the
operator can pull, each with the metric that shows the lever moved. Experiments sit under the
goal they serve.

| Goal | Headline observation (the SLI) | Target (the SLO) | Supporting observations | Levers, each with its own metric |
|---|---|---|---|---|
| Uptime | Availability of the customer journey: probe pass rate over sign-in, obligations, submit on prod | 99.9 % monthly, error budget shown | Golden signals per route (latency p95, request rate, error rate, saturation as throttles); Core Web Vitals p75 (LCP, INP, CLS); alarm count by family; HMRC and Companies House upstream error rate | Deploy frequency and change failure rate (DORA); alarm consolidation (B30); provisioned concurrency; canary coverage of each activity |
| Conversion to submission | Signed-in users who complete a submission within 30 days, by activity | Set from the first month's baseline, then raise | Funnel: visit, sign-in, HMRC or Companies House authorisation, first obligation view, first submission; drop-off per step; HMRC failures by class; synthetic and bot traffic excluded | Landing copy and demo videos (B17); the CSV and books import (row 16, `PLAN_SUBMISSION_MCP.md`); activity gating and free-bundle scope; email nudges after sign-in without a submission |
| Conversion to paid | Paying customers as a share of submitters; revenue per month by product, subscriptions and donations | Set from baseline | Checkout starts and completions; renewals and churn; passes issued and redeemed; donations by channel; downloads by product on spreadsheets as the top of the funnel | Price and bundle catalogue (`stripe-catalogue-sync`); the free-bundle boundary; the donate prompt on the books pages; the resident-company bundle when accounts filing lands |
| Low running cost | Monthly AWS and Google spend, and cost per submission | Steady-state target from the cost plan, cost per submission falling | Cost by service and by environment (FOCUS columns); spare deployment sets standing; canary and alarm spend; Lambda duration and memory | Deployment lifecycle (`destroy-*` workflows); alarm and canary cuts (B30o); scheduled ingestion cadence; log retention; reserved capacity |

The company P&L and balance sheet sit above the four goals as the outcome they serve.

**Experiments.** An experiment is a row in `experiments.toml` at this repo's root: id, goal,
hypothesis, lever, the metric watched, start, end, the deployment or catalogue change that
began it, and the result once written. The page draws each experiment's start and end as a
vertical annotation on the metric it watches and lists open experiments under their goal. The
file is in git, so it is indexed, and Claude reads the experiment's window against the raw
export to say whether the metric moved. Proposing an experiment is then a chat with the
export, the goal table and this file in context; nothing else is needed for the advice, and
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
- **GA4 key events and funnels** for the two conversion goals, with the AARRR stages
  (acquisition, activation, retention, revenue, referral) as the funnel's labels, which is the
  product vocabulary most readers know.

## Where each dashboard lives

**CloudWatch keeps the operations dashboard and nothing else.** It is the right place for
live signals: the alarms, RUM, Lambda and API Gateway metrics are born there, it costs about
$3 a month, and it refreshes in seconds. It is the wrong place for the goals page: a widget
cannot show a table or a balance sheet, metrics fall off after fifteen months so a year-on-year
line dies, the 500-series limit already breaks three widgets, the console needs a sign-in the
operator does not want to make daily, and nothing on it can be indexed for Claude.

**The goals page is a private static page on submit, generated nightly from the lake.** The
metrics-publish Lambda that already runs each night writes one snapshot per environment
(`snapshot.json`, plus one CSV per view) to a prefix the site serves behind the operator's own
sign-in, on an activity gated to an `operator` bundle that no customer holds. The page is plain
HTML with the site's chart style, reads the snapshot, draws the goal table, the panels, the
experiment annotations and the deep links. Where a live figure helps (today's probe pass rate,
the current alarm list), the page reads it through the existing API with the operator's token,
so the nightly snapshot and the live value sit side by side.

**Looker Studio over BigQuery was the alternative and is not chosen.** It renders the GA4 half
with no code and with Google's own funnel and attribution widgets, which is real value for the
two conversion goals. It cannot show Stripe, alarms, cost, deployments, experiments or the
accounts unless each is copied into BigQuery too, which doubles the pipeline, and it lives in a
Google console with its own sign-in. The choice can be revisited if the GA4 panels prove
awkward to draw by hand; the BigQuery export is on either way, and a Looker report over it can
be added beside the page at any time without changing the plan.

## Raw data for indexing

Every figure on the page must be readable by Claude without the page. The nightly job writes,
beside the snapshot, one CSV per Athena view and one JSON per goal (observation, target,
supporting metrics, levers, open experiments) to `s3://<lake>/exports/<env>/<date>/`. A pull
script in this repo (`scripts/analytics-pull.sh`, the shape of `drive/pull.sh`) syncs that
prefix to `~/projects/diy-accounting-limited/analytics/<env>/` at the workspace root, and that
tree is added to `index/corpus.toml` as its own source, the way `../PLAN_FINANCE_AUTOMATION.md`
adds `staging`. The pull runs from the operator's SSO session, read-only, and `reindex`
follows it. The FOCUS cost export and the DORA rows land in the same tree. Nothing under
`analytics/` is committed to a repository.

## Panel by panel

| Panel | Goal | Source today | Gap | Work |
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
| Experiments | All | none | `experiments.toml`, annotations, the open list per goal | D11 |
| Raw export and index | All | none | The nightly export, the pull script, the corpus source | D12 |
| Deep links | All | none | Every row links to its object | D9 |
| Company P&L and balance sheet | Outcome | none | The company's diya-gl book through the finance plan; nightly derivation with the Ltd engine | D10 |
| Invoicing MCP, chat trigger | Horizon | none | The finance plan's vouchers and invoices as tools on the submission MCP; a button that opens a chat with the export attached | after `PLAN_SUBMISSION_MCP.md` M4 |

## Decisions

1. **The lake is the store; both dashboards and the export are renders of it.** Live signals
   stay in CloudWatch. Everything else reads an Athena view or a metric that exists or is
   added to `AnalyticsStack`. No second pipeline.
2. **Operations in CloudWatch, goals on the page.** Explained under "Where each dashboard
   lives". The business widgets leave the operations dashboard; one deliberate duplicate per
   quantity stays where two sources measure the same thing.
3. **One GA4 property, one visitor.** The three sites keep their streams in the shared
   property; cross-domain measurement is configured so an apex arrival that subscribes on
   submit is one session with one source. The root holding page moves to the gateway stream.
4. **Synthetic traffic is tagged, not suppressed.** The client sets a GA4 user property and a
   RUM session attribute from the rule `classifyActor` applies on the server; every visitor
   panel splits on it; the SLI counts synthetic runs as the measurement they are.
5. **Targets are set from a month of baseline, then written into the goal table.** Nothing is
   invented before the data exists; the uptime SLO alone starts at 99.9 % because the probes
   already give a month of history.
6. **The company accounts come from the same engine customers use**, through the finance plan
   and `PLAN_SUBMISSION_MCP.md`, never from a spreadsheet read by hand.

## Sequence

Rows are `claude/dash-<n>-<topic>` branches here unless the table names another repo. B52a is
on NEXT.md.

| Row | What | Waits on | Owner, model |
|---|---|---|---|
| B52a | The split: narrow the three broken searches to the live deployment's functions and drop the canaries from them; move the five business widgets off the operations dashboard; find why sessions by country, passes and the conversion widget show nothing; write the goal table's first column as the analytics dashboard's new layout until the page exists | none | Claude Code, Sonnet |
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

## Distance

The uptime goal is closest: the probes, RUM and alarms exist, and B52a plus D1 and D6 turn
them into an SLI with a budget. The two conversion goals have their funnel views built and
apparently broken (the zero), so B52a's check decides whether that is a day's fix or a
rebuild; the cross-site and synthetic work (D3, D4) is small and spread over three repos. Cost
is one export away once the operator says yes on the management account. Experiments and the
raw export (D11, D12) are new but small, and they are what turns the page from a report into
the loop the operator asked for: data Claude can read, a hypothesis in a file, and a line that
shows whether it moved. The company accounts remain the far end, waiting on the finance plan.

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
