# Composite alarms for Lambda health

Design for backlog item B30, cut 3. `REPORT_ALARM_AUDIT.md` holds the audit that produced it.
Cuts 1 and 2 are on main; this is the remainder.

`Lambda.java:122-203` gives every Lambda construct four alarms: `{fn}-errors`,
`{fn}-throttles`, `{fn}-high-duration-p95` and `{fn}-log-errors`. None of them has an SNS
action. They reach Telegram and the GitHub-issue Lambda through `OpsStack.java:353`, an
EventBridge rule that matches `CloudWatch Alarm State Change` events by alarm-name prefix.

There are 28 Lambda-construct instantiation sites in the CDK today, three of them behind
config flags. One broken function can therefore produce four Telegram messages and four
GitHub issues. Every deploy of a stack produces four more, because each new alarm emits an
`INSUFFICIENT_DATA` to `OK` transition when CloudFormation creates it.

This plan adds one `CompositeAlarm` per function over those four alarms, and routes only the
composite. The four keep evaluating and stay in the console for debugging. They stop
notifying.

## Where the 28 constructs are

Counted from `new Lambda(`, `new ApiLambda(` and `new AsyncApiLambda(` call sites.
`ApiLambda extends Lambda` and `AsyncApiLambda extends ApiLambda`, so all three get the four
alarms.

| Stack | Level | Constructs | Conditional |
|---|---|---:|---|
| `AuthStack` | app | 2 | |
| `HmrcStack` | app | 5 | |
| `AccountStack` | app | 12 | `supportTicketPost` (GitHub token), `interestPost` (feedback flag) |
| `BillingStack` | app | 3 | |
| `OpsStack` | app | 2 | `alarmToGithubIssue` (GitHub token) |
| `SelfDestructStack` | app | 1 | whole stack |
| `AnalyticsStack` (incl. `TableChangeDelivery`) | env | 2 | |
| `BillingWebhookStack` | env | 1 | whole stack |

The audit said 27. The difference is one conditional site; both numbers describe real
configurations. Nothing in this plan depends on the exact total.

## Decisions

**The composite is named `{ingestFunctionName}-health`.** The function name already carries
the deployment or environment prefix, so `OpsStack`'s existing rule matches the composite with
no pattern change.

**The four children move to a reserved name prefix, `check-`.** `check-{fn}-errors`,
`check-{fn}-throttles`, `check-{fn}-high-duration-p95`, `check-{fn}-log-errors`. That name
does not start with `{deploymentPrefix}-` or `{envPrefix}-`, so the routing rule stops
matching it.

**The EventBridge pattern does not change.** This is the part that needs saying plainly,
because the obvious design does not work. EventBridge treats a list of matchers on one field
as OR, and gives no AND for a single field. You cannot write "starts with the deployment
prefix AND does not end with `-errors`" against `detail.alarmName`. Moving the negation to
another field does not help either: `resources` carries the alarm ARN, which ends with the
same name, and a suffix exclusion there would also silence `IngestionStack`,
`AnalyticsDashboard`, `DataQuality` and the async worker alarms, which all end `-errors` and
all still need to notify. The only discriminator that touches exactly the 112 alarms we mean
is the name itself. So the routing contract lives in `Lambda.java`'s naming and is enforced
by a CDK test, not by the rule.

**Both targets are one rule.** `OpsStack.java:346-365` builds a single `AlarmStateChangeRule`
with the Telegram forwarder and the alarm-to-GitHub-issue Lambda as two targets. There is no
second rule to change.

**No app code changes.** `activityTelegramForwarder.js:161` reads the environment from
`alarmName.match(/^(ci|prod)-/)`, and `alarmToGithubIssue.js` titles issues `[ALARM]
{alarmName}`. The composite name keeps the prefix and both keep working. Issues raised from
now on are titled `[ALARM] {fn}-health`, so any open issue titled `[ALARM] {fn}-errors` is
orphaned and someone should close it by hand.

## What this costs

A composite alarm is $0.50 a month. A standard alarm is $0.10. The children stay, because
they are the terms of the composite's rule, so this adds $0.50 per function and removes
nothing.

| Environment | Change |
|---|---|
| prod, one deployment | about +$14 a month |
| ci, at `AWS_COSTS.md`'s 0.18 average concurrent deployments | about +$4 a month |

The audit's arithmetic assumed the composite replaces the four alarms. It does not. What the
change buys is signal: one Telegram message and one GitHub issue per function-health event
instead of up to four, and one deploy-time state change per function instead of four. A
25-function deployment currently emits up to 100 Telegram messages as its alarms settle after
a deploy. That drops to 25.

**The alternative, if the money matters more than the attribution.** One composite per stack
instead of per function gives 8 composites across the whole estate, about $4 a month, and
still collapses the notifications. The cost is that the Telegram title names the stack, and
you have to read `state.reason` to find which function broke. Per-function is what this plan
builds. Say so before implementation starts if per-stack is wanted instead.

**What this plan does not decide.** Whether all four checks earn their keep is the change that
would actually cut the bill, and it needs alarm history the audit could not read. The live
check recorded in `NEXT.md` found about 45 app alarms with no state change in 90 days. Pulling
`describe-alarm-history` per check across a prod quarter is the input; that work is not in
this pass.

---

# Phase 1: composite health alarm per Lambda construct

**Model: Sonnet.** The shape is written out below.

## Files owned

- `infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java` (edit)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` (edit: the comment above
  `AlarmStateChangeRule` only)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (edit)
- `infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java` (edit)
- `RUNBOOK_INFORMATION_SECURITY.md` (edit: the alarm-name table in 7.1)
- `_developers/backlog/ALARM_VALIDATION_STRATEGY.md` (edit: the alarm-name columns)

Do not touch `AsyncApiLambda.java`, `IngestionStack.java`, `analytics/AnalyticsDashboard.java`,
`analytics/DataQuality.java`, `SecurityDetectionStack.java` or `EdgeStack.java`. Their alarms
keep their names and keep notifying individually.

## What changes

### `Lambda.java`

Two constants at the top of the class, so the tests can assert against the same strings:

```java
/** Alarm names starting with this are terms of a composite and are not routed to Telegram or GitHub. */
public static final String CHECK_ALARM_NAME_PREFIX = "check-";

public static final String HEALTH_ALARM_NAME_SUFFIX = "-health";
```

The four existing `Alarm.Builder` calls keep every metric, threshold, comparison operator,
`treatMissingData` and description they have. Two things change. Each `alarmName(...)` gains
the `CHECK_ALARM_NAME_PREFIX` prefix, and each builder's result is assigned to a local
variable instead of being discarded:

```java
Alarm errorsAlarm = Alarm.Builder.create(scope, props.idPrefix() + "-ErrorsAlarm")
        .alarmName(CHECK_ALARM_NAME_PREFIX + props.ingestFunctionName() + "-errors")
        // everything else unchanged
        .build();
```

Same for `throttlesAlarm`, `highDurationP95Alarm` and `logErrorsAlarm`. The construct ids
(`props.idPrefix() + "-ErrorsAlarm"` and friends) do not change, so CloudFormation updates the
existing resources rather than replacing the whole set.

Leave the metric filter alone. Its namespace stays `Submit/LambdaLogs` and its metric name
stays `{fn}-log-errors`. Only the alarm's name moves. Renaming the metric would orphan the
existing custom metric and break any dashboard reading it.

Then one composite, after the four:

```java
CompositeAlarm.Builder.create(scope, props.idPrefix() + "-HealthAlarm")
        .compositeAlarmName(props.ingestFunctionName() + HEALTH_ALARM_NAME_SUFFIX)
        .alarmRule(AlarmRule.anyOf(errorsAlarm, throttlesAlarm, highDurationP95Alarm, logErrorsAlarm))
        .alarmDescription("Health check failed for function " + this.ingestLambda.getFunctionName()
                + ": errors, throttles, p95 duration near timeout, or error-like log lines")
        .build();
```

New imports: `software.amazon.awscdk.services.cloudwatch.AlarmRule` and
`software.amazon.awscdk.services.cloudwatch.CompositeAlarm`. Both are stable in CDK 2.266.0.
`Alarm` implements `IAlarm`, which extends `IAlarmRule`, so the four alarms pass straight into
`anyOf`.

Set no alarm actions and no `actionsSuppressor`. The composite reaches Telegram the same way
every other alarm in this account does, through the EventBridge rule.

Do not expose the composite as a public field. Nothing reads it.

### CloudFormation behaviour on the first deploy

`AlarmName` is a physical name, so renaming the four children replaces them. The old and new
names differ, so there is no uniqueness clash during the update. Each replaced alarm and each
new composite emits one `INSUFFICIENT_DATA` to `OK` transition, and the four replaced ones no
longer match the routing rule, so the deploy produces one Telegram message per function rather
than four. Alarm history on the four children starts over. That is the cost of the rename and
it is worth stating in the PR body.

### `OpsStack.java`

The rule itself is unchanged. Replace the comment at lines 336-345 so the naming contract is
written down where the rule is:

> This rule is created once per app deployment, and the `alarmName` filter scopes it to alarms
> this deployment owns plus this environment's shared alarms, which no single deployment owns.
>
> Alarm names beginning `check-` are deliberately outside both prefixes. They are the four
> per-function checks in `Lambda.java`, which exist as the terms of that function's
> `{fn}-health` composite alarm. The composite carries the prefix and notifies; its children do
> not, so one broken function raises one message instead of four. EventBridge cannot AND a
> prefix match with a suffix exclusion on one field, so the split is carried by the names.
> `SubmitApplicationCdkResourceTest` enforces it.

### Docs

`RUNBOOK_INFORMATION_SECURITY.md` section 7.1: replace the three Lambda rows with one.

| Detection | Alarm Name Pattern | Response |
|---|---|---|
| Lambda health (errors, throttles, slow, log errors) | `{env}-submit-*-health` | Open the composite in CloudWatch, read which child check is in ALARM, then follow that check's logs |

`_developers/backlog/ALARM_VALIDATION_STRATEGY.md`: prefix the `{fn}-...` entries in its alarm
tables with `check-`, and note that the routed alarm is `{fn}-health`. The validation approach
in that doc does not otherwise change: forcing a child into ALARM is still how you prove a
check works, and now it also proves the composite fans in.

## Test strategy

Unit tier: nothing. This phase writes no application code.

System, browser and behaviour tiers: nothing. No HTTP surface and no UI.

CDK tier. Add one helper to `SubmitApplicationCdkResourceTest` and call it from both resource
tests:

```java
static void assertLambdaHealthAlarms(Template template, int expectedConstructs, List<String> routedPrefixes)
```

It asserts, for one stack template:

1. `template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", expectedConstructs)`.
2. Every `AWS::CloudWatch::CompositeAlarm` has an `AlarmName` ending
   `Lambda.HEALTH_ALARM_NAME_SUFFIX` and starting with one of `routedPrefixes`. A composite
   the rule cannot match is a silent alarm.
3. The number of `AWS::CloudWatch::Alarm` resources whose `AlarmName` starts with
   `Lambda.CHECK_ALARM_NAME_PREFIX` is exactly `4 * expectedConstructs`.
4. No alarm name starting with `CHECK_ALARM_NAME_PREFIX` starts with any of `routedPrefixes`.
   This is the assertion that stops a future rename from quietly restoring the double
   notification.

`routedPrefixes` is read from the synthesized `OpsStack` template, not hardcoded: find the
`AWS::Events::Rule` whose `Name` ends `-alarm-state-change` and pull the `prefix` values out of
its `EventPattern.detail.alarmName` list. Both the alarm names and the rule prefixes are
literal strings in the template, so no intrinsic-function handling is needed.

Expected construct counts, for the props these tests already build:

| Template | Composites | `check-` alarms |
|---|---:|---:|
| `authStack` | 2 | 8 |
| `hmrcStack` | 5 | 20 |
| `accountStack` | 11 | 44 |
| `billingStack` | 3 | 12 |
| `selfDestructStack`, when non-null | 1 | 4 |
| `analyticsStack` | 2 | 8 |
| `billingWebhookStack`, when non-null | 1 | 4 |

The account count is 11 because that stack's 13 Lambda functions include two async workers,
which are not Lambda constructs, and `supportTicketPost` is off in this configuration. The
comment above the existing `resourceCountIs("AWS::Lambda::Function", 13)` explains the same
arithmetic; keep the two comments consistent.

`opsStack` gets assertions 2, 3 and 4 but no absolute count. Its second Lambda construct
depends on whether a GitHub token ARN is configured, and pinning a number there makes the test
fail for a reason that has nothing to do with alarms.

These counts do not move: `SubmitEnvironmentCdkResourceTest`'s
`ingestion.resourceCountIs("AWS::CloudWatch::Alarm", 4)`, `IngestionStackTest`'s 4 and 6,
`SecurityDetectionStackTest`'s 2 and 0, `AnalyticsDashboardTest`'s 2, `DataQualityTest`'s 3.
None of those stacks or constructs uses the `Lambda` construct. If one of them changes, the
change is wrong.

Run `./mvnw clean verify` before pushing. Both resource tests are in its scope.

## Verification criterion

After the ci deploy:

```bash
aws --profile submit-ci cloudwatch describe-alarms --alarm-types CompositeAlarm \
  --query 'CompositeAlarms[].AlarmName'
```

returns one `-health` name per Lambda construct in the deployment, and

```bash
aws --profile submit-ci cloudwatch describe-alarms --alarm-name-prefix check- \
  --query 'length(MetricAlarms)'
```

returns four times that number.

Then prove the routing, which needs operator approval because it writes to AWS:

```bash
aws --profile submit-ci cloudwatch set-alarm-state \
  --alarm-name check-<deployment>-app-<fn>-throttles \
  --state-value ALARM --state-reason "routing check"
```

Exactly one Telegram message arrives. It names `{fn}-health`, not `check-{fn}-throttles`, and
its `state.reason` names the child that tripped. No second message arrives when a second child
of the same function is set to ALARM while the composite is still in ALARM. Reset both
children with `--state-value OK` and confirm one recovery message.

---

# Not in this pass: the async pairs

`AsyncApiLambda.java` adds three more alarms on top of the four it inherits: `{dlq}-not-empty`,
`{worker}-errors` and `{queue}-message-age`. Five pairs use it, two in `AccountStack` and three
in `HmrcStack`.

After this phase an async pair notifies through its `{ingestFn}-health` composite plus those
three, so four signals instead of seven. Folding the remaining three into a per-pair composite
is the natural follow-up. It is a different shape, because the queue and DLQ are shared state
rather than per-function health, and it needs its own decision about whether a stuck queue and
a broken worker should raise one alert or two. Design it separately.
