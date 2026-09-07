# PLAN: The one-stop dashboard

Status: open, drafted 2026-09-07. No code written. Backlog row 52.

One page the operator opens to see how DIY Accounting is doing: money in, who is visiting and
what they do, what gets downloaded and filed, what is alarming, what AWS costs, what is
deployed, and in the end the company's own P&L and balance sheet. The customer journeys it
measures cross three sites: the apex and holding page (`../root.diyaccounting.co.uk`, and the
gateway at `../www.diyaccounting.co.uk`), the spreadsheets site with the books pages
(`../spreadsheets.diyaccounting.co.uk`), and this one.

## User assertions (verbatim)

> one for the one stop shop dashboard I want for DIY Accounting (note that the customer
> journeys should span ../spreadsheets ../root* and this directory) and ultimately I want the
> actual company P&L and balance sheet on there (delivered with ../PLAN_FINANCE_AUTOMATION.md)

From the notebook page (2026-09-07), numbered as written:

1. Revenue: donation, subscription
2. Visitors: human + bot + synthetics, to diya, submit (subscribe, submit) and spreadsheets
   (donate, download), with goals
3. Downloads by product / time
4. Submissions by activity / time
5. Sources / time
6. Alarms / time
7. AWS cost / time
8. Deployments / time, tagged by branch

Boxed beside them: deep links; an invoicing MCP; trigger an MCP chat service.

## Where we stand

More of this exists than the ask suggests. `_developers/archive/PLAN_USAGE_DATA_PIPELINE.md`
shipped an analytics lake and a dashboard, and the code confirms it:

- **`AnalyticsStack`** (`{env}-env-AnalyticsStack`): a lake bucket, Glue tables, Firehose from
  the activity event bus and four DynamoDB streams, eleven Athena views under
  `infra/main/resources/analytics/views/`, a nightly `analyticsMetricsPublish` Lambda that
  turns the views into 23 CloudWatch metrics in `Submit/Analytics`, and the CloudWatch dashboard
  `{env}-analytics` built by `stacks/analytics/AnalyticsDashboard.java`: active users, sessions
  by country, submissions by outcome, login-to-submission conversion, revenue by product, passes
  issued and redeemed, HMRC failures by class, and a GA4-versus-Stripe-versus-events
  reconciliation widget.
- **`IngestionStack`**: nightly pulls of GA4 through the Data API (`ga4ReportPull.js`), Stripe
  balance transactions and charges (`stripeReconcile.js`), and CloudFront access logs.
- **GA4 is one property for all three sites.** "DIY Accounting" (523400333) carries the
  gateway, spreadsheets and submit streams (`google-analytics.toml`), with daily and streaming
  export to BigQuery in the `diyaccounting-ga4` project. The nightly pull reads that property
  with `hostName`, `pagePath`, `eventName` and `sessionDefaultChannelGroup` dimensions, so
  gateway and spreadsheets pageviews and event counts already land in the lake. The root
  holding page fires the submit stream's measurement id rather than the gateway's.
- **Actor classification exists server-side.** `app/lib/activityAlert.js` marks every activity
  event `customer`, `test-user`, `probe` or `system` from the email domain and the `test_`
  request-id prefix, and the views filter on it. Nothing marks synthetic traffic in GA4 or RUM.
- **Alarms** reach GitHub as issues through `alarmToGithubIssue.js`; the state-change events
  pass through one EventBridge rule in `OpsStack`. **RUM** (web vitals, JS errors) runs on
  submit only. **Cost**: `_developers/archive/PLAN_COST_INSTRUMENTATION.md` designed the CUR
  export, budgets and anomaly monitor; none is applied. **Deployments**: the only persistent
  record is the SSM `last-known-good-deployment` parameter per environment; ci names carry the
  branch by construction, prod names carry the commit sha.
- **Downloads and donations** happen on the spreadsheets site, which fires GA4 events for
  both (`ecommerce-events.js`, `books-events.js`) and nothing else. The four Stripe donation
  Payment Links and the PayPal donate button report nowhere in this repo.
- **The company's own books** are the subject of `../PLAN_FINANCE_AUTOMATION.md`: staged
  PayPal, Stripe and NatWest downloads become a diya-gl book, from which the Ltd engine in the
  spreadsheets repo computes the published P&L and balance sheet. No code yet; the March to
  August 2026 staging is phase 1.

## Panel by panel

| Panel | Source today | Gap | Work |
|---|---|---|---|
| 1 Revenue | `v_revenue_daily` from the Stripe pull (subscriptions and bundles) | Donations: confirm the Payment Links sit in the same Stripe account the nightly pull reads and label them by product; PayPal donations need the PayPal API from the finance plan's phase 1 | D2 |
| 2 Visitors and goals | GA4 sessions, users and events per host in the lake; conversion views for submit | Synthetic traffic tagged in GA4 and RUM (a `actor` user property set when the signed-in user is `synthetic-*@test.diyaccounting.co.uk` or the run carries a `test_` correlation id); bot share from the CloudFront logs' user-agent class; the root page's stream id; cross-domain linking so one visitor keeps one session from apex to submit; the four goals as GA4 key events | D3, D4 |
| 3 Downloads by product | Event counts by name only; no product dimension in the Data API pull | Read the download events with their `product` parameter from the BigQuery export instead of the Data API | D5 |
| 4 Submissions by activity | `v_submissions_daily` counts VAT returns only | Add the Companies House events (`companies-house-accounts-submitted`, `companies-house-filing-submitted`, the two register filings) and group by activity | D1 |
| 5 Sources | `sessionDefaultChannelGroup` is pulled | A view and a widget | D1 |
| 6 Alarms | GitHub issues; EventBridge state changes | Deliver the state-change events to the lake through the existing Firehose pattern; a view by family and day | D6 |
| 7 AWS cost | Nothing deployed | Apply the cost instrumentation plan's CUR 2.0 export into the lake and its budgets; a daily Cost Explorer pull is the fallback if the CUR lands slowly | D7 |
| 8 Deployments by branch | SSM pointer, current value only | Publish one lake row from `set-last-known-good-deployment` and from the destroy workflows: name, environment, branch, sha, run id, duration; ci and prod both | D8 |
| Deep links | none | Every row on the page links to its object: the issue, the run, the stack, the receipt, the GA4 report | D9 |
| Company P&L and balance sheet | none | The company's diya-gl book saved to the DIYA cloud through the finance plan; a nightly derivation with the Ltd engine; the two statements rendered on the page | D10 |
| Invoicing MCP, chat trigger | none | Horizon: the finance plan's dividend vouchers and sales invoices generated from the book's `dividends` and `members` tables, exposed as tools on the submission MCP; a button on the page that opens a chat with the MCP attached | after `PLAN_SUBMISSION_MCP.md` M4 |

## Decisions

1. **The lake is the store; the page is a render.** Every panel reads an Athena view or a
   metric that already exists or is added to `AnalyticsStack`. The dashboard adds no second
   pipeline. The reconciliation widget's principle carries over: where two sources measure the
   same thing (GA4 purchases against Stripe charges, GA4 downloads against CloudFront log hits),
   show both.
2. **The page is a private static page on submit, generated nightly.** The CloudWatch dashboard
   stays for operations, but it cannot render a balance sheet or carry deep links well and it
   needs the console. The nightly metrics job writes one JSON snapshot per environment to a
   prefix the site serves behind the operator's own sign-in, on an activity gated to an
   `operator` bundle that no customer holds. The page is plain HTML and the existing chart
   style. **Alternative**: Looker Studio over the BigQuery export, which gives a page with no
   code for the GA4 half but cannot show the Stripe, alarm, cost, deployment or accounts data
   without moving them into BigQuery too. The operator may prefer it for the visitor panels.
3. **One GA4 property, one visitor.** The three sites keep their streams in the shared
   property. Cross-domain measurement is configured on that property so a visitor arriving at
   the apex and subscribing on submit is one session with one source. The root holding page
   moves to the gateway stream or gets its own.
4. **Synthetic traffic is tagged, not suppressed.** Probe and behaviour runs are a load the
   sites should measure. The client sets a GA4 user property and a RUM session attribute from
   the same rule `classifyActor` applies on the server, and every visitor panel splits on it.
5. **The company accounts come from the same engine customers use.** No spreadsheet is read by
   hand. The finance plan produces the book; `derive_micro_entity_accounts` and the published
   statements from `PLAN_SUBMISSION_MCP.md` produce the figures; this page shows them beside
   the last filed set.

## Sequence

Rows D1 to D9 are `claude/dash-<n>-<topic>` branches here unless the table names another repo.

| Row | What | Waits on | Owner, model |
|---|---|---|---|
| D1 | Views and metrics for submissions by activity and traffic sources; the page skeleton with those two panels, the snapshot writer, the `operator` bundle and activity gate | none | Claude Code, Sonnet |
| D2 | Donations: confirm the Stripe account, label the Payment Links' charges by product in `v_revenue_daily`; PayPal donations once the finance plan's PayPal pull exists | finance plan phase 1 for PayPal | Claude Code, Sonnet; operator confirms the account |
| D3 | Synthetic tagging in `analytics.js` and the RUM client on submit, the same on spreadsheets' `analytics.js`; the root page's stream id (root repo); cross-domain linking and the four key events on the property | none; the GA4 property changes go through backlog row 49's tooling or the Admin API script | Claude Code, Sonnet; three repos, one PR each |
| D4 | Bot share from CloudFront logs by user-agent class; the visitors panel with human, bot and synthetic | D3 | Claude Code, Sonnet |
| D5 | Downloads by product from the BigQuery export (a scheduled query into the lake, or Athena's BigQuery connector); the panel | the export, already on | Claude Code, Sonnet |
| D6 | Alarm state changes into the lake; the panel by family | none | Claude Code, Sonnet |
| D7 | Apply the cost instrumentation plan: CUR 2.0 export, tags, budgets, anomaly monitor; the panel | operator's yes for the management-account export | Claude Code, Sonnet; the plan is written |
| D8 | Deployment rows from the deploy and destroy workflows; the panel by branch | none | Claude Code, Sonnet |
| D9 | Deep links on every row | D1 | Claude Code, Haiku |
| D10 | The company P&L and balance sheet: the nightly derivation over the company's cloud book and the panel | finance plan phase 2; `PLAN_SUBMISSION_MCP.md` M1 and M3; the published diya-gl package | Claude Code, Sonnet |

## Verification

- Each panel's figure for one day is reproduced by hand from its source: a GA4 explore, the
  Stripe dashboard, the GitHub issues list, Cost Explorer, the Actions run list.
- A probe run against prod appears in the visitors panel as synthetic and in no other class.
- A visit that starts on the apex and subscribes on submit is one GA4 session with the apex's
  source.
- The company balance sheet on the page equals the Ltd engine's published balance sheet for
  the same book, and its prior-year column equals the last set filed at Companies House.
- The page is reachable signed in as the operator and returns the site's normal denial to any
  other user and to the synthetic users.

## Dependencies outside this repository

| Dependency | Where | State |
|---|---|---|
| Downloads, donations and books events on the spreadsheets site; its `analytics.js` for synthetic tagging | `../spreadsheets.diyaccounting.co.uk` | Events exist; tagging is D3 |
| The root holding page's GA4 stream id | `../root.diyaccounting.co.uk` | One-line change, D3 |
| Cross-domain linking and key events on GA4 property 523400333 | Google Analytics Admin; backlog row 49 wants this as code | Operator or the Admin API script |
| The BigQuery export and its scheduled queries | `diyaccounting-ga4` project; the GA4 service account in Secrets Manager | Export on; queries are D5 |
| CUR 2.0 export from the management account | AWS management account 887764105431 | Designed in the cost plan, not applied |
| The company's diya-gl book | `../PLAN_FINANCE_AUTOMATION.md` phases 1 and 2, Cowork sessions plus backlog rows | Drafted 2026-08-31, no code |
| The Ltd engine as a published package | spreadsheets board H7 | Ready to start |
| Which Stripe account holds the donation Payment Links | Stripe dashboard | Operator confirms |

## Distance

Half the panels are a view and a widget away, because the lake, the ingestion and the GA4
property already span the three sites: submissions by activity, sources, alarms, deployments
and the page itself (D1, D6, D8, D9) need no outside party. Visitors and downloads (D3 to D5)
need small changes in the two sibling repos and one GA4 property change. Cost (D7) needs the
operator's yes on the management account. The company P&L and balance sheet (D10) is the far
end: it waits on the finance plan's staging and ingest, which has not started, and on the
submission MCP's derivation; the rendering itself is small once the book exists.

## Related

- `_developers/archive/PLAN_USAGE_DATA_PIPELINE.md`, `_developers/archive/PLAN_GA4.md`,
  `_developers/archive/PLAN_COST_INSTRUMENTATION.md`, `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md`
- `.claude/skills/board/SKILL.md` renders the work board; this page renders the business.
- `_developers/backlog/METRIC_SON_DESIGN.md` can sit on the page as a second presentation of
  the same metrics.
- `../PLAN_FINANCE_AUTOMATION.md`, `PLAN_SUBMISSION_MCP.md`
