# Composite health alarms for Lambda stacks

Design for backlog item B30, cut 3. `REPORT_ALARM_AUDIT.md` holds the audit that produced it.

`Lambda.java` gives every Lambda construct two alarms: `check-{fn}-errors` and
`check-{fn}-log-errors`. `AsyncApiLambda.java` adds three more to an async pair:
`check-{dlq}-not-empty`, `check-{worker}-errors` and `check-{queue}-message-age`. None of them has
an SNS action. They reach Telegram and the GitHub-issue Lambda through `OpsStack.java`, an
EventBridge rule that matches `CloudWatch Alarm State Change` events by alarm-name prefix.

One broken function used to produce a Telegram message and a GitHub issue per alarm. Every deploy
produced another set per function, because each new alarm emits an `INSUFFICIENT_DATA` to `OK`
transition when CloudFormation creates it.

## The design in force: one composite per stack

Each stack that builds Lambda constructs also builds one `CompositeAlarm` over every check of
every function it owns. `Lambda.stackHealthAlarm` does the fan-in. The composite is named
`{resourceNamePrefix}-{stackShortName}-stack-health`, so it carries the deployment or environment
prefix the routing rule already matches, and the children keep the `check-` prefix and stay
outside it.

Eight composites cover a prod deployment:

| Level | Composite |
|---|---|
| app | `{deployment}-app-auth-stack-health` |
| app | `{deployment}-app-hmrc-stack-health` |
| app | `{deployment}-app-account-stack-health` |
| app | `{deployment}-app-billing-stack-health` |
| app | `{deployment}-app-ops-stack-health` |
| app | `{deployment}-app-edge-stack-health` |
| env | `{env}-env-analytics-stack-health` |
| env | `{env}-env-billing-webhook-stack-health` |

A ci deployment adds `{deployment}-app-self-destruct-stack-health`.

A composite alarm costs $0.50 a month, a standard alarm $0.10. The children stay, because they are
the terms of the composite's rule. The Telegram title names the stack, so read `state.reason` to
find which function broke.

**The EventBridge pattern does not change.** This is the part that needs saying plainly, because
the obvious design does not work. EventBridge treats a list of matchers on one field as OR, and
gives no AND for a single field. You cannot write "starts with the deployment prefix AND does not
end with `-errors`" against `detail.alarmName`. Moving the negation to another field does not help
either: `resources` carries the alarm ARN, which ends with the same name, and a suffix exclusion
there would also silence `IngestionStack`, `AnalyticsDashboard`, `DataQuality` and the async
worker alarms, which all end `-errors` and all still need to notify. The only discriminator that
touches exactly the alarms we mean is the name itself. So the routing contract lives in
`Lambda.java`'s naming and is enforced by a CDK test, not by the rule.

**No app code changes.** `activityTelegramForwarder.js` reads the environment from
`alarmName.match(/^(ci|prod)-/)`, and `alarmToGithubIssue.js` titles issues `[ALARM] {alarmName}`.
The composite name keeps the prefix and both keep working.

## The checks each stack composite fans in

Two per Lambda construct, one for each way a function can be broken: `check-{fn}-errors` when the
invocation itself failed, `check-{fn}-log-errors` when it returned a response and logged something
that went wrong, which is what a handler's caught-and-returned 500 looks like. `check-{fn}-throttles`
and `check-{fn}-high-duration-p95` are gone: a throttle at this traffic level is not reachable and
surfaces as an API 5xx anyway, and p95 near timeout is a leading indicator for a timeout that
arrives as an error.

Three more on an async pair, all one alert: `check-{dlq}-not-empty`, `check-{worker}-errors` and
`check-{queue}-message-age`. A stuck queue and a broken worker are the same incident from two
angles and share one response, so they raise the stack's composite once and its `state.reason`
names which of the three tripped.

## Verification criterion

After the ci deploy:

```bash
aws --profile submit-ci cloudwatch describe-alarms --alarm-types CompositeAlarm \
  --query 'CompositeAlarms[].AlarmName'
```

returns one `-stack-health` name per stack that owns Lambda functions, and

```bash
aws --profile submit-ci cloudwatch describe-alarms --alarm-name-prefix check- \
  --query 'length(MetricAlarms)'
```

returns twice the deployment's Lambda-construct count plus three per async pair.

Then prove the routing, which needs operator approval because it writes to AWS:

```bash
aws --profile submit-ci cloudwatch set-alarm-state \
  --alarm-name check-<deployment>-app-<fn>-errors \
  --state-value ALARM --state-reason "routing check"
```

Exactly one Telegram message arrives. It names `<deployment>-app-<stack>-stack-health`, and its
`state.reason` names the child that tripped. No second message arrives when a second child of the
same stack is set to ALARM while the composite is still in ALARM. Reset both children with
`--state-value OK` and confirm one recovery message.

## Canary and probe schedule

Both Synthetics canaries run `cron(27 * * * ? *)`. `probe-test.yml` runs `57 */4 * * *`, so a
canary run always sits half an hour either side of a probe run and the offset cannot drift the
way `rate(51 minutes)` did. Hourly keeps two datapoints inside the canary alarms' 2-hour period.

The GitHub probe alarm itself lives in the environment-level `ObservabilityStack`, not the
per-deployment `OpsStack`, so one alarm survives every deployment instead of each deployment
spawning its own against the same environment-wide `behaviour-test` metric. Its period is 5
hours: longer than the 4-hour probe cron, so every rolling window is guaranteed a datapoint
regardless of clock alignment, unlike the old 2-hour period which missed one by construction on
about half of all windows.
