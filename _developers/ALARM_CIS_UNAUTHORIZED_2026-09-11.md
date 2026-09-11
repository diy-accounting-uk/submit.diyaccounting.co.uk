# Alarm: prod-env-cis-unauthorized-api-calls, 2026-09-11 02:17 UTC (issue #181)

## What the metric filter matches

`CisUnauthorizedApiCalls` (namespace `Submit/Security`) is CIS AWS Foundations
Benchmark control CloudWatch.1, defined in `SecurityDetectionStack.java`. Its
metric filter reads the prod CloudTrail log group
(`/aws/cloudtrail/prod-env-cloud-trail`) for:

```
(errorCode = "*UnauthorizedAccess*" OR errorCode = "AccessDenied*")
AND NOT (an AssumedRole session whose sessionIssuer.userName is
         cdk-hnb659fds-*, submit-prod-deployment-role, or
         submit-prod-github-actions-role)
```

So it fires on any `AccessDenied`/`UnauthorizedAccess` API error from anyone
except CDK's own bootstrap role and the two deploy pipeline roles. Any other
principal's own denied calls, including our other scheduled service roles,
count.

## What was refused

Two unrelated principals, both our own automation, were denied in the
02:12-02:30 UTC window that this alarm covers:

**1. `prod-env-data-quality-eval` (Glue job runner role), 02:16:08-02:17:19 UTC, 11 calls**

```
CreateLogGroup AccessDenied: User: arn:aws:sts::972912397388:assumed-role/prod-env-data-quality-eval/GlueJobRunnerSession
is not authorized to perform: logs:CreateLogGroup on resource:
arn:aws:logs:eu-west-2:972912397388:log-group:/aws-glue/jobs/logs-v2
because no identity-based policy allows the logs:CreateLogGroup action
```

This is AWS Glue's own attempt to set up continuous CloudWatch logging for
the ephemeral job run behind the nightly data-quality-ruleset evaluation
(`prod-env-data-quality-eval`, the 02:15 nightly schedule). The role's policy
(`DataQuality.java`, `evaluationRole`) grants `glue:*`, `s3:GetObject`, and a
scoped `cloudwatch:PutMetricData`, but no `logs:*` actions at all.

The denial did not stop the job: CloudTrail for the same role in the same
window shows `GetDataQualityRulesetEvaluationRun`, `GetTable`,
`GetPartitions` and six `PublishDataQualityResult` calls, all successful.
The evaluation ran and published its results; only the optional continuous-
logging setup failed. The same pattern (`CreateLogGroup` denied,
`02:16:xx` UTC) also appears on 2026-09-10, so this recurs every night the
job runs and will keep tripping this alarm.

**2. `prod-env-alarm-triage-role` (GitHub Actions), 02:18:29 and 02:28:33 UTC, 1 call each**

```
ListInferenceProfiles AccessDenied: User: arn:aws:sts::972912397388:assumed-role/prod-env-alarm-triage-role/GitHubActions
is not authorized to perform: bedrock:ListInferenceProfiles on resource:
arn:aws:bedrock:eu-west-2:972912397388:inference-profile/*
because no identity-based policy allows the bedrock:ListInferenceProfiles action
```

Both calls came from our own alarm-triage automation (`alarm-triage.yml`,
`CLAUDE_CODE_USE_BEDROCK=1`) resolving the Bedrock model to use. The first is
the triage run for this same alarm (issue #181, workflow run started
02:17:32); the second is the triage run for issue #182
(`prod-env-analytics-nightly-failed`, unrelated alarm, run started 02:27:44).
Both workflow runs completed successfully despite the denial, so this call
is non-fatal to triage. The role's policy in `ObservabilityStack.java`
(`InvokeTriageModel` statement) grants `bedrock:InvokeModel` and
`InvokeModelWithResponseStream` on specific foundation-model and
inference-profile ARNs, plus `ApplyGuardrail` on the guardrail ARN, but
nothing for `ListInferenceProfiles`.

Nothing external and no unrecognised principal appears anywhere in the
02:10-02:32 UTC CloudTrail window.

## Verdict

Benign — no external or unexpected access, both denials are our own
automation hitting incomplete grants — but two missing grants worth adding,
since each recurs on its own schedule and will keep firing this alarm:

1. `prod-env-data-quality-eval` needs `logs:CreateLogGroup`,
   `logs:CreateLogStream`, `logs:PutLogEvents` on
   `arn:aws:logs:eu-west-2:972912397388:log-group:/aws-glue/jobs/logs-v2:*`
   (add in `DataQuality.java`, `evaluationRole`'s policy).
2. `prod-env-alarm-triage-role` needs `bedrock:ListInferenceProfiles`
   (resource `*` — it is a list operation, not resource-scoped) on the
   `InvokeTriageModel` statement or a new statement in
   `ObservabilityStack.java`.

Issue #182 (`prod-env-analytics-nightly-failed`, same night) is a separate
alarm on the same pipeline family; not investigated here.
