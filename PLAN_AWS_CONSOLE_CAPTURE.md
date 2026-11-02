<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AWS console captures on the operator dashboard

## User assertions (verbatim from DASH18)

- Capture AWS console pages (the CloudWatch metric searches, RUM, alarms, X-Ray and Logs Insights that `web/public/operator/dashboard.awslinks.js` links to) as images on a schedule.
- Serve them over HTTPS to signed-in operators only.
- The sign-in must use permissions or tokens, never an emulated person (no password or second factor).

## Recommendation

Use two approaches together. Do not use a headless console browser.

1. **(b) `GetMetricWidgetImage`** renders every metric link as a PNG: the 11 metric searches per environment and the RUM web vitals (RUM publishes them as `AWS/RUM` metrics).
2. **(c) Our own renders from the read APIs** for the three links that are not metric graphs: alarms (`DescribeAlarms`, a table), Bedrock invocations (a fixed `stats` query through Logs Insights, a line chart in `dashboard.charts.js`) and the X-Ray service map (`GetServiceGraph`, a table of services with request, error, fault and latency figures).
3. One capture Lambda in the shared image writes the PNGs and one `index.json` to the private analytics lake. The nightly Step Functions state machine starts it. The operator-only API serves them.

Approach (a) is not chosen. It needs a second container image with Chromium, a role with wide console permissions, and selectors on a console that AWS changes without notice. For the 24 metric links it gives the same graphs as (b). For the other 6 (alarms, Bedrock, X-Ray in each environment), structured data from (c) is easier to read and holds no log lines.

## What each link needs

`dashboard.awslinks.js` builds 30 submit links (15 per environment) and 2 sibling RUM links.

| Link (per environment) | Count | Approach | API |
|---|---|---|---|
| Analytics metric searches | 7 | (b) | `GetMetricWidgetImage` with `SEARCH` |
| Operations metric searches | 4 | (b) | `GetMetricWidgetImage` with `SEARCH` |
| Web vitals and JS errors | 1 | (b) | `GetMetricWidgetImage`, `AWS/RUM` |
| Alarms | 1 | (c) | `cloudwatch:DescribeAlarms` |
| Bedrock in Logs Insights | 1 | (c) | `logs:StartQuery`, `GetQueryResults` |
| X-Ray service map | 1 | (c) | `xray:GetServiceGraph` |
| Spreadsheets, gateway RUM | 2 | (b), later | needs a role in each sibling account |

Notes keyed by row:

- **Metric searches.** A prod test on 2026-11-02 rendered `SEARCH('{AWS/Lambda,FunctionName} MetricName="Duration" prod-env', 'Average', 3600)` as an 800 x 400 PNG of 49 KB. A bare `SEARCH` that matches more than 100 series draws an empty graph with "Maximum number of allowed metrics exceeded". Prod has 109 recently active Lambda `Errors` series and 141 `Submit/Analytics` metrics. Each widget therefore wraps its search in `SORT(SEARCH(...), MAX, DESC, 10)`. The top-10 render was correct on prod. "Every Submit/Analytics metric" becomes three widgets of at most 100 series each, or the top 20 by sum.
- **RUM.** The `AWS/RUM` namespace has the dimension `application_name` (`prod-env-rum`, `ci-env-rum`). One widget shows `WebVitalsLargestContentfulPaint`, `WebVitalsInteractionToNextPaint` and `WebVitalsCumulativeLayoutShift`. A second shows `JsErrorCountPerSession`, `PageViewCount` and `SessionCount`.
- **Alarms.** `DescribeAlarms` with the prefix `<env>-` returns 60 alarms on prod and 51 on ci. The capture stores name, state, reason and state time. The dashboard shows a table with the ALARM rows first.
- **Bedrock.** The log group `/prod/bedrock/invocations` holds prompts and responses (10.6 KB stored, 14-day retention). The capture runs one fixed query only: `stats count(*) as invocations, sum(input.inputTokenCount) as inputTokens, sum(output.outputTokenCount) as outputTokens by bin(1h), modelId`. It stores no log lines.
- **X-Ray.** `GetServiceGraph` returned 27 services on prod (1 hour) and 21 on ci (6 hours). The capture stores each node's name, type, request count, error, fault and throttle counts, and average response time. The dashboard shows a table sorted by fault count. A drawn map is a later step.
- **Sibling RUM.** The `spreadsheets` (064390746177) and `gateway` (283165661847) monitors are in us-east-1 in accounts that other repositories own. `GetMetricWidgetImage` accepts only the local Region, so the capture calls it in us-east-1 with a role in each account. Until those repositories create the roles, the two items stay as links.

## IAM

The prod capture Lambda captures prod and ci. The ci capture Lambda captures ci only. ci never reads prod.

**Capture execution role** (`<env>-env-console-capture`, explicit role name so ci can trust it):

| Action | Resource |
|---|---|
| `cloudwatch:GetMetricWidgetImage` | `*` (no resource type) |
| `cloudwatch:DescribeAlarms` | `arn:aws:cloudwatch:eu-west-2:<acct>:alarm:<env>-*` |
| `logs:StartQuery` | `arn:aws:logs:eu-west-2:<acct>:log-group:/<env>/bedrock/invocations:*` |
| `logs:GetQueryResults`, `logs:StopQuery` | `*` (no resource type) |
| `xray:GetServiceGraph` | `*` (no resource type) |
| `s3:PutObject` | `<lake>/snapshots/<env>/console/*` |
| `sts:AssumeRole` (prod only) | `arn:aws:iam::367191799875:role/ci-env-console-capture-read` |

**ci read role** (`ci-env-console-capture-read` in 367191799875, created only when `envName` is `ci`):

- Trust: `arn:aws:iam::972912397388:role/prod-env-console-capture`, with an `sts:ExternalId` condition.
- Permissions: the first five rows above with ci ARNs. No S3, no `sts`.
- `MaxSessionDuration` 3600. The capture asks for 900 seconds.

Not used: the SSO `AWSReservedSSO_ReadOnlyAccess_*` roles (43200-second sessions) trust only SAML, and the `ReadOnlyAccess` policy reads DynamoDB items and S3 objects, which hold customer data.

The build proves the list on ci: a capture with only these grants renders every widget. If a `SEARCH` widget answers `AccessDenied`, add `cloudwatch:GetMetricData` and `cloudwatch:ListMetrics` on `*` and record the reason in the construct.

## Where it runs and when

- **Code.** `app/functions/analytics/consoleCapturePublish.js` in the shared Lambda image (`public.ecr.aws/lambda/nodejs:24`). It uses only AWS SDK v3 clients: CloudWatch, CloudWatch Logs, X-Ray, STS and S3. 256 MB, ARM64, 5-minute timeout.
- **CDK.** A construct `ConsoleCapturePublish` inside `AnalyticsStack`, modelled on `OperatorSnapshotPublish` (log group through `ensureLogGroupWithDependency`, `DockerImageFunction.fromEcr`, errors alarm).
- **Schedule.** The existing state machine `<env>-env-analytics-nightly` (`NightlyIngestionWorkflow`) starts it. It runs at minute 15 of every hour in prod and at 02:15 UTC on Mondays in ci. A new `Choice` runs the capture when `$$.Execution.StartTime` matches `*T00:*`, `*T06:*`, `*T12:*` or `*T18:*` in prod (4 captures a day), and on every ci run. The task uses `buildOptionalTask`, so a failed capture records `$.failures.consoleCapture` and does not fail the night. Its own errors alarm is the signal.
- **Order.** The capture goes after the pass figures publish, so it adds no time before the snapshot.

## Storage

- Bucket: the analytics lake, `<env>-env-analytics-lake-<account>`. On prod it has all four public access blocks on and a policy that denies non-TLS access. No CloudFront origin reads it; DASH17 proves that.
- Keys: `snapshots/<env>/console/<captured-env>/<link-id>.png` and `snapshots/<env>/console/index.json`. Each run overwrites the last run. There are no dated copies.
- `index.json` holds, per link id: the captured environment, the title, the time captured, the image key or the table rows, and the error text when the capture of that item failed.
- Size: about 26 PNGs of 30 to 60 KB each, so under 2 MB per environment.

## How the dashboard serves them

1. `operatorSnapshotGet.js` also reads `snapshots/<env>/console/index.json` and returns it as `snapshot.console`. Its role already holds `s3:GetObject` on `snapshots/<env>/*`.
2. A new route `GET /api/v1/operator/console-image?id=<link-id>` (`app/functions/analytics/operatorConsoleImageGet.js`) runs `enforceBundles` for the `operator` bundle, looks up the id in `index.json`, and returns the PNG with `isBase64Encoded: true`, `Content-Type: image/png` and `Cache-Control: private, no-store`. An id not in the index answers 404 in JSON. The id never becomes part of a key directly, so no request reads another object.
3. The `operator-dashboard` activity already covers `^/api/v1/operator/.*` (`web/public/submit.catalogue.toml` line 636).
4. The page fetches each image with `fetchWithIdToken`, makes an object URL from the blob, and sets it on an `<img>`. An `<img src>` to the API would send no token.

No image is a public S3 object or a CloudFront object. A response through `/api/*` is a JSON or PNG answer from the Lambda only.

## Monthly cost

List prices: `GetMetricWidgetImage` $0.02 per 1,000 metrics requested, never in the free tier ([CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)). Each series that a `SEARCH` returns counts as one metric.

| Item | Per run | Runs a month | Month |
|---|---|---|---|
| Widget images, prod and ci (13 widgets each, at most 150 series each) | 3,900 metrics, $0.078 | 120 | $9.36 |
| Widget images, ci's own capture | 1,950 metrics, $0.039 | 4 | $0.16 |
| Lambda, 256 MB for 60 s | 15 GB-s | 124 | under $0.05 |
| Logs Insights on 10.6 KB, X-Ray, DescribeAlarms, S3 | — | — | under $0.05 |
| Total, upper bound | | | about $9.60 |

The upper bound assumes 150 series per `SEARCH`. With the narrowed searches (`prod-env` in the term) most widgets return 10 to 40 series, so the expected month is $2 to $4. Hourly captures cost six times as much ($57 upper bound). The capture logs the series count per widget, so the first week shows the real figure.

The headless browser (a) for comparison: Lambda 2,048 MB x86 for about 500 s per run (25 pages) is 1,000 GB-s, $0.017 per run, $2.00 a month at 120 runs, plus the console's own `GetMetricData` charges of the same order as (b) and a Chromium image of about 0.5 GB in ECR ($0.05). Fargate at 1 vCPU and 2 GB for 10 minutes is about $0.01 per run, and needs a VPC with a public subnet.

## Security

**Approach (b) and (c):**

- The capture role reads only metrics, alarm states, one log group through one fixed query, and the service graph. It reads no DynamoDB item, no secret and no customer object.
- `logs:StartQuery` on the Bedrock log group can run any query. The code runs one fixed `stats` query and stores only counts. A change to the query is a code change on a reviewed PR.
- The cross-account role has a 900-second session, an external id, and no write action.
- A leaked image or `index.json` shows Lambda and deployment names, alarm names and reasons, service names, and counts: sign-ins, HMRC authentications, bundle grants, purchases. It shows no name, email, VRN or token. Its sensitivity equals the snapshot's. The 403 and 401 checks are the same as the snapshot's.

**Approach (a), the reasons it is not chosen:**

- The federation endpoint `https://signin.aws.amazon.com/federation` exchanges role credentials for a `SigninToken` (`Action=getSigninToken`), then `Action=login` opens the console ([AWS IAM: custom identity broker console access](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_enable-console-custom-url.html)). The sign-in URL is valid for 15 minutes and AWS says to treat it as a secret.
- A Lambda execution role that assumes the console role is role chaining. The console session is then at most one hour, and `SessionDuration` must not be sent or the call fails (same page). A capture of a few minutes fits in that hour.
- The browser holds a live console session. Every permission of the role is reachable by any script that runs in that browser. The console pages call many APIs beyond the six above, so the role needs a wider grant than (b) and (c), and the console shows the role session name and account id in its header.
- The capture depends on console page layout and load timing. AWS changes the console without notice, so captures fail without a code change on our side.
- "Revoke Sessions" on the role summary page in IAM ends every session from the role.

## Build steps (DASH19)

1. Add a stable `id` to each link in `web/public/operator/dashboard.awslinks.js` (for example `prod-lambda-errors`), and rename the groups to the four DASH17 names if DASH17 has not landed.
2. Write `app/services/consoleCaptureCatalogue.js`: one entry per link id with its environment, title, approach and widget JSON or query. Each `SEARCH` uses `SORT(..., DESC, 10)` and the environment term.
3. Write `app/functions/analytics/consoleCapturePublish.js`: for each environment (prod and, through `sts:AssumeRole`, ci; or ci alone), render the widgets, run `DescribeAlarms`, the Bedrock query and `GetServiceGraph`, write the PNGs and `index.json`, and log the series count per widget. One failed item records its error in the index and does not stop the others.
4. Write `app/unit-tests/analytics/consoleCapturePublish.test.js` with mocked clients: catalogue to calls, index shape, one failed item, the cross-account path.
5. Add `http200OkBinaryResponse` to `app/lib/httpResponseHelper.js`, with a unit case.
6. Write `app/functions/analytics/operatorConsoleImageGet.js` and `app/unit-tests/analytics/operatorConsoleImageGet.test.js`: 401 signed out, 403 for a non-operator, 404 JSON for an unknown id, 200 PNG for an operator. Register `apiEndpoint` in `app/bin/server.js`.
7. In `app/functions/analytics/operatorSnapshotGet.js`, add `snapshot.console` from `index.json` (absent index: no `console` key). Extend `app/unit-tests/analytics/operatorSnapshotGet.test.js`.
8. Write `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ConsoleCapturePublish.java` (the Lambda, the role with the explicit name, the grants in the IAM table, the errors alarm) and, for ci, the read role with its trust and external id. Wire it in `infra/main/java/co/uk/diyaccounting/submit/stacks/AnalyticsStack.java`.
9. In `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java` and `infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java`, add the optional capture task after the pass figures publish, behind the four-times-a-day `Choice` in prod. Extend `NightlyIngestionWorkflowTest.java` and add `ConsoleCapturePublishTest.java` under `infra/test/java/co/uk/diyaccounting/submit/stacks/`.
10. In `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` and `infra/main/java/co/uk/diyaccounting/submit/names/AccountNames.java`, add the image route Lambda with `s3:GetObject` on `snapshots/<env>/console/*`, the bundles table query and the salt and operator list grants that `operatorSnapshotGet` has.
11. In `web/public/operator/dashboard.awslinks.js` and `web/public/operator/dashboard.page.js`, render each link as a heading (the link) beside its image or table and the time captured. Draw the Bedrock series with `web/public/operator/dashboard.charts.js`. Show "Not captured yet" when the index has no entry.
12. Extend `web/browser-tests/operatorDashboard.browser.test.js`: a stub snapshot with a `console` index and a stub PNG; the image shows with its time; an item with an error shows the error text.
13. Add the capability entries to `REPORT_CAPABILITIES.md` (the capture and the image route).
14. Run `npm test` and `./mvnw clean verify`. Deploy to ci, start one capture with `aws stepfunctions start-execution` on `ci-env-analytics-nightly`, and check every widget on the ci dashboard. Run curl for signed out (401), customer (403) and operator (200) on the image route.
15. Follow the visual definition of done in `CLAUDE.md`: the `visual-review` skill on the dashboard screenshots.
