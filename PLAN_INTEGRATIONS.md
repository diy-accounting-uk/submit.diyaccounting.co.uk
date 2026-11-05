<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Integrations tab and out-of-process header checks

This plan covers rows INT1, INT2, INT3 and FPH3 on `NEXT.md`. Each outbound call to HMRC, Companies House or Stripe writes one masked record. The operator dashboard shows the records on a new Integrations tab and on two Main tab graphs. A rule check runs on every HMRC request, and a queue consumer checks each new header shape with HMRC's sandbox validator.

Status: design only. The base is branch `claude/galileo-headers`, PR #684, which adds `sendToHmrc`. The build starts after #684 merges.

## Operator assertions (verbatim)

> Please add a log of all HMRC requests on the operator dashboard showing on a new "integrations" tab which has a summary table of requests to HMRC, Companies House, and stripe for the standard ranges of: today, yesterday etc… with rows per org (hmrc etc) and per HTTP response code. Then detailed tables for each org with 1 row per API invocation, showing the time called, API called, the duration until a response, response code, where applicable if the fraud prevention headers were checked and the results, and a link to where the full raw details of the request are (in AWS requiring the user's existing AWS auth to access CloudWatch logs or some db via a deep link directly to the request log data).

> there is an fph check API which I think we have turned off because it runs long, please see if we can design something to run out of process via another SQS queue where the SQS consumer does a check with hmrc for FPH compliance for a request and records the result and alarms if the check fails, we would use this for monitoring and also feed an additional table in the integrations tab.

> on the Main tab of the dashboard, add 2 graphs, one for API requests per org per HTTP status code, and one for average API request durations per org

## Decisions in one view

| Topic | Decision |
| --- | --- |
| Store | New DynamoDB table `{env}-env-integration-calls`, keyed by organisation and day |
| Range counts, graphs, detail rows | DynamoDB stream to the lake, read by Athena in the hourly snapshot |
| Raw link | DynamoDB console item link, 90 day TTL |
| Raw content | Masked skeleton: no VRN, NINO, sub, IP or device id |
| Snapshot | One `integrations` section, 200 rows per organisation, no new endpoint |
| Every HMRC request | In-process rule check against HMRC's published formats |
| HMRC's validator | SQS consumer sends a synthetic request, one per header shape per day |
| Customer production headers to the sandbox | Not sent. Question goes on OFPH1 |

## Measured facts

| Fact | Figure | Source |
| --- | --- | --- |
| `prod-env-hmrc-api-requests` items | 1,976 in 28 days, about 2,100 a month | `describe-table` |
| Average audit item | 1.8 KB | 3.6 MB over 1,976 items |
| Snapshot size | 559 KB as written, 188 KB of content | `head-object`, JSON lengths |
| Snapshot age | Hourly in prod, weekly in ci | `operatorSnapshotPublish.js` header |
| Lambda log retention | 7 days, one log group for each deployment | `describe-log-groups` |
| Lake curated data | 800 day default expiry | `AnalyticsStack.java` |
| Firehose buffer | 900 seconds | `TableChangeDelivery.java` line 450 |

The call volume is higher than the "few hundred a month" in the brief. The figure includes sandbox calls from the probes.

Prod stack resources against the limit of 500:

| Stack | Resources | Change from this plan |
| --- | --- | --- |
| HmrcItsaStack | 487 | 0 new resources |
| HmrcStack | 438 | about 13 (FPH3 worker) |
| AnalyticsStack | 329 | about 6 |
| AccountStack | 326 | 0 |
| ApiStack | 318 | 0 |
| DataStack | 232 | about 4 |
| CompaniesHouseStack | 217 | 0 |

A grant to an imported table adds a statement to the role's default policy. It adds no CloudFormation resource.

## Code facts that change the rows

1. `maskHttpData` does not mask VRNs. It masks field names only (`authorization`, `password`, `*token`, `*secret`, `code`). A unit test asserts that `hmrcTestVatNumber` stays in clear. The VRN also stays in the stored `url`. Row INT1 says the opposite.
2. `maskHttpData` masks every field named `code`, so HMRC's response `code` is stored as `***MASKED***`. This hides `VALID_HEADERS` and each HMRC error code in the audit table.
3. `redactedHmrcPath` replaces only a VRN and a NINO. ITSA paths also hold business ids, calculation ids and period ids.
4. `sendToHmrc` does not carry every HMRC call. These four bypass it:
   - `validateFraudPreventionHeaders` (`hmrcApi.js` line 336)
   - `getFraudPreventionHeadersFeedback` (line 482)
   - the OAuth token exchange (`httpResponseHelper.js` line 500)
   - `postToTransactionEngine` (`hmrcTransactionEngine.js` line 363)

   `hmrcSendPathBypass.test.js` does not see `httpResponseHelper.js`, because that file names no HMRC host.
5. Companies House has no single send point. It has four call sites, all on `app/lib/httpFetch.js`:
   - `companiesHouseApi.js` line 86
   - `companiesHouseFilingApi.js` line 100
   - `companiesHouseXmlGateway.js` line 766
   - `companiesHouseTokenPost.js` line 169
6. A Companies House XML Gateway call uses one URL for all message classes. The gateway answers HTTP 200 with an error inside the envelope, so the status alone hides a rejection.
7. Stripe has one wrapper. `getStripeClient` in `app/lib/stripeClient.js` is the only `new Stripe` in `app/`. It has 10 caller files and about 20 call sites, in the billing, account and analytics functions.
8. Stripe's `response` event does not fire on a timeout or a network error. The SDK timeout is 80 seconds and it retries twice. An ingest Lambda stops at 28 seconds, so the Lambda can stop before the SDK reports.

## INT1: the record

### Fields

One item for each attempt. A Stripe SDK retry is a second attempt and a second item.

| Field | Example | Note |
| --- | --- | --- |
| `pk` | `call#hmrc#2026-11-04` | Organisation and UTC day |
| `sk` | `2026-11-04T10:15:30.123Z#a1b2c3d4` | Start time and call id |
| `recordType` | `call` | FPH3 adds `fph-check` |
| `org` | `hmrc`, `companies-house`, `stripe` | |
| `target` | `live`, `test` | Sandbox host, `GatewayTest`, Stripe test key, simulator are `test` |
| `api` | `POST /organisations/vat/{vrn}/returns` | Template; see below |
| `method` | `POST` | |
| `startedAt` | ISO time | Time called |
| `durationMs` | `412` | Time until the response headers, or until the failure |
| `outcome` | `response`, `timeout`, `network-error`, `refused` | |
| `status` | `200`, or absent | HTTP status |
| `statusLabel` | `200`, `timeout`, `network-error`, `refused` | The page and graphs group by this |
| `appCode` | `502` | Gateway or transaction engine error number inside an HTTP 200 |
| `providerRequestId` | `req_...` | Stripe `request-id`, HMRC `x-correlationid` |
| `requestId`, `traceparent` | | From the logger context |
| `function`, `deployment` | | From the Lambda environment |
| `fph` | `{ rules, rulesFailed, shapeHash }` | HMRC API calls only |
| `raw` | see Masking | Not sent to the lake |
| `ttl` | epoch seconds | 90 days |

`api` comes from an allowlist. A path segment stays only when it is lower-case words or hyphens, a tax year `yyyy-yy`, or a version. All other segments become `{id}`, or a named form such as `{vrn}` and `{nino}`. The query string is dropped. An XML Gateway call uses `XMLGW <message class>`, and a transaction engine call uses `TE <message class>`.

### How each record is made

The shared code is `app/lib/integrationCalls.js`, with one function:

`recordedFetch(url, init, { org, target, api, fetchImplementation })`

It starts a timer and sends. It writes the item in a `finally` path, so a timeout or a network error also leaves a record. It awaits the write, because a Lambda freezes after it answers. The write has a limit of 1 second. A write failure logs a warning and emits `IntegrationCallRecordFailed`. It never fails the customer's call.

| Organisation | Send point | Change |
| --- | --- | --- |
| HMRC API | `sendToHmrc` | Calls `recordedFetch`. A refused request writes a `refused` record, then throws |
| HMRC validator, feedback | `hmrcApi.js` | Change the two direct `fetch` calls to `recordedFetch`, with no `fph` field |
| HMRC token | `httpResponseHelper.js` | The caller passes `org: "hmrc"` when the provider is HMRC |
| HMRC transaction engine | `postToTransactionEngine` | Uses `recordedFetch`. Reads the error number into `appCode` |
| Companies House | New `app/services/companiesHouseSend.js` | The four call sites use `sendToCompaniesHouse`. A new bypass test bans other sends |
| Stripe | `app/lib/stripeClient.js` | Passes a `httpClient` option: a wrapper around `Stripe.createNodeHttpClient()` |

The Stripe wrapper overrides `makeRequest`. It sees each attempt, each status and each failure, and it needs no change at the call sites. `getStripeClient` also sets `timeout: 20000` for ingest Lambdas, so the SDK stops before the Lambda does.

A Lambda that the runtime stops leaves no record. Timeouts below the Lambda's limit prevent this, and the existing Lambda error alarms cover the remaining case.

Rejected:

- Stripe's `request` and `response` events: they miss a timeout and a network error.
- A wrapper at each Stripe call site: a new call site could miss it.
- A host check inside `fetchWithTimeout`: it misses `sendToHmrc`, and it cannot name an XML Gateway message class.
- A second write before the send: it doubles the writes to cover a case that timeouts already prevent.

### Masking

`app/lib/dataMasking.js` gets `maskIntegrationRaw`, built on an allowlist. `raw` holds:

- the method, the host and the `api` template;
- request header names, with values only for `Accept`, `Content-Type`, `Gov-Client-Connection-Method`, `Gov-Vendor-Product-Name` and `Gov-Vendor-Version`;
- the response status and response header names;
- body skeletons: field names and value types (`{ "vatDueSales": "number" }`);
- for a status of 400 or above: the error `code` and `message`, and each `errors[].code` and `errors[].message`. Any digit run of six or more in a message becomes `{id}`.

`raw` has no Gov-Client value, no VRN, NINO, UTR, company number, sub, hashed sub, email, IP or device id. Stripe keeps parameter names only. XML calls keep the message class, the transaction id and the gateway error number. They keep no envelope, because an envelope carries credentials and the accounts. `raw` is limited to 32 KB, with `truncated: true` beyond that.

The item holds no customer key. It therefore needs no erasure step, and a 90 day TTL does not conflict with the 30 day erasure statement in `privacy.html`.

Fold in fact 2 in the same step. `maskSensitiveData` gets a `keepFields` option. `putHmrcApiRequest` passes `["code"]` for the response only, because `code` stays secret in an OAuth request.

Full values stay in `prod-env-hmrc-api-requests` for 28 days. That table does not change.

## INT1: the store

The chosen store has two parts:

1. `{env}-env-integration-calls` in `DataStack`: on-demand, PITR, stream, `ttl` attribute. It holds the raw record and is the deep link target.
2. The stream runs through the existing `TableChangeDelivery` and `dynamoStreamToFirehose.js` into a Glue table `dynamo_calls`. A new `calls` projector takes a whitelist with no `raw`, and returns null for a TTL `REMOVE`. Lake rows expire at the 800 day default.

| Option | Scan free | Outlives logs | Direct link | Cost now | Verdict |
| --- | --- | --- | --- | --- | --- |
| DynamoDB + stream to lake | Yes | Yes | Yes | Under $1 a month | Chosen |
| DynamoDB only, read by Query | Yes | Yes | Yes | Under $1 a month | Rejected |
| Firehose and S3 lake only | Yes | Yes | No | Under $1 a month | Rejected |
| Env-scoped CloudWatch log group | Yes | Yes | Partly | Under $1 a month | Rejected |
| Existing audit table | No | 28 days | Yes | No change | Rejected |

Why each option was rejected:

- DynamoDB only: the graphs and range columns are Athena SQL (`longFormSql`, `WINDOWED_COLUMNS`), so this needs new reading code and 270 Queries each hour, and each Query pays to read `raw`.
- Lake only: no console URL opens one row of an S3 object, and Athena links open a list of saved queries only.
- Log group: a Logs Insights link needs a time window and a press of Run, and the counts need Insights queries from the snapshot.
- Audit table: its key is `hashedSub` and it has no date index, so it needs a Scan or a new GSI. It holds HMRC calls only and has a 28 day TTL.

Retention: raw item 90 days, the longest range on the page. Lake summary row 800 days.

Cost, estimated. At 2,100 calls a month and 2 KB an item: under $0.05 for DynamoDB, under $0.10 for Athena at the 10 MB query minimum, and pennies for Firehose. At 100 times the volume the cost stays under $5 a month.

Freshness: a call reaches the lake within 15 minutes and the snapshot within the next hour, so the page can be 75 minutes old. The page already shows the snapshot's age. The raw link works from the moment of the call.

## INT1: the raw-detail link

`dashboard.awslinks.js` gets `dynamoItemUrl(region, table, pk, sk)`. `app/lib/consoleLinks.js` gets the same function for alarm issues. The form is:

```
https://eu-west-2.console.aws.amazon.com/dynamodbv2/home?region=eu-west-2#edit-item?table=<table>&itemMode=2&pk=<pk>&sk=<sk>&ref=%23item-explorer%3Ftable%3D<table>&route=ROUTE_ITEM_EXPLORER
```

- The link carries no data. It needs a signed-in console session, as every link in `dashboard.awslinks.js` does.
- The console cannot switch account from a link. The page says "Sign in to submit-prod 972912397388" above the tables, from `ENVIRONMENTS`.
- The page builds the link from the row's `org`, `at` and `id`, so the snapshot does not hold the URL.
- A row older than 90 days shows "expired" in place of the link.
- A third-party document is the only source for this URL form. AWS does not document it. Step 6 proves it in the console. If it does not open the item, use the `#item-explorer` query form.
- The edit page has a Save button. An operator with write access can change the item, so the page names the link "View raw record".

## INT1: snapshot size

Each organisation gets at most 200 rows: the newest 100 calls and the newest 100 calls in the last 30 days with a status outside 2xx, without duplicates.

- A row is about 350 bytes as written. Three organisations add about 210 KB.
- Summary rows and two charts add about 50 KB.
- The snapshot grows from 559 KB to about 820 KB. The Lambda response limit is 6 MB.
- The detail table needs no endpoint. An older row stays reachable in the DynamoDB console by `pk`, and the page links to the table.

Rejected: a live endpoint that Queries DynamoDB. It adds a Lambda and a route to `AccountStack` for fresher rows, and the hourly age is sufficient for monitoring.

## INT1: privacy

- `operatorSnapshotGet.js` serves the snapshot to operators only. The page adds no new route.
- The snapshot holds `api` templates, so it has no VRN, NINO, company number or Stripe customer id.
- A unit test fails if the `integrations` section matches a VRN, a NINO, an email, a `cus_` id or an IP address.
- `rawExportPublish.js` does not copy the section unless a later step adds it.
- `web/public/privacy.html` gets one retention row: "Outbound API call records (masked), 90 days, monitoring and troubleshooting". It lands in the same change as the table.

## INT2: the Integrations tab

The tab follows DASH20 and DASH21.

1. Add `<button data-tab-id="integrations">` after Behaviour in `dashboard.html`.
2. Add `#integrationsSummaryPanel`, one detail panel per organisation and `#headerChecksPanel`, each with `data-tab="integrations"`.
3. Add the panel ids to `STATIC_TABLE_PANELS`.
4. Add `renderIntegrations(snapshot)` to `dashboard.page.js`, in the shape of `renderPageVisitors`.
5. Update the tab lists in `operatorDashboard.browser.test.js`.

Summary table columns: Organisation, Status, Today, Previous day, Last 7 days, Last 30 days, 30 day trend, Last 90 days. These are the same headers and tooltips as `#visitorsTable`.

Detail table columns: Time called, API, Duration, Status, Headers checked, Raw record. Headers checked reads `Rules: pass`, `Rules: fail (2)` or `n/a`, followed by `HMRC: pass`, `warn` or `fail` when a check exists for that shape and day.

The snapshot section, built in a new `app/lib/operatorSnapshot/integrationsSection.js`:

```json
{
  "integrations": {
    "table": "prod-env-integration-calls",
    "summary": [{ "org": "hmrc", "target": "live", "status": "200", "today": 3, "prev1": 8, "last7": 40, "last30": 150, "prev30": 130, "last90": 400 }],
    "calls": { "hmrc": [{ "id": "a1b2c3d4", "at": "...", "api": "...", "method": "POST", "ms": 412, "status": "200", "target": "live", "rules": "pass", "rulesFailed": [], "hmrc": "pass" }], "companies-house": [], "stripe": [] },
    "headerChecks": { "summary": [], "rows": [] }
  }
}
```

`handler` builds it in the same try and catch as `buildPageVisitors`. A failure adds one to `failedObservationCount` and publishes without the section.

New views under `infra/main/resources/analytics/views/`, each added to `BusinessViews.java`:

- `v_integration_calls`: one row per call, `change_type = 'INSERT'`, `record_type = 'call'`, with `day` as the UK date of `started_at`.
- `v_integration_calls_daily`: day, org, target, status label, calls, total duration.
- `v_integration_calls_hourly`: the same by hour.
- `v_fph_checks`: one row per check.

The summary SQL maps `WINDOWED_COLUMNS` to `sum(calls) FILTER (WHERE ...)`. `UK_TODAY` then gives the same Today as the other tables, and `computeTrend` gives the trend. The views stay out of `LATEST_READING_VIEWS`, because Today is a live count.

## INT3: the two graphs

Add two entries to `buildDailyChartDefinitions()` and to `CHART_ORDER` in `dashboard.charts.js`. The page draws them in `#chartsGrid` on Main with no new chart code, and each gets the 90 day and 7 day range switch from `sql` and `hourlySql`.

| Chart id | Title | Modes | Value |
| --- | --- | --- | --- |
| `integration-requests` | API requests by organisation and status | All, then one mode per organisation | `calls`, component `org status_label` |
| `integration-duration` | Average API request duration | By organisation | `total_ms / calls`, `total: null` |

- Live calls only, so the sandbox probes do not hide customer traffic. The chart note says this.
- `maxComponents: 8` in the All mode. It groups status into `2xx`, `4xx`, `5xx` and `failed`. An organisation's mode shows exact codes.
- The duration chart uses `total: null`, as the failure rate mode does, because an average does not add up.
- Add a `ms` unit to `formatAxisValue` and `formatReadoutValue`. A value at or above 1,000 shows in seconds.

## FPH3: HMRC's facts

Sources: `developer.service.hmrc.gov.uk/api-documentation/docs/api/service/txm-fph-validator-api/1.0`, its resolved OAS, and `/guides/fraud-prevention/getting-it-right/`.

- The OAS has one server, `test-api.service.hmrc.gov.uk`, "Sandbox". No production server exists.
- `validate` is a GET with `Gov-*` headers. It answers `specVersion`, `code` (`VALID_HEADERS`, `INVALID_HEADERS`, `POTENTIALLY_INVALID_HEADERS`), `message`, `errors` and `warnings`.
- `validation-feedback` covers headers "submitted by your application in sandbox", and returns the stored `value` of each header.
- Both endpoints are `applicationRestricted`. The current code sends a user's token, and a client credentials token is sufficient by the OAS.
- "do not use this API as a guarantee that requests in production will meet the specification"
- "do not send HMRC your logs from this API"
- No page says that production values may go to the sandbox, and no page bans it.
- HMRC checks production traffic itself. The Developer Hub page under the production application shows the status. "Correct" means no issues were found that month.

## FPH3: why the check is off

It was never on in production. Commit 5279aa86b (2025-12-19, #431) added it for sandbox accounts only. The current gate is `hmrcAccount === "synthetic" && runFraudPreventionHeaderValidation`, set by a page checkbox or a query parameter. The behaviour tests tick that box.

The doc comment says "fire-and-forget", but every caller uses `await`, with a limit of 20 seconds, before the real call. That is the delay the operator remembers. An ingest call has 25 seconds in total.

## FPH3: is the SQS design sound

The queue and consumer are sound. Replaying customer headers is not.

Reasons against the replay:

1. `Gov-Client-Public-IP`, `-Device-ID`, `-User-IDs`, `-Multi-Factor`, `-Public-Port`, `-Browser-JS-User-Agent` and `Gov-Vendor-Forwarded` are personal data. Sending them to a test service has no stated purpose in `privacy.html`.
2. HMRC's text does not cover it, and `validation-feedback` shows that HMRC stores the values in the sandbox.
3. A timestamp header in a delayed replay can fail for reasons that the live request did not have.
4. The result is no guarantee of production compliance, so the extra personal data buys no certainty.

## FPH3: the design

Two checks. Each covers what the other cannot.

| Check | Runs | Input | Catches |
| --- | --- | --- | --- |
| A. Rule check | In process, every HMRC API request | Real values, in memory only | A bad real value, a missing header, a broken cross-check |
| B. HMRC validator | SQS consumer, each new shape once a day | Synthetic values | A structure HMRC rejects, a change in HMRC's spec |

Neither check explains the headerless requests on FPH1. That question stays with HMRC on OFPH1.

### A. Rule check

`app/lib/fraudPreventionHeaderRules.js` is a pure function. It takes the headers and the connection method and returns rule ids, for example `Gov-Client-Public-Port:server-port`. It holds one rule set for `WEB_APP_VIA_SERVER` and one for `DESKTOP_APP_VIA_SERVER` and `OTHER_VIA_SERVER`, from HMRC's connection method pages.

Rules from the published spec:

- US-ASCII only; no `null` or `undefined` placeholder.
- Key-value and list forms are percent encoded and have no empty list value.
- `Gov-Client-Public-IP` and `Gov-Vendor-Public-IP` are public, and they differ.
- `Gov-Client-Public-IP-Timestamp` has milliseconds and `Z`.
- `Gov-Client-Public-Port` is 1 to 65535, and is not 80 or 443.
- `Gov-Client-Device-ID` is a UUID.
- `Gov-Client-Multi-Factor` has a `type` of TOTP, AUTH_CODE or OTHER, and a UTC timestamp.
- `Gov-Client-Screens` and `-Window-Size` hold positive whole numbers.
- `Gov-Client-Timezone` is `UTC±hh:mm`.
- The first hop of `Gov-Vendor-Forwarded` has `by` equal to the vendor IP and `for` equal to the client IP.

`checkFraudPreventionHeaders` calls it. A failure emits `HmrcFraudHeaderRuleFailure`, logs header names and rule ids with no values, and sets `fph.rules` to `fail` on the record. The request still goes, as FPH1 sets for a missing browser header. The check takes microseconds and needs no network call.

### B. Validator consumer

A shape is what the headers look like, with no values: the connection method, the header names, the keys in each key-value header, a class for each value (`ipv4`, `ipv6`, `TOTP`, screen count) and the product version. `app/lib/fraudPreventionHeaderShape.js` builds the shape and its SHA-256 `shapeHash`.

Sampling: `sendToHmrc` keeps a set of shape hashes for each warm Lambda and day. A new hash sends one SQS message. The consumer keeps a result item for each shape and day, and skips a shape that has a result. Expect fewer than 20 checks a day, at any traffic level. The send to SQS sits behind a try and catch, and a failure does not stop the HMRC call.

Which values reach the sandbox:

| Header | Value sent | From |
| --- | --- | --- |
| `Gov-Client-Connection-Method` | Real | Ours |
| `Gov-Vendor-Product-Name`, `Gov-Vendor-Version` | Real | Ours |
| `Gov-Vendor-Public-IP` | Consumer's egress IP | Ours |
| `Gov-Client-Public-IP` | Address of `submit.diyaccounting.co.uk`, resolved by the consumer | Ours |
| `Gov-Vendor-Forwarded` | Built from the two addresses above | Ours |
| `Gov-Client-Device-ID` | Fixed test UUID | Constant |
| `Gov-Client-User-IDs` | `cognito=fph-check` | Constant |
| `Gov-Client-Multi-Factor` | Fixed reference, timestamp of now, type from the shape | Constant |
| `Gov-Client-Public-Port`, `-Timezone`, `-Screens`, `-Window-Size`, `-Browser-JS-User-Agent` | Fixed values in the class from the shape | Constant |
| `Gov-Client-Public-IP-Timestamp` | Now | Constant |

No customer-sourced value crosses. Timestamps are fresh, so a delay in the queue cannot fail a check.

The SQS message:

```json
{ "shapeHash": "...", "firstSeenAt": "...", "api": "POST /organisations/vat/{vrn}/returns", "shape": { "connectionMethod": "WEB_APP_VIA_SERVER", "headers": { "Gov-Client-Public-IP": "ipv4" } } }
```

| Item | Value |
| --- | --- |
| Location | `HmrcStack`, per deployment. It has the sandbox variables and the headroom |
| Queue | `{deployment}-app-hmrc-fph-check-queue`, retention 1 day, visibility 120 s |
| Encryption | `QueueEncryption.SQS_MANAGED`, `enforceSSL(true)`. The message has no personal data, so a customer key adds nothing |
| Dead letter queue | Retention 4 days, `maxReceiveCount` 3, encrypted the same way |
| Consumer | `app/functions/hmrc/hmrcFphCheckWorker.js`, on `processSqsRecords` with `errorPolicy: "rethrow"`, batch 1, timeout 60 s, `maxConcurrency` 2 |
| Token | Client credentials from the sandbox application, cached in the warm Lambda |
| Senders | `HmrcStack`, `HmrcItsaStack`, `HmrcItsaPropertyStack`. Queue ARN from `names/`, `Queue.fromQueueArn`, no new resource |

A new construct `QueueWorkerLambda` takes the queue, dead letter queue and alarm code out of `AsyncApiLambda`, because `AsyncApiLambda` always adds an HTTP ingest Lambda. The dead letter and message age alarms join the stack health alarm as they do today.

Rejected:

- Env stack for the queue: the env image and `deploy-environment.yml` lag the app code that the consumer shares. Losing a queued sample at a deploy costs nothing, because the next request sends it again.
- EventBridge Pipes from the table stream: it takes the send off the request path, but it adds a service that this repository does not use, and the send already happens only for a new shape.
- `validation-feedback` as the check: it returns the last request per endpoint in sandbox, so it reports on the probes.

### The result record

The consumer writes an item to the same table. `pk` is `fph#<yyyy-mm-dd>`, `sk` is `<shapeHash>`, with `attribute_not_exists(sk)` as the condition. There is no later update, so the lake gets one row for each check.

Fields: `recordType: "fph-check"`, `checkedAt`, `shapeHash`, `connectionMethod`, `api`, `result`, `hmrcCode`, `specVersion`, `errors` and `warnings` (each `code`, `message`, `headers`), `durationMs`, `ttl`. The detail table joins it to calls on `shapeHash` and day in SQL.

| `result` | Meaning | Action |
| --- | --- | --- |
| `pass` | `VALID_HEADERS` | Table only |
| `warn` | `POTENTIALLY_INVALID_HEADERS` | Table only |
| `fail` | `INVALID_HEADERS` | Emits `HmrcFphCheckFailed` |
| No item | Sandbox error or timeout | SQS retries, then the dead letter queue alarm |

Step 8 records the warnings that the synthetic values cause on a clean run. `warn` stays out of the alarm for that reason. A `specVersion` that differs from the rule set's constant shows as `warn`.

### Alarms

Three new alarms in `ObservabilityStack`, beside `HmrcFraudHeaderViolationAlarm`:

| Alarm | Metric | Threshold |
| --- | --- | --- |
| `HmrcFraudHeaderRuleFailureAlarm` | `HmrcFraudHeaderRuleFailure`, production host | 1 in 5 minutes |
| `HmrcFphCheckFailedAlarm` | `HmrcFphCheckFailed` | 1 in 5 minutes |
| `IntegrationCallRecordFailedAlarm` | `IntegrationCallRecordFailed` | 5 in 1 hour |

### The Integrations table

`#headerChecksPanel` has two tables. The first has the standard range columns, with rows `Rule check pass`, `Rule check fail`, `HMRC validator pass`, `warn` and `fail`. The second lists the newest 50 checks: Time checked, Connection method, Shape, Result, Codes, Spec version, Raw record.

## Question for OFPH1

Add to row OFPH1, because only HMRC can answer:

> We use the Test Fraud Prevention Headers API in the sandbox. May software send header values taken from live production requests to `/test/fraud-prevention-headers/validate` under a sandbox application? If not, is a synthetic request with the same structure an acceptable monitoring use, at about 20 calls a day? Is there any way to read the production "Your headers" status by API?

## Operator decisions

1. **What the header check sends to HMRC.**
   - A: rule check on every request and a synthetic validator request per shape. **Recommended.** No customer value leaves, and HMRC's validator still runs.
   - B: rule check only. No queue. It has no view of HMRC's own rules or spec changes.
   - C: replay real values. Do this only after HMRC says yes on OFPH1. It needs a customer-managed key on the queue and a new line in `privacy.html`.
2. **What the raw record holds, and for how long.**
   - A: masked skeleton, 90 days. **Recommended.** No erasure step, and full HMRC values stay 28 days in the audit table.
   - B: masked values with Gov-Client headers and bodies, 28 days. The link gives more, but rows go dead at 28 days and the item needs a hashed sub for erasure.
   - C: masked skeleton, 13 months. Longer history, and a longer privacy statement.
3. **Sandbox and test calls in the summary table.**
   - A: separate rows, for example "HMRC (test)". **Recommended.** The probes do not hide customer traffic, and the table shows all calls.
   - B: one row per organisation. Shorter, as the words of the request say, but the probes mix with live calls.
   - C: live calls only. Shortest, but a sandbox failure does not show.

The build starts with 1A, 2A and 3A unless the operator says otherwise.

## Build plan

Steps 1 to 6 close INT1, INT2 and INT3. Steps 7 to 9 close FPH3. Steps 3 and 7 can run beside each other after step 2. All steps go on one batch branch, with one commit for each step.

### Step 1. Record core

- **Model**: Opus. It sets the contract and the masking.
- **Files (about 10)**: `app/lib/integrationCalls.js`, `app/lib/dataMasking.js`, `app/data/dynamoDbIntegrationCallRepository.js`, `app/data/dynamoDbHmrcApiRequestRepository.js`, `app/bin/dynamodb.js`, `.env.test`, `.env.proxy`, `.env.simulator`, and the tests.
- **Tests**: unit tests for `app/unit-tests/lib/integrationCalls.test.js`, a masking test with a VRN, NINO, UTR, email, IP, `cus_` id and a GovTalk envelope in the input, and a test that a stored response keeps HMRC's `code`.
- **ci proof**: none alone. It lands with step 4.

### Step 2. HMRC send points

- **Model**: Sonnet. **Blocked on**: PR #684 and step 1.
- **Files (about 7)**: `app/services/hmrcApi.js`, `app/services/hmrcTransactionEngine.js`, `app/lib/httpResponseHelper.js`, `app/functions/hmrc/hmrcTokenPost.js`, `app/functions/mcp/mcpHmrcGrant.js`, `app/unit-tests/services/hmrcSendPath.test.js`, `app/unit-tests/services/hmrcSendPathBypass.test.js`.
- **Tests**: a record for a response, a timeout, a network error and a refusal. Change `ALLOWED_FETCH_CALLS` for `hmrcApi.js` from 3 to 0.
- **ci proof**: step 4.

### Step 3. Companies House and Stripe send points

- **Model**: Sonnet. **Blocked on**: step 1.
- **Files (about 11)**: `app/services/companiesHouseSend.js`, the four call sites in fact 5, `app/lib/stripeClient.js`, `app/lib/stripeRecordingHttpClient.js`, a new `app/unit-tests/services/companiesHouseSendPathBypass.test.js`, `app/unit-tests/lib/stripeRecordingHttpClient.test.js`, and a test that `new Stripe` appears only in `stripeClient.js` under `app/`.
- **Tests**: as named, with a Stripe timeout, a retry and an XML Gateway error inside an HTTP 200.
- **ci proof**: step 4.

### Step 4. Table and access

- **Model**: Sonnet. **Blocked on**: steps 2 and 3.
- **Files (about 15)**: `names/DataNames.java`, `DataStack.java`, a new `utils/IntegrationCallAccess.java`, `HmrcStack.java`, `HmrcItsaStack.java`, `HmrcItsaPropertyStack.java`, `CompaniesHouseStack.java`, `BillingStack.java`, `AccountStack.java`, `McpStack.java`, `BillingWebhookStack.java`, `IngestionStack.java`, `ObservabilityStack.java`, and the tests.
- `IntegrationCallAccess.applyTo` adds the environment variable and `dynamodb:PutItem` for each function in a list. It is one line for each stack, in place of a line for each Lambda.
- **`resourceCountIs` raised**: `DataStackTest` `Custom::EnsurePitr` (add the table to `tableNames`), `SubmitEnvironmentCdkResourceTest` line 188 `AWS::CloudWatch::Alarm` 9 to 10.
- **Test added**: `HmrcItsaStack` resource count does not change.
- **Tests**: `./mvnw clean verify`.
- **ci proof**: env and app deploy of the branch. Run `submitVatBehaviour-ci` and a payment behaviour test. Query `call#hmrc#<today>` in `ci-env-integration-calls` and read the items with Query. Each call has one item, and `raw` passes the masking check. INT1 closes here.

### Step 5. Lake and views

- **Model**: Sonnet. **Blocked on**: step 4.
- **Files (about 11)**: `dynamoStreamToFirehose.js`, its test, `TableChangeDelivery.java`, `TableChangeDeliveryTest.java`, `BusinessViews.java`, `BusinessViewsTest.java`, four view SQL files, `SubmitEnvironmentCdkResourceTest.java`, `AnalyticsStackTest.java`.
- **`resourceCountIs` raised**: `TableChangeDeliveryTest` lines 68 to 70 (Firehose, Glue, event source mapping, 5 to 6). `SubmitEnvironmentCdkResourceTest` lines 280, 281 and 285 (7 to 8, 5 to 6, 34 to 35). `AnalyticsStackTest` line 94 (34 to 35).
- **Tests**: the projector returns no `raw` and returns null for `REMOVE`. `./mvnw clean verify`.
- **ci proof**: after a deploy, wait 15 minutes, then run an Athena count on `v_integration_calls_daily` in ci.

### Step 6. Tab and graphs (INT2 and INT3, one agent)

- **Model**: Sonnet. **Blocked on**: step 5.
- **Files (about 11)**: `app/lib/operatorSnapshot/integrationsSection.js`, its test, `operatorSnapshotPublish.js`, its test, `dashboard.html`, `dashboard.page.js`, `dashboard.charts.js`, `dashboard.awslinks.js`, `app/lib/consoleLinks.js`, `operatorDashboard.browser.test.js`, `web/public/privacy.html`.
- **Tests**: `operatorDashboard.browser.test.js`, snapshot section tests, the privacy pattern test from the INT1 privacy section. The definition of done applies: `visual-review` on the tab and on Main.
- **ci proof**: replay the snapshot on ci with the DATA-60 dispatch, because ci publishes weekly. Open the tab on `ci-set1` or the apex. Named deployments cannot sign in. Check that a row's link opens that item in the ci account while signed in. Prove the link form here.

### Step 7. Rule check

- **Model**: Sonnet. **Blocked on**: step 2.
- **Files (about 6)**: `app/lib/fraudPreventionHeaderRules.js`, its test, `app/services/hmrcApi.js`, `app/unit-tests/services/hmrcSendPath.test.js`, `ObservabilityStack.java`, `SubmitEnvironmentCdkResourceTest.java`.
- Read `/guides/fraud-prevention/connection-method/web-app-via-server/` and the desktop page first. Do not use the summary in this plan as the rule source.
- **`resourceCountIs` raised**: `SubmitEnvironmentCdkResourceTest` line 188 by one more.
- **Tests**: one pass and one fail case for each rule. A fixture of headers from `buildFraudHeaders` passes, so a false alarm cannot ship.
- **ci proof**: run `postVatReturnFraudPreventionHeaders` on ci. Each sandbox HMRC item has `fph.rules` of `pass`.

### Step 8. Validator consumer

- **Model**: Sonnet. **Blocked on**: steps 4 and 7.
- **First, a sandbox proof against the local proxy**: get a client credentials token from `test-api`, send `validate` with the synthetic set, and record the response. If the token fails, stop and report to the coordinator. The rest of this step depends on it.
- **Files (about 13)**: `app/lib/fraudPreventionHeaderShape.js`, its test, `app/functions/hmrc/hmrcFphCheckWorker.js`, its test, `app/services/hmrcApi.js`, `app/http-simulator/routes/fraud-headers.js` if it needs a change, `constructs/QueueWorkerLambda.java`, `constructs/AsyncApiLambda.java`, `names/HmrcNames.java` or its current name, `HmrcStack.java`, `HmrcItsaStack.java`, `HmrcItsaPropertyStack.java`, `ObservabilityStack.java`, tests.
- **`resourceCountIs` raised**: `SubmitApplicationCdkResourceTest` line 85 `AWS::Lambda::Function` 46 to 47, the grouped health alarm list, `SubmitEnvironmentCdkResourceTest` line 188 by one more (12 in total after steps 4, 7 and 8).
- **Tests**: a shape holds no real value, the synthetic set holds no input value, each `result` path, a repeated shape makes no second call, `./mvnw clean verify`.
- **ci proof**: one VAT behaviour run on ci makes a message. The consumer writes `fph#<today>` with a `result`. Force an `INVALID_HEADERS` from the simulator on a local run and prove the metric. Queue and dead letter queue are empty after the run.

### Step 9. Header checks panel

- **Model**: Sonnet. **Blocked on**: steps 6 and 8.
- **Files (about 6)**: `dynamoStreamToFirehose.js`, its test, `integrationsSection.js`, its test, `dashboard.html`, `dashboard.page.js`, the browser test.
- **Tests**: browser test for the panel, then `visual-review`.
- **ci proof**: snapshot replay on ci, then the panel shows the check from step 8. FPH3 closes here.

### After each step

The coordinator deletes closed rows from `NEXT.md` in the same commit, adds the OFPH1 question, and runs the `capabilities` skill for each new `@capability` block. A step that changes `DataStack.java` or `ObservabilityStack.java` starts `deploy-environment.yml` by push, so `deploy.yml`'s wait job holds the app deploy until the table exists.
