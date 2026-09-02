# Composite health alarms for Lambda stacks

Design for backlog item B30, cut 3. `REPORT_ALARM_AUDIT.md` holds the audit that produced it.

`Lambda.java` gives every Lambda construct four alarms: `check-{fn}-errors`,
`check-{fn}-throttles`, `check-{fn}-high-duration-p95` and `check-{fn}-log-errors`. None of them
has an SNS action. They reach Telegram and the GitHub-issue Lambda through `OpsStack.java`, an
EventBridge rule that matches `CloudWatch Alarm State Change` events by alarm-name prefix.

One broken function used to produce four Telegram messages and four GitHub issues. Every deploy
produced four more per function, because each new alarm emits an `INSUFFICIENT_DATA` to `OK`
transition when CloudFormation creates it.

## The design in force: one composite per stack

Each stack that builds Lambda constructs also builds one `CompositeAlarm` over every check of
every function it owns. `Lambda.stackHealthAlarm` does the fan-in. The composite is named
`{resourceNamePrefix}-{stackShortName}-stack-health`, so it carries the deployment or environment
prefix the routing rule already matches, and the four children keep the `check-` prefix and stay
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

A composite alarm costs $0.50 a month, a standard alarm $0.10. The 151 children stay, because
they are the terms of the composite's rule. Per-stack costs about $4 a month across the estate.
The Telegram title names the stack, so read `state.reason` to find which function broke.

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

returns four times the deployment's Lambda-construct count.

Then prove the routing, which needs operator approval because it writes to AWS:

```bash
aws --profile submit-ci cloudwatch set-alarm-state \
  --alarm-name check-<deployment>-app-<fn>-throttles \
  --state-value ALARM --state-reason "routing check"
```

Exactly one Telegram message arrives. It names `<deployment>-app-<stack>-stack-health`, and its
`state.reason` names the child that tripped. No second message arrives when a second child of the
same stack is set to ALARM while the composite is still in ALARM. Reset both children with
`--state-value OK` and confirm one recovery message.

## Open: whether all four checks earn their keep

That is the change that would actually cut the bill, and it needs alarm history the audit could
not read. The live check recorded in `NEXT.md` found about 45 app alarms with no state change in
90 days. Pulling `describe-alarm-history` per check across a prod quarter is the input.

## Open: the async pairs

`AsyncApiLambda.java` adds three more alarms on top of the four it inherits: `{dlq}-not-empty`,
`{worker}-errors` and `{queue}-message-age`. Five pairs use it, two in `AccountStack` and three in
`HmrcStack`. Those three still notify individually. Folding them into their stack's composite is
the natural follow-up, but the queue and DLQ are shared state rather than per-function health, so
it needs its own decision about whether a stuck queue and a broken worker raise one alert or two.
