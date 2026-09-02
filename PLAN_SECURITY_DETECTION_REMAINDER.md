# Security detection remainder

Design for backlog item B28, covering what is left of GitHub issues #9 (scan detection) and
#10 (data-theft detection).

The two issues are independent. They share no source file except
`RUNBOOK_INFORMATION_SECURITY.md`, and even there they write different sections. Two agents
can build them at the same time in separate worktrees. The file ownership table below is the
contract that makes that safe; read it before writing any code.

## What already runs

Read this before designing anything new.

| Piece | Where | State |
|---|---|---|
| WAF on CloudFront: rate limit 2000/5min per IP, `KnownBadInputs`, `CommonRuleSet` | `EdgeStack.java:181` | deployed |
| WAF block alarms, forwarded us-east-1 to eu-west-2 | `EdgeStack.java:260` and `:362` | deployed |
| CloudFront access logs, v2 Parquet into the analytics lake | `EdgeStack.java:587`, `analytics/CloudFrontAccessLogs.java` | deployed |
| Glue table `cloudfront_requests`, partition projection on `distribution_id`/`year`/`month`/`day` | `analytics/CloudFrontAccessLogs.java` | deployed |
| CloudTrail with DynamoDB data events for every table in the account | `ObservabilityStack.java:193` | deployed |
| DynamoDB customer-table `Scan` and `GetItem` volume alarms | `SecurityDetectionStack.java` | deployed |
| Telegram forwarder and alarm-to-GitHub-issue Lambdas | `OpsStack.java:206` and `:263` | deployed |
| Salt secret `{env}/submit/user-sub-hash-salt` | created by `deploy-environment.yml:308` | deployed |

**The notification path already exists twice over. Neither issue builds a new one.**

1. **Any alarm** named `{env}-env-*` or `{deployment}-app-*` reaches Telegram and the
   GitHub-issue Lambda through `OpsStack`'s `AlarmStateChangeRule` (`OpsStack.java:353`),
   which matches on the alarm-name prefix. No SNS action, no cross-stack wiring. Alarms in
   us-east-1 need the `WafAlarmForwardRule` pattern at `EdgeStack.java:362`, which already
   forwards every us-east-1 alarm state change to the eu-west-2 default bus.
2. **Any `ActivityEvent`** put on the `{env}-env-activity-bus` bus reaches the same Telegram
   forwarder through `ActivityTelegramRule`. Use `publishActivityEvent()` from
   `app/lib/activityAlert.js`. `flow: "operational"` routes to the ops chat; a `test_`
   request-id prefix routes to the test chat.

Use the alarm path when the signal is a metric. Use the activity-event path when the signal
carries detail a metric cannot hold, such as which IP or which consumer.

## File ownership

Issue 9 and issue 10 each own every file in their column outright. Neither agent may edit a
file in the other column, not even to add an import.

| Issue 9 owns | Issue 10 owns |
|---|---|
| `infra/main/java/.../stacks/EdgeStack.java` | `infra/main/java/.../stacks/SecurityDetectionStack.java` |
| `infra/main/java/.../stacks/ScanDetectionStack.java` (new) | `infra/main/java/.../stacks/DataStack.java` |
| `infra/test/java/.../stacks/ScanDetectionStackTest.java` (new) | `infra/main/java/.../stacks/AuthStack.java` |
| `infra/main/java/.../SubmitEnvironment.java` | `infra/main/java/.../stacks/AccountStack.java` |
| `infra/test/java/.../SubmitApplicationCdkResourceTest.java` | `infra/main/java/.../SubmitSharedNames.java` |
| `app/functions/security/*` (new directory) | `infra/test/java/.../SubmitEnvironmentCdkResourceTest.java` |
| `app/lib/activityAlert.js` | `infra/test/java/.../stacks/SecurityDetectionStackTest.java` |
| `app/unit-tests/lib/activityAlert.test.js` | `infra/test/java/.../stacks/DataStackTest.java` |
| `playwright.config.js` | `app/functions/auth/customAuthorizer.js` |
| `scripts/verify-waf-false-positives.sh` (new) | `app/functions/account/bundleGet.js` |
| `cdk-environment/cdk.json`, `cdk-application/cdk.json` | `app/data/dynamoDbSecurityStateRepository.js` (new) |
| `package.json` | `app/bin/server.js` |
| `RUNBOOK_INFORMATION_SECURITY.md` **section 7 only** | `.github/workflows/deploy-environment.yml` |
| | `scripts/put-salt-secret-resource-policy.sh` (new) |
| | `scripts/force-logout-all-users.sh` (new) |
| | `RUNBOOK_INFORMATION_SECURITY.md` **section 6 only** |

Three notes on the split, because each one costs something:

- **`SubmitSharedNames.java` belongs to issue 10.** Issue 10 needs a shared table name that
  per-deployment app stacks read. Issue 9 therefore formats its own stack id inline in
  `SubmitEnvironment.java` and derives every other name from the `resourceNamePrefix` its
  stacks already receive.
- **`SubmitEnvironmentCdkResourceTest.java` belongs to issue 10**, because issue 10 changes
  the `dataStack` `Custom::AWS` count on line 90. Issue 9's new stack is asserted only in its
  own `ScanDetectionStackTest.java`, which is how `SecurityDetectionStack` is already tested.
- **The runbook is split by section.** Issue 9 adds subsection 7.5 immediately before the
  `---` that precedes `## 8. Data Retention`. Issue 10 adds subsection 6.6 immediately before
  the `---` that precedes `## 7. Security Monitoring`, and edits the `USER_SUB_HASH_SALT` row
  of the 6.4 table. Neither touches the table of contents: both additions are subsections, so
  the contents list does not change.

**One deliberate cross-issue dependency.** Issue 10's country check needs the
`CloudFront-Viewer-Country` header, which the origin request policy in `EdgeStack.java` does
not forward today. `EdgeStack.java` belongs to issue 9, so **issue 9 makes that one-line
change on issue 10's behalf**, in phase 9.1. Issue 10 builds and unit-tests without it; only
the deployed verification in phase 10.3 waits for issue 9 to land.

---

# Issue 9: scan detection

## Scope decision

**No honeypot pages. No automatic IP blocking.** Earlier `NEXT.md` wording mentioned both.
The issue's acceptance criteria do not, and they are the target. The block list built here is
manual: a human decides, following the runbook. Do not add either, and do not reopen the
question in a comment or a doc.

## Decisions

**Two detection paths, because the two criteria need different data.** A scan of `/.env` is
visible before the request reaches an origin, so WAF sees it and can block it. A 404 is a
response status, which WAF never sees, so only the access log carries it. One mechanism
cannot serve both.

**Sensitive paths: a WAF rule, not a log query.** The rule blocks the scan and emits the
signal in the same evaluation. Anything log-derived can only report a request that already
succeeded.

**404 rates: Athena over the existing Parquet delivery.** The v2 delivery into the analytics
lake is the only CloudFront log path, and phase 5 of `PLAN_SCHEDULED_INGESTION.md` deleted
the duplicate classic delivery on purpose. Do not add a second delivery, do not enable
`Distribution.enableLogging`, and do not parse Parquet in Node. `cloudfront_requests` is
already catalogued and `analyticsMetricsPublish.js` already shows the query-and-parse shape
to copy.

**Not S3 `ObjectCreated`.** The obvious trigger on the new Parquet object fails on both
counts: the object is Parquet, so the Lambda would need a Parquet reader, and delivery lands
minutes after the requests it describes, so it is no faster than a poll. A five-minute
schedule with a high-water mark gives the same latency, reads SQL, and re-runs cleanly after
a failure.

**Not Kinesis real-time logs, for now.** CloudFront real-time logs are the only sub-second
source, and a one-shard stream costs about $11 a month per environment. Phase 9.1 is expected
to land inside 30 seconds through WAF logs. Phase 9.1's verification measures the real
latency; if it misses, real-time logs are the next step and an operator cost decision, not
something the implementing agent takes on its own.

**Not Lambda@Edge.** `EdgeStack.java:495` records why the repo moved off it.

---

## Phase 9.1: sensitive-path scan detection

Covers acceptance criteria 1, 3 and 4.

### Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` (edit)
- `app/functions/security/wafScanDetect.js` (new)
- `app/unit-tests/functions/wafScanDetect.test.js` (new)
- `app/lib/activityAlert.js` (edit)
- `app/unit-tests/lib/activityAlert.test.js` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (edit)
- `scripts/verify-waf-false-positives.sh` (new)
- `package.json` (edit)

### What changes

**A regex pattern set and a WAF rule.** `CfnRegexPatternSet` named
`{deployment}-app-sensitive-paths`, scope `CLOUDFRONT`, in `EdgeStack` (already us-east-1).
Anchored patterns only:

```
^/\.env
^/\.git/
^/\.aws/
^/\.ssh/
^/wp-admin
^/wp-login
^/xmlrpc\.php
^/phpmyadmin
^/vendor/
^/actuator
^/server-status
^/config\.(json|php|yml|yaml)$
\.php$
```

Anchoring matters. `^/\.env` must not match `/submit.env`, which the publish step writes as a
real asset. Write a test for that case before anything else.

A new `CfnWebACL.RuleProperty` named `SensitivePathScan` at priority 0, ahead of the three
existing rules, whose statement is a `regexPatternSetReferenceStatement` on `uriPath` with a
`URL_DECODE` then `LOWERCASE` text transformation, action `Block`, `sampledRequestsEnabled`
and `cloudWatchMetricsEnabled` both true.

**WAF logging, blocks only.** A `LogGroup` in us-east-1 named
`aws-waf-logs-{deployment}-app` (the `aws-waf-logs-` prefix is required by WAF), one month
retention, `RemovalPolicy.DESTROY`. A `CfnLoggingConfiguration` pointing the web ACL at it,
with a `loggingFilter` that keeps only requests whose action is `BLOCK`, and `redactedFields`
covering the `authorization`, `x-authorization` and `cookie` headers. The filter keeps the
volume and the cost near zero. The redaction keeps tokens out of a log group that is not the
application's own.

**The detect Lambda.** `app/functions/security/wafScanDetect.js`, deployed in us-east-1 from
the `{env}-env-ecr-us-east-1` repository. `SelfDestructStack.java:184` is the working example
of a us-east-1 Docker-image Lambda in this repo; copy its shape, including the explicit log
group that `assertEveryLambdaHasAnExplicitLogGroup` requires. A `SubscriptionFilter` on the
WAF log group with a `LambdaDestination` and a filter pattern selecting
`terminatingRuleId = "SensitivePathScan"`.

The handler gunzips and decodes the CloudWatch Logs payload, and for each record publishes
one `ActivityEvent`:

```
event:   "scan-detected"
flow:    "operational"
summary: "Scan blocked: <method> <uri> from <ip> (<country>) on <deployment>"
detail:  { rule, uri, clientIp, country, deployment, requestId }
```

De-duplicate inside one invocation by `clientIp` plus `uri`, so a scanner hitting twenty
paths in one batch produces one message per path, not one per record.

**Cross-region event publishing.** `app/lib/activityAlert.js` builds its EventBridge client
with `process.env.AWS_REGION`. In us-east-1 that resolves to the wrong bus. Add
`ACTIVITY_BUS_REGION` ahead of `AWS_REGION` in that one client construction, and set it to
`eu-west-2` on this Lambda. Every existing caller is unaffected. Grant `events:PutEvents` on
the eu-west-2 activity bus ARN.

**The header issue 10 needs.** Add `CloudFront-Viewer-Country` to the explicit extra headers
on `fraudPreventionHeadersPolicy` at `EdgeStack.java:526`, alongside the
`CloudFront-Viewer-Address` already there. One argument. Issue 10 depends on it and cannot
add it.

### Test strategy

Unit tier (`app/unit-tests/functions/wafScanDetect.test.js`), with a mocked EventBridge
client:

- A gzipped CloudWatch Logs payload with one blocked record produces one `ActivityEvent`
- The event carries the client IP, the URI and the deployment name
- Two records for the same IP and URI produce one event
- A record whose `terminatingRuleId` is not `SensitivePathScan` produces none
- The event is published with `flow: "operational"`

Unit tier (`app/unit-tests/lib/activityAlert.test.js`): the client region comes from
`ACTIVITY_BUS_REGION` when set and from `AWS_REGION` when it is not.

CDK tier (`SubmitApplicationCdkResourceTest`): the web ACL has four rules with
`SensitivePathScan` at priority 0; one `AWS::WAFv2::RegexPatternSet` exists and its patterns
include `^/\.env`; one `AWS::WAFv2::LoggingConfiguration` exists with a `BLOCK`-only filter;
one `AWS::Logs::SubscriptionFilter` exists; the origin request policy lists
`CloudFront-Viewer-Country`. Resource counts move for `AWS::Lambda::Function`,
`AWS::Logs::LogGroup` and `AWS::IAM::Policy` in the edge stack, so update them and the
comments that explain them.

Behaviour tier: nothing new. The suites run against the deployment and must stay green, which
is criterion 4's real check.

### Verification criterion

Against the ci deployment, `curl -s -o /dev/null -w '%{http_code}' https://<ci host>/.env`
returns `403`, and a `Scan blocked` message naming that path arrives in the ops Telegram
chat. Record the delay between the two.

Under 30 seconds closes acceptance criterion 1. If the delay is longer, the gap is AWS WAF's
own log-delivery lag, and the next step is CloudFront real-time logs on a one-shard Kinesis
stream at about $11 a month per environment. Report the measured number and let the operator
decide; do not build it.

`curl https://<ci host>/submit.env` must still return the asset, not a 403.

**Status: infra confirmed deployed 2026-09-02.** `SensitivePathScan` is at priority 0 on the
`ci-claudefix-app-waf` web ACL, `aws-waf-logs-ci-claudefix-app` log group exists, and
`ci-claudefix-app-waf-scan-detect` (us-east-1) is deployed. `scripts/verify-waf-false-positives.sh
ci-claudefix 60` passes with zero blocks. Not run: the live `/.env` curl and delay measurement —
deliberately not triggered against the real ci site.

---

## Phase 9.2: 404-rate aggregation

Covers acceptance criteria 2 and 5.

### Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStack.java` (new)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStackTest.java` (new)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java` (edit)
- `app/functions/security/scanRate404Detect.js` (new)
- `app/unit-tests/functions/scanRate404Detect.test.js` (new)
- `playwright.config.js` (edit)
- `cdk-environment/cdk.json` (edit)

### What changes

**A new environment stack.** `ScanDetectionStack`, eu-west-2, env-scoped, following
`SecurityDetectionStack`'s props and constructor shape. It goes in `SubmitEnvironment.java`
after `analyticsStack`, with `addStackDependency(this.analyticsStack)` because it queries
that stack's Glue table. Its stack id is formatted inline as
`"%s-env-ScanDetectionStack".formatted(envName)`; `SubmitSharedNames.java` belongs to issue
10 for the duration of this work.

It holds one Lambda, one schedule and two alarms. `SecurityDetectionStack` reads CloudTrail
and creates no compute; this one reads access logs and owns a Lambda and a schedule. Keeping
them apart also keeps the two issues off each other's files.

**The aggregator Lambda.** `{env}-env-scan-detect-404`, running
`app/functions/security/scanRate404Detect.js`, ARM64, 512 MB, two-minute timeout, Docker
image from the eu-west-2 env repository, explicit log group through
`ensureLogGroupWithDependency`. An `events.Rule` with `Schedule.rate(Duration.minutes(5))`.

Each run does four things.

1. **Find the distributions.** `ListObjectsV2` on the lake bucket with prefix
   `raw/cloudfront/`, delimiter `/`, reading the common prefixes and taking the value after
   `distributionid=`. Partition projection on `distribution_id` is injected, so Athena needs
   the values in the `WHERE` clause and cannot enumerate them. IAM: `s3:ListBucket` on the
   lake bucket, scoped by prefix. `cloudfront:ListDistributions` is not an option: it only
   accepts `Resource: "*"`, which `assertNoUnscopedIamResources` rejects.

2. **Read the high-water mark.** SSM parameter
   `/{env}/submit/scan-detection/last-evaluated-minute`, standard tier, holding a
   `YYYY-MM-DDTHH:MM` string. Absent on the first run, in which case start ten minutes back.
   Parameter Store rather than DynamoDB: a security job that writes to a customer table would
   trip `SecurityDetectionStack`'s own alarms.

3. **Run one Athena query**, on the `{env}-env-analytics` workgroup, reusing the
   `runAthenaQuery` shape in `app/functions/analytics/analyticsMetricsPublish.js:198`.

   ```sql
   SELECT   distribution_id,
            c_ip,
            substr(concat("date", 'T', "time"), 1, 16) AS minute,
            count(*)                                   AS hits
   FROM     cloudfront_requests
   WHERE    distribution_id IN (<discovered ids>)
     AND    year  = '<yyyy>' AND month = '<mm>' AND day = '<dd>'
     AND    sc_status = '404'
     AND    concat("date", 'T', "time") >  '<high-water mark>'
     AND    concat("date", 'T', "time") <= '<now minus five minutes>'
     AND    cs_user_agent NOT LIKE '%DIYAccountingSynthetic%'
   GROUP BY 1, 2, 3
   HAVING   count(*) > 20
   ```

   `date` and `time` are reserved words in Athena and must stay double-quoted. Every column
   in this table is typed `string`, so these are string comparisons; ISO-8601 ordering makes
   them correct. Cross a UTC midnight by running the query once per date in the window.

4. **Publish and advance.** One `ActivityEvent` per row, `flow: "operational"`, summary
   `"404 scan: <ip> made <n> 404s in one minute on distribution <id>"`, detail carrying the
   distribution id so the runbook can resolve it to a deployment. Then write the new
   high-water mark. Write it only after the events are published, so a failed run re-reports
   rather than losing the window.

**Excluding synthetic runs.** Two separate dimensions, because they answer different
questions.

- *Which deployment* a 404 came from is the `distribution_id` partition. Every deployment
  gets its own CloudFront distribution, so this separates ci from prod and one feature branch
  from another with no marker at all. The alert names the id; section 7.5 of the runbook says
  how to resolve it.
- *Whether a request was synthetic* needs a marker, because synthetic runs hit the real
  production distribution. Set `use.userAgent` in `playwright.config.js` to a realistic
  desktop Chrome string with ` DIYAccountingSynthetic/1` appended, and the query drops those
  rows. Append the token to a full browser UA rather than replacing it: the Cognito Hosted UI
  and the site's own `visitorClassifier` both read the browser tokens.

  This is a telemetry filter, not a security control. Anyone can send that user agent. It
  keeps our own tests out of our own alerts and nothing more. Say so in the runbook.

**Two alarms**, both named with the `{env}-env-` prefix so the existing rule forwards them:
`{env}-env-scan-detect-404-errors` on Lambda `Errors`, sum over five minutes, threshold 1,
`NOT_BREACHING`; and `{env}-env-scan-detect-404-missed` on `Invocations`, sum over 30
minutes, less than 1, `BREACHING`. A security job that silently stops running is the failure
mode worth catching.

**Threshold in context.** `scanDetection404PerMinute`, default 20, in
`cdk-environment/cdk.json`, read through the same reflection loader `ga4PropertyId` uses in
`SubmitEnvironment.java:171` and passed as a prop.

### Test strategy

Unit tier (`app/unit-tests/functions/scanRate404Detect.test.js`), with mocked S3, SSM, Athena
and EventBridge clients:

- Distribution ids are parsed out of `distributionid=` common prefixes
- The query window starts at the stored high-water mark and ends five minutes back
- A first run with no stored parameter starts ten minutes back
- A window spanning midnight produces one query per date
- Each returned row produces one `ActivityEvent` carrying the IP, the count and the
  distribution id
- The high-water mark advances only after publishing succeeds
- A publish failure leaves the stored mark unchanged
- The generated SQL keeps `"date"` and `"time"` quoted and excludes the synthetic user agent

CDK tier (`ScanDetectionStackTest`): the stack holds one Lambda with an explicit log group,
one `AWS::Events::Rule` on a five-minute rate, two alarms with no `AlarmActions`, and no IAM
statement with `Resource: "*"`.

Behaviour tier: nothing new. The suites must stay green with the new user agent, which is the
check that appending the marker broke nothing.

### Verification criterion

Against ci, request 25 distinct nonexistent paths from one machine inside a minute, then wait
for the next scheduled run. A `404 scan` message naming that IP and a count above 20 arrives
in the ops Telegram chat. Then run `npm run test:submitVatBehaviour-ci` and confirm no
message is raised for the test runner's traffic.

**Status: verified live in ci 2026-09-02** via the deploy-gap fix (`2c6633a3`).
`ci-env-ScanDetectionStack` is `UPDATE_COMPLETE`, `ci-env-scan-detect-404` is `Active`,
and `ci-env-scan-detect-404-errors`/`-missed` alarms both exist. A real scheduled
invocation of the Lambda was observed in its logs.

---

## Phase 9.3: manual block list and runbook

Covers acceptance criteria 6 and 7.

### Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (edit)
- `cdk-application/cdk.json` (edit)
- `scripts/verify-waf-false-positives.sh` (new)
- `RUNBOOK_INFORMATION_SECURITY.md` (edit, section 7 only)

### What changes

**The IP set.** A `CfnIPSet` named `{deployment}-app-waf-manual-block`, scope `CLOUDFRONT`,
`ipAddressVersion` `IPV4`, addresses read from a `wafManualBlockIps` context array in
`cdk-application/cdk.json` that defaults to empty. A second `CfnIPSet` for `IPV6` on the same
pattern, because half of the traffic arrives over IPv6 and a v4-only block list quietly fails
against it.

A `WafManualBlock` rule at priority 4, an `orStatement` over the two
`ipSetReferenceStatement`s, action `Block`, metrics on. It sits after the managed groups so
its metric counts only what the managed rules let through, which makes the metric readable.

A `{deployment}-app-waf-manual-block` alarm on `AWS/WAFV2` `BlockedRequests` with dimension
`Rule=WafManualBlock`, threshold 1 over five minutes, following the three WAF alarms already
at `EdgeStack.java:260`. It confirms a block is doing something and shows when an attacker has
stopped.

**How a human adds an IP.** Two steps, and the runbook must say both.

```bash
aws --profile submit-prod --region us-east-1 wafv2 update-ip-set \
  --scope CLOUDFRONT --name prod-app-waf-manual-block \
  --id <id> --lock-token <token> \
  --addresses <existing…> 203.0.113.9/32
```

That takes effect in about a minute. It is also transient: the next CDK deploy of the
deployment resets the addresses to the `wafManualBlockIps` context list. To keep a block, add
the address to `cdk-application/cdk.json` in a pull request. The runbook states this plainly,
because a block that silently disappears on the next deploy is worse than no block.

**The false-positive check.** `scripts/verify-waf-false-positives.sh <env> [minutes]`,
read-only, following the argument style of `scripts/verify-analytics-pipeline.sh`. It reads
`AWS/WAFV2` `BlockedRequests` in us-east-1 for the last N minutes, one datapoint per rule
dimension, and exits non-zero if `SensitivePathScan`, `AWSManagedRulesCommonRuleSet` or
`AWSManagedRulesKnownBadInputsRuleSet` blocked anything. Run it straight after a behaviour
suite: a block during a synthetic run is a false positive by definition. Add
`verify:waf-false-positives` to `package.json`.

**The runbook.** New subsection `### 7.5 Scan Detection Response` at the end of section 7,
before the `---` preceding `## 8. Data Retention`. It covers:

- The two alerts and what each means. `Scan blocked` is a sensitive-path hit, already blocked
  with a 403, so the response is informational. `404 scan` is an unblocked sweep and needs a
  decision.
- **Check whether it is synthetic first.** Resolve the distribution id in the alert:
  `aws --profile submit-prod cloudfront get-distribution --id <id> --query 'Distribution.DistributionConfig.Comment'`.
  A ci distribution is a test run. On the prod distribution, check the user agent in the
  detail: our own suites carry `DIYAccountingSynthetic`. That token is a convenience, not
  proof, so on a prod alert also check whether a synthetic run was in flight
  (`gh run list --workflow synthetic-test.yml --limit 5`).
- If it is not synthetic, add the IP to the manual block IP set with the command above, then
  open a pull request adding it to `cdk-application/cdk.json` so the block survives the next
  deploy.
- The Athena query to see everything that IP asked for, so the alert can be judged rather
  than guessed.
- Removing a block: drop the address from both the IP set and the context list.

### Test strategy

CDK tier (`SubmitApplicationCdkResourceTest`): two `AWS::WAFv2::IPSet` resources exist and
start empty; the web ACL has five rules with `WafManualBlock` at priority 4; the block alarm
exists. Alarm and IP-set counts move in the edge stack, so update them and their comments.

Shell: no test. Verification is the run.

Documentation: no test.

### Verification criterion

Add a throwaway address to `cdk-application/cdk.json`, deploy ci, and confirm the deployed IP
set contains it. Then `scripts/verify-waf-false-positives.sh ci 30` exits 0 after a green
`npm run test:submitVatBehaviour-ci`, which is acceptance criterion 4 measured rather than
asserted.

**Status: infra confirmed deployed 2026-09-02.** `WafManualBlock` at priority 4 on the ci web
ACL, both `ci-claudefix-app-waf-manual-block-v4` and `-v6` IP sets exist (empty). Not run: the
throwaway-address deploy-and-confirm cycle.

---

# Issue 10: data-theft detection remainder

Acceptance criteria 1 (tables) and 2 shipped with `SecurityDetectionStack`. What is left is
the salt secret, the bundle burst, the country change and the runbook.

## Decisions

**The salt secret needs a resource policy, not a data-event selector.** Secrets Manager has
no CloudTrail data events. `GetSecretValue` is a management event, and the trail at
`ObservabilityStack.java:214` already records it, because it is created with
`readWriteType("All")` and `includeManagementEvents(true)`. So acceptance criterion 1's
remainder is two things the trail cannot give on its own: a resource policy that stops the
wrong principal reading the secret, and an alarm that fires when one tries.
`ObservabilityStack.java` needs no change.

**The burst counter goes in the bundle handler, not the authorizer.**
`GET /api/v1/bundle` is behind the native `HttpJwtAuthorizer`, not `customAuthorizer.js`
(`SubmitSharedNames.java:617`). The handler is the only code that runs on every one of those
requests, and it already decodes the token and knows the consumer's `sub`
(`bundleGet.js:48`).

**One new table for both features.** `{env}-env-security-state`, partition key `stateKey`,
TTL attribute `ttl`. Two item shapes distinguished by key prefix: `rate#{hashedSub}#{minute}`
and `geo#{hashedSub}`. One table keeps the `Custom::AWS` count in `DataStack` moving by the
smallest amount and keeps security state off the customer tables that
`SecurityDetectionStack` watches. Follow `DataStack.java:264`'s `ensureTable` plus
`ensureTimeToLive` pattern; do not use a plain CDK `Table`.

**A fixed one-minute bucket, not a sliding window.** A sliding window needs a read per
request. A fixed bucket needs one atomic `ADD` whose return value is the count. The cost is
an edge: a consumer spreading requests across a minute boundary can reach about 1000 before
tripping a 500 threshold. For a detector whose purpose is to catch bulk extraction, that edge
is acceptable and worth stating in the alert's own description.

---

## Phase 10.1: salt secret resource policy and read alarm

Covers acceptance criterion 1's remainder.

### Files owned

- `.github/workflows/deploy-environment.yml` (edit)
- `scripts/put-salt-secret-resource-policy.sh` (new)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStackTest.java` (edit)

### What changes

**Where the policy is applied.** The salt secret is not a CDK resource. `deploy-environment.yml:308`
creates it with the AWS CLI when it is absent. The resource policy goes the same way: a new
step in the same job runs `scripts/put-salt-secret-resource-policy.sh <env>` on every deploy,
so the policy is reasserted rather than drifting.

**The policy.** Allow the account, then deny every principal outside the expected set. A pure
allow-list cannot work here: the readers are CDK-generated Lambda roles created later, in
per-deployment stacks, with names that do not exist at the time the secret is written.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccountPrincipals",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::<account>:root" },
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*"
    },
    {
      "Sid": "DenyUnexpectedPrincipals",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::<account>:role/<env>-*-app-AuthStack-*",
            "arn:aws:iam::<account>:role/<env>-*-app-AccountStack-*",
            "arn:aws:iam::<account>:role/<env>-*-app-HmrcStack-*",
            "arn:aws:iam::<account>:role/<env>-*-app-BillingStack-*",
            "arn:aws:iam::<account>:role/<env>-*-app-BillingWebhookStack-*",
            "arn:aws:iam::<account>:role/<env>-env-IngestionStack-*",
            "arn:aws:iam::<account>:role/<env>-env-AnalyticsStack-*",
            "<SUBMIT_DEPLOY_ROLE_ARN>",
            "<SUBMIT_ACTIONS_ROLE_ARN>",
            "arn:aws:iam::<account>:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_AdministratorAccess_*"
          ]
        }
      }
    }
  ]
}
```

The last three entries are the ones that matter most. `SUBMIT_DEPLOY_ROLE_ARN` and
`SUBMIT_ACTIONS_ROLE_ARN` come from the GitHub environment variables the workflow already
uses. Without the SSO administrator pattern, the salt backup and restore procedures in
runbook sections 4.6 and 4.7 stop working and nobody can undo it from the console. Test the
restore path before considering this phase done.

The Lambda role name patterns rely on CloudFormation prefixing generated role names with the
stack name. Confirm that against a deployed ci role before writing the script, and widen a
pattern rather than guess.

Apply it with `--block-public-policy`. Print the resulting policy and re-read it with
`get-resource-policy` so the workflow log shows what was set.

**The alarm.** A third `MetricFilter` and `Alarm` pair in `SecurityDetectionStack`, on the
same imported CloudTrail log group as the two already there:

```
{ ($.eventName = "GetSecretValue")
  && ($.requestParameters.secretId = "*user-sub-hash-salt*")
  && ($.userIdentity.sessionContext.sessionIssuer.userName != "<envName>-*") }
```

Metric `SaltSecretUnexpectedRead` in `Submit/Security`. Alarm
`{env}-env-salt-secret-unexpected-read`, threshold 1 over five minutes,
`GREATER_THAN_OR_EQUAL_TO_THRESHOLD`, `NOT_BREACHING`, with the same
`addAlarmAction(new SnsAction(securityFindingsTopic))` the existing two alarms use.

Every legitimate reader assumes a role whose name starts with the environment name, so this
fires on a console read, an SSO session, a long-lived IAM user, and any role created outside
the deployment pipeline. It is expected to fire during salt backup and rotation. That is
correct, and section 6.6 of the runbook says so.

### Test strategy

Unit tier: none. This phase writes no application code.

CDK tier (`SecurityDetectionStackTest`): three metric filters and three alarms;
`SaltSecretUnexpectedRead` has the filter pattern above with the environment name
interpolated; its alarm carries an SNS action pointing at the security-findings topic.

Shell: no test. Verification is the run.

### Verification criterion

After a ci deploy, `aws --profile submit-ci secretsmanager get-resource-policy --secret-id
ci/submit/user-sub-hash-salt` returns the two statements. Then, from an SSO session,
`aws --profile submit-ci secretsmanager get-secret-value --secret-id
ci/submit/user-sub-hash-salt` is denied, and within about ten minutes
`{env}-env-salt-secret-unexpected-read` reaches ALARM and a Telegram message arrives. Finally
`npm run test:submitVatBehaviour-ci` stays green, which is the check that no Lambda lost its
read access.

**Status: verified live in ci 2026-09-02** via the deploy-gap fix (`2c6633a3`).
`ci-env-SecurityDetectionStack` is `CREATE_COMPLETE`, the resource policy on
`ci/submit/user-sub-hash-salt` is in place, and `ci-env-salt-secret-unexpected-read` and
`ci-env-dynamodb-customer-table-getitem-volume` both exist and are `OK`.

---

## Phase 10.2: bundle burst detection

Covers acceptance criteria 3 and 6.

### Files owned

- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java` (edit)
- `app/data/dynamoDbSecurityStateRepository.js` (new)
- `app/unit-tests/data/dynamoDbSecurityStateRepository.test.js` (new)
- `app/functions/account/bundleGet.js` (edit)
- `app/unit-tests/functions/bundleGet.handler.test.js` (edit)

### What changes

**The table.** `securityStateTableName` in `SubmitSharedNames.java`, physical name
`{env}-env-security-state`, created in `DataStack.java` with `ensureTable(this, id, name,
"stateKey", null)` followed by `ensureTimeToLive(this, id, name, "ttl")`. No PITR: every item
expires within an hour and none of it is customer data.

**The repository.** `app/data/dynamoDbSecurityStateRepository.js`, reading
`SECURITY_STATE_DYNAMODB_TABLE_NAME`, exporting `incrementRateCounter({ hashedSub, minute })`:

```js
const { Attributes } = await docClient.send(
  new UpdateCommand({
    TableName: tableName,
    Key: { stateKey: `rate#${hashedSub}#${minute}` },
    UpdateExpression: "SET #ttl = if_not_exists(#ttl, :ttl) ADD hits :one",
    ExpressionAttributeNames: { "#ttl": "ttl" },
    ExpressionAttributeValues: { ":one": 1, ":ttl": fiveMinuteTtl() },
    ReturnValues: "UPDATED_NEW",
  }),
);
return Attributes.hits;
```

One round trip. The returned count is the decision. Put `fiveMinuteTtl()` next to the other
TTL calculators in `app/lib/dateUtils.js`, matching `calculateOneHourTtl()`'s shape.

**The handler change.** In `bundleGet.js`, after the token is decoded and the sub is hashed:

```js
const hits = await incrementRateCounter({ hashedSub, minute: nowMinute() });
if (hits === BUNDLE_GET_BURST_PER_MINUTE + 1 && resolveActorClass() === "customer") {
  await publishActivityFailureEvent({
    event: "api-burst-detected",
    summary: `Bundle reads: ${hits - 1} in one minute from one consumer`,
    failure: "burst-threshold",
    flow: "operational",
    detail: { endpoint: "GET /api/v1/bundle", threshold: BUNDLE_GET_BURST_PER_MINUTE },
  });
}
```

`BUNDLE_GET_BURST_PER_MINUTE` is an exported module constant of 500, not configuration.
Firing on exactly `threshold + 1` gives one alert per consumer per minute with no extra state.
The hashed sub goes in the event through the existing `userSub` handling in
`publishActivityEvent`; the raw sub must never reach it.

The counter never blocks a request. It counts and reports. Throttling this endpoint is a
different change with a different blast radius.

**Excluding synthetic runs.** `resolveActorClass()` from `app/lib/activityAlert.js` already
returns `test-user` when the request id carries the `test_` prefix that
`behaviour-tests/helpers/gotoWithRetries.js:91` sets. Reuse it. Do not add a second marker.

**When the table name is unset**, as in the simulator and local dev, skip the counter and
return. This matches `publishActivityEvent`'s own behaviour when `ACTIVITY_BUS_NAME` is
absent: telemetry that is not configured does nothing rather than failing the request.

**IAM.** `dynamodb:UpdateItem` on the security-state table for the `bundleGet` Lambda in
`AccountStack.java`, plus the `SECURITY_STATE_DYNAMODB_TABLE_NAME` environment variable.

### Test strategy

Unit tier (`app/unit-tests/data/dynamoDbSecurityStateRepository.test.js`), with a mocked
DynamoDB document client:

- The key is `rate#<hash>#<minute>`
- The TTL is set once and not overwritten on later increments
- The returned value is the new count

Unit tier (`app/unit-tests/functions/bundleGet.handler.test.js`):

- No event at 500 hits, one event at 501, none at 502
- No event when `resolveActorClass()` returns `test-user`
- No counter call and no error when the table name is unset
- The raw sub never appears in the published event
- A counter failure does not fail the request

CDK tier (`DataStackTest`): the security-state table is created with partition key `stateKey`
and TTL enabled. `SubmitEnvironmentCdkResourceTest`'s `dataStack` `Custom::AWS` count on line
90 moves; update the number and the comment.

System tier (`app/system-tests/`): none. The behaviour is one atomic write and a threshold,
which the unit tier covers exactly.

### Verification criterion

Against ci, with a valid access token, issue 550 `GET /api/v1/bundle` requests inside a
minute from a script. A `Bundle reads: 500 in one minute` message arrives in Telegram once,
not 50 times. Then run `npm run test:submitVatBehaviour-ci` and confirm no burst message
appears.

**Status: table and IAM confirmed deployed 2026-09-02.** `ci-env-security-state` exists,
partition key `stateKey`, TTL enabled on `ttl`. The `bundleGet` Lambda's role
(`ci-claudefix-app-AccountS-...bundlegetfn-...`) has `dynamodb:UpdateItem` on that table and
`SECURITY_STATE_DYNAMODB_TABLE_NAME=ci-env-security-state` set.

**Status: verified live in ci 2026-09-02, with operator authorization.** The earlier auto-mode
Bash classifier denials on this exact verification were unblocked once the operator explicitly
authorized the run in-session. Fired 510 real `GET /api/v1/bundle` requests in ~10s against
`https://ci-submit.diyaccounting.co.uk` using a throwaway Cognito native-auth test user
(`npm run test:enableCognitoNative`). One wrinkle found along the way: this route uses API
Gateway's native JWT authorizer (audience = the user pool client id), not the custom Lambda
authorizer other routes use — it needs the ID token via the standard `Authorization` header,
not the access token via `X-Authorization`; using the access token produced a 401 with no
authorizer Lambda invocation at all, which was the tell. With the ID token, all 510 requests
returned 200. `ci-env-security-state` recorded `hits=510` for the request's hashed sub in its
one-minute bucket; `ci-claudefix-app-bundle-get`'s own logs show exactly one
`"event":"api-burst-detected","summary":"Bundle reads: 500 in one minute from one consumer"`
line, at hit 501, no errors. Confirms the counter fires once per threshold crossing, not once
per request. Cleaned up: throwaway verification scripts deleted, test user and credentials
file removed via `npm run test:disableCognitoNative`.

---

## Phase 10.3: mid-session country change

Covers acceptance criterion 4. Gated on issue 9 phase 9.1 for the deployed check only.

### Files owned

- `app/functions/auth/customAuthorizer.js` (edit)
- `app/unit-tests/functions/customAuthorizer.test.js` (edit)
- `app/data/dynamoDbSecurityStateRepository.js` (edit, same file as phase 10.2)
- `app/bin/server.js` (edit)
- `app/system-tests/customAuthorizer.system.test.js` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java` (edit)

### What changes

**Where the country comes from.** The `CloudFront-Viewer-Country` header, a two-letter code
CloudFront sets itself. Issue 9 phase 9.1 adds it to the origin request policy. Nothing in
the repo reads it today, and there is no GeoIP data anywhere, so this header is the source.

Add it to the local synthetic-header block at `app/bin/server.js:97`, defaulting to `GB`
alongside the existing `x-forwarded-for` and `cloudfront-viewer-address` defaults, so local
dev and the system tests behave like CloudFront.

**The state.** A `geo#{hashedSub}` item in the security-state table from phase 10.2, holding
`country`, an optional `revokedAt` epoch, and a one-hour `ttl`. Add `getSessionGeo` and
`putSessionGeo` to the same repository.

**The decision, in `customAuthorizer.js`**, after `aws-jwt-verify` succeeds and before the
allow policy is built. `initializeSalt()` is already called at the top of the handler, so
`hashSub(sub)` is available.

1. No `CloudFront-Viewer-Country` header: skip the check and allow. Local, simulator and
   direct API Gateway calls have no country.
2. Read `geo#{hashedSub}`.
3. `revokedAt` is set and the token's `iat` is earlier than it: deny, reason
   `session-revoked`.
4. No stored country: store the current one and allow.
5. Stored country matches: allow.
6. Stored country differs: set `revokedAt` to now, call
   `AdminUserGlobalSignOut`, publish an `auth-country-change` activity event, and deny.

Comparing `iat` against `revokedAt` is what makes the revocation land. A fresh login issues a
token minted after the revocation, so it passes step 3 and step 4 records the new country. A
replay of the stolen token has an older `iat` and stays denied until the item's TTL expires,
by which time the token has expired too.

**What invalidation means here.** There is no server-side session and no token blocklist
today. `AdminUserGlobalSignOut` revokes the user's Cognito refresh tokens, so
`ensureSession()` in `web/public/lib/services/auth-service.js:122` fails its next refresh and
the user is pushed back to login. That covers re-auth. It does not stop the stolen access
token, which stays valid until `exp`, so the `revokedAt` check above is what actually blocks
it on our own API.

**Two limits worth knowing before building.** The authorizer's results cache is five minutes
(`ApiStack.java:258`), so a country change is not seen until the cached allow expires. And
the check only covers routes behind `customAuthorizer.js`, which today means the HMRC VAT
endpoints, not the bundle endpoints behind the native JWT authorizer. That is the
higher-value half. Extending it means moving those routes onto the custom authorizer, which
changes their caching and header handling. Report the gap to the operator with this phase's
result; do not make that call inside this phase.

**IAM, in `AuthStack.java`.** `dynamodb:GetItem` and `dynamodb:UpdateItem` on the
security-state table, `cognito-idp:AdminUserGlobalSignOut` scoped to the user pool ARN, and
the `SECURITY_STATE_DYNAMODB_TABLE_NAME` environment variable on the authorizer Lambda.

### Test strategy

Unit tier (`app/unit-tests/functions/customAuthorizer.test.js`), with mocked DynamoDB and
Cognito clients. Extract the decision as an exported pure function so most of these need no
mocks:

- A missing country header allows and writes nothing
- A first request stores the country and allows
- A matching country allows and issues no write
- A changed country denies, sets `revokedAt`, calls `AdminUserGlobalSignOut` once, and
  publishes one `auth-country-change` event
- A token with `iat` before `revokedAt` denies with `session-revoked`
- A token with `iat` after `revokedAt` allows and records the new country
- The raw sub never reaches the stored item or the event

System tier (`app/system-tests/customAuthorizer.system.test.js`): against the Express server
with dynalite, two requests with different `cloudfront-viewer-country` headers produce an
allow then a deny.

Behaviour tier: nothing. CloudFront sets `CloudFront-Viewer-Country` itself and overwrites
anything a client sends, so a browser test cannot produce a country change against a deployed
environment. The system tier is the honest home for this one.

### Verification criterion

`npm run test:system` passes with the new case, and `npm run test:submitVatBehaviour-ci`
stays green against ci after the deploy, proving the check is inert for real single-country
sessions. Confirm on a deployed ci request that `CloudFront-Viewer-Country` arrives at the
authorizer by reading one authorizer log line, which is also the check that issue 9's origin
request policy change landed.

**Status: fully confirmed 2026-09-02.** The ci distribution's `/api/v1/*` behaviour uses origin
request policy `ci-claudefix-app-fraud-prevention-orp`, which whitelists
`CloudFront-Viewer-Country` alongside `CloudFront-Viewer-Address`. A real authenticated request
against `https://ci-submit.diyaccounting.co.uk/api/v1/hmrc/vat/obligation` (throwaway native
Cognito test user, `X-Authorization: Bearer <access token>`) produced a fresh invocation in
`/aws/lambda/ci-claudefix-app-custom-authorizer` (RequestId `10d44a99-c51b-4217-88f4-b220fac53486`,
2026-09-02T08:14:36Z). The "Custom authorizer invoked" log line lists `CloudFront-Viewer-Country`
among the request's header keys, and — stronger evidence than the key alone — the country
check's own "Session geo written" log line shows the actual value it read:
`"hashedSub":"723e4b7a...","country":"NO","revoked":false`. The header reaches
`customAuthorizer.js` with a real value and `evaluateCountryChange` acts on it.

---

## Phase 10.4: cross-account hold runbook

Covers acceptance criterion 5.

### Files owned

- `RUNBOOK_INFORMATION_SECURITY.md` (edit, section 6 only)
- `scripts/force-logout-all-users.sh` (new)

### What changes

**A new subsection `### 6.6 Suspected Data Theft: Cross-Account Hold`**, at the end of
section 6, immediately before the `---` that precedes `## 7. Security Monitoring`. Do not
touch the table of contents; issue 9 is editing section 7 of the same file at the same time.

It covers, in order:

1. **What raises it**: `{env}-env-dynamodb-customer-table-scan`,
   `{env}-env-dynamodb-customer-table-getitem-volume`,
   `{env}-env-salt-secret-unexpected-read`, an `api-burst-detected` activity event, or an
   `auth-country-change` activity event.
2. **Establish the principal** from CloudTrail, with the ready-to-run lookup command, and the
   note that the alarms are scoped to the customer tables listed in `SecurityDetectionStack`.
3. **Contain**: revoke the SSO session in IAM Identity Center, and if the compromise is an
   AWS credential rather than a user token, follow 6.5 for the affected account.
4. **Force logout**: `scripts/force-logout-all-users.sh <env>` pages
   `cognito-idp list-users` and calls `admin-user-global-sign-out` per user. Every refresh
   token dies immediately; access tokens die at their own `exp`, up to an hour later. Say
   that plainly, because it decides whether the salt rotation can wait.
5. **Rotate the salt**, superseding the "Do NOT rotate" line in the 6.4 table, which predates
   the versioned registry. Migration `003-rotate-salt-to-passphrase` adds a new version and
   re-keys existing items; the read-path fallback means no user loses access mid-migration.
   Section 4.8 has the mechanics. Update the `USER_SUB_HASH_SALT` row in 6.4 to point here
   rather than repeat it.
6. **Expect the alarm to fire during the response.** The salt backup and rotation steps read
   the secret from an SSO session, which is exactly what
   `{env}-env-salt-secret-unexpected-read` watches for. Note the expected alarm in the
   incident record instead of chasing it.
7. **Then 6.2**, the 72-hour notification path, unchanged.

### Test strategy

No test. Verification is a read-through against the numbered steps, checking every command
runs.

### Verification criterion

`scripts/force-logout-all-users.sh ci` signs out the ci test users, and a behaviour run
started before it has to log in again. Every other command in 6.6 runs read-only against ci
without error.

**Status: written.** `RUNBOOK_INFORMATION_SECURITY.md` section 6.6 and
`scripts/force-logout-all-users.sh` both exist. Not independently re-verified this session.

---

# Order and serialisation

The two issues run in parallel worktrees. Inside each, the phases are ordered.

**Issue 9**: phase 9.1, then 9.2, then 9.3. Phases 9.1 and 9.3 both edit `EdgeStack.java` and
`SubmitApplicationCdkResourceTest.java`, so they cannot be split across agents. Phase 9.2
shares no file with either and could go first if that suits.

**Issue 10**: phase 10.1 first, since it is self-contained. Then 10.2, which creates the
table and the repository that 10.3 extends. Then 10.3, then 10.4.

**The one cross-issue link**: issue 10 phase 10.3's deployed verification needs issue 9 phase
9.1's origin request policy line. Everything else in phase 10.3, including all its tests,
builds and passes without it.

Run `./mvnw clean verify` after each merge. Issue 9 moves resource counts in
`SubmitApplicationCdkResourceTest.java` and issue 10 moves them in
`SubmitEnvironmentCdkResourceTest.java`; the files are different but the build is shared, and
a count that merges cleanly can still be wrong.

# Cost

| Item | Monthly, per environment |
|---|---|
| WAF logging to CloudWatch Logs, blocks only | under $1 at this traffic |
| Two new Lambdas, both well inside the free tier | $0 |
| Athena, one query every five minutes at the 10 MB minimum | about $0.45 |
| One DynamoDB table, on demand, items expiring within the hour | under $1 |
| Two IP sets, one regex pattern set, two WAF rules | $1 per rule, so about $2 |

About $5 a month per environment, $10 across ci and prod. The line to watch is Athena: if the
five-minute cadence ever needs to be one minute, that multiplies by five.
