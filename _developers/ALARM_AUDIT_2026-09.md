<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Alarm Audit Report — September 2026

## Re-count, 2026-09-15: the seven days after B30j and B30k reached prod

**Window**: 2026-09-06 to 2026-09-13 (w1), with the 2026-09-13 to 2026-09-15 20:00 UTC tail (w2)
shown beside it. **Source**: `cloudwatch describe-alarm-history` (StateUpdate items: 10,666 on
submit-prod, 12,813 on submit-ci), `gh run list --workflow deploy.yml` (121 runs in w1: 71 success,
31 failure, 19 cancelled; 46 in w2). A fire is a transition into ALARM; "in deploy" means inside a
`deploy.yml` run plus 30 minutes. Baseline is the 90-day table below: 5 alarms fired, all
environment-level detections, none inside a deploy window, and no Lambda health check ever fired.

**Prod, 74 fires in nine days (64 in w1, 10 in w2), 55 of them inside deploy windows.** The
alarm-to-issue Lambda opened 32 issues in the same span, none of them for ci (B30k held).

| Family | w1 | w2 | in deploy | Verdict | Earns |
|---|---|---|---|---|---|
| prod-env-dynamodb-customer-table-scan | 6 | 2 | 2 | quieter: the hourly fire (00:52 to 05:51 on 2026-09-06) stopped when B30j reached prod at 07:00; the two later fires (25 scans at 12:52 on 2026-09-13, 3 at 23:39) are sessions scanning the table | keep |
| prod-env-cis-unauthorized-api-calls | 15 | 1 | 12 | louder, new since the CIS alarms landed on 2026-09-08; 12 of 16 fires sit inside deploys, the rest are 1 to 4 AccessDenied calls an hour apart | tune (proposed 30z) |
| prod-env-cis-iam-policy-changes | 12 | 0 | 12 | louder, new; every fire is a deploy's own IAM change | tune (proposed 30z) |
| prod-env-cis-s3-bucket-policy-changes | 6 | 0 | 6 | louder, new; every fire is a deploy | tune (proposed 30z) |
| prod-env-cis-route-table-changes | 6 | 0 | 6 | louder, new; every fire is a deploy | tune (proposed 30z) |
| prod-app-api-5xx | 4 | 2 | 4 | louder against a baseline of 0; one fire per fresh prod set inside its deploy (6c85118, c6e18fd, c6d0ed3, 4600d25), then two real ones (e371587 at 23:38 on 2026-09-13; 70b0a8e at 16:36 on 2026-09-15, the operator snapshot 500, B52v) | investigate the in-deploy fire (proposed 30aa) |
| check-* Lambda log-errors and errors (bundle-capacity-reconcile 3+3, interest-post 1+1, pass-post 1, operator-snapshot-get 2) | 9 | 2 | 9 | louder against a baseline of 0; each is a real error in code that shipped that week, and each has a landed fix or an open row (B52v) | keep |
| prod-env-github-probe-failed | 1 | 1 | 1 | unchanged: two probe failures, both during a deploy that rolled the apex back | keep |
| prod-env-analytics-nightly-failed | 2 | 0 | 1 | quieter after the two 03:22 fires on 2026-09-10 and 2026-09-11; silent since | keep |
| prod-env-hmrc-submission-failure | 1 | 0 | 0 | unchanged: one real customer failure at 14:23 on 2026-09-09 | keep |
| prod-env-operator-snapshot-publish-errors | 0 | 1 | 0 | new nightly job's first prod run (B52y.2) | keep |
| prod-env-cis-console-signin-without-mfa | 0 | 1 | 0 | one fire, the filter fixed on prod (B30x) | keep |
| prod-env-cost-focus-copy-errors, prod-env-raw-export-publish-errors | 1+1 | 0 | 2 | new nightly jobs' first runs on 2026-09-10 | keep |

**ci, 116 fires**: the same four CIS families lead (58 fires, 49 in deploys), then ci-app-api-5xx
(14, all in deploys, the same per-set pattern as prod), ci-env-salt-secret-unexpected-read (7, all in
w2 deploys, from the ci sets' own test users), self-destruct log errors (6, the DELETE_FAILED
ApiStack, NEXT.md B167), github-probe-failed (6), and the rest single fires. None opened an issue.

**What the two fixes did.** B30j ended the hourly customer-table-scan fire: 6 fires in the six
hours before it reached prod, 0 from the hourly reconcile in the eight days after. B30k ended ci
issues: 0 ci-titled issues against 32 for prod. The 90-day baseline's five firing families are down
to two still firing (customer-table-scan on real scans, and the nightly-missed family's successor
analytics-nightly-failed, twice). What replaced them is the CIS set, which did not exist in the
baseline and fires on the deploy pipeline's own changes: 39 of prod's 55 in-deploy fires are CIS.

**Proposed rows** (no alarm changed here):

- **30z, tune the four CIS detection filters to exclude the deploy role.** `iam-policy-changes`,
  `s3-bucket-policy-changes` and `route-table-changes` fired only inside deploys, and 12 of 16
  `unauthorized-api-calls` fires did. The metric filters match every CloudTrail event; add a clause
  excluding `userIdentity.sessionContext.sessionIssuer.arn` of the GitHub Actions deploy role, and
  for `unauthorized-api-calls` the deploy role and the Lambda execution roles' expected AccessDenied
  probes, in `SecurityDetectionStack` for both accounts. Removes about 40 fires and 11 issues a
  week. Sonnet, ~2 files.
- **30aa, find the 5xx a fresh set answers during its own deploy.** Every new prod and ci set fired
  `app-api-5xx` once inside its deploy window and never again until real traffic broke something.
  Read one set's API Gateway access log for the minute the alarm names (e.g. prod-4600d25 at 14:00
  on 2026-09-09) and say which route answered 5xx and to whom (the probe, the canary, or the alias
  warm-up); then either fix the cause or start the alarm's evaluation after the set is promoted.
  Sonnet, ~2 files.

**Outcomes, 2026-09-15 22:00 UTC, from the alarm histories, CloudTrail and the access log:**

- **30z is already landed; no filter changed.** The deploy-role exclusion on the four families
  (`aebbfc49`, 2026-09-10 14:46 UTC, on prod that evening) ended the infrastructure-change fires:
  the last OK-to-ALARM was `iam-policy-changes` 2026-09-09 18:47 UTC, `route-table-changes`
  18:53 UTC, `s3-bucket-policy-changes` 23:57 UTC. `unauthorized-api-calls` kept firing on two
  real permission gaps, each since granted: `prod-env-data-quality-eval`'s Glue session denied
  `logs:CreateLogGroup` eleven times a night at 02:16 UTC (2026-09-10, 09-11; granted by
  `4511dd09`, 2026-09-11) and `prod-env-alarm-triage-role` denied `bedrock:ListInferenceProfiles`
  (2026-09-11 02:18 and 02:28 UTC; `85227772`, 2026-09-11) then `logs:DescribeMetricFilters`
  (2026-09-13 12:59 UTC; B30w, `8efc0173`). Nothing has fired since 2026-09-13 13:02 UTC. The
  family stays as it is: every remaining fire was a denial worth fixing at its own layer.

**Date**: 2026-09-03  
**Environment**: prod (account 972912397388, region eu-west-2)  
**Audit period**: 90 days (2026-06-05 to 2026-09-03)  
**Source**: CloudWatch API (146 alarm histories fetched), GitHub Actions API (81 deploy runs)

## Executive Summary

| Metric | Count |
|--------|-------|
| Total metric alarms | 146 |
| Alarms never transitioned state | 3 |
| Alarms with state changes | 143 |
| Alarms that transitioned to ALARM | 5 |
| Lambda health checks that reached ALARM | 0 |
| Async worker checks that reached ALARM | 0 |

## Alarm State Transitions — Full 90-Day Classification

### By Alarm Type and State History

| Check Type | Never Changed | Changed (OK only) | Transitioned to ALARM | Total |
|------------|---------------|-------------------|-----------------------|-------|
| Errors (check-*, Lambda app) | 0 | 24 | 0 | 24 |
| Errors (check-*, environment) | 0 | 3 | 0 | 3 |
| Throttles (check-*, Lambda + env) | 0 | 27 | 0 | 27 |
| P95 Duration (check-*, Lambda + env) | 0 | 27 | 0 | 27 |
| Log Errors (check-*, Lambda + env) | 0 | 27 | 0 | 27 |
| DLQ Not Empty (AsyncApiLambda) | 0 | 5 | 0 | 5 |
| Queue Message Age (AsyncApiLambda) | 0 | 5 | 0 | 5 |
| Worker Errors (AsyncApiLambda) | 0 | 5 | 0 | 5 |
| Other (OpsStack/Observability/Security) | 3 | 11 | 5 | 19 |
| **Totals** | **3** | **138** | **5** | **146** |

### Alarms That Transitioned to ALARM State

Five alarms transitioned to ALARM outside deploy windows. All are observability/detection alarms:

| # | Alarm Name | Metric | Threshold | Statistic | Period | Fire Count | Date Range | GitHub Issue |
|---|------------|--------|-----------|-----------|--------|-----------|------------|------------|
| 1 | prod-env-analytics-nightly-missed | ExecutionsStarted | <1 | Sum | 26 hours | 1 | 2026-09-02 02:52 | #91 |
| 2 | prod-env-dynamodb-customer-table-scan | DynamoDbCustomerTableScan | >=1 | Sum | 5 min | 47 | 2026-09-02 03:01–14:11 | #95 |
| 3 | prod-env-ga4-report-pull-errors | Errors | >=1 | Sum | 24 hours | 1 | 2026-08-30 04:16 | no prod-env issue |
| 4 | prod-env-salt-secret-unexpected-read | SaltSecretUnexpectedRead | >=1 | Sum | 5 min | 17 | 2026-09-02 06:13–2026-09-03 14:07 | #97 |
| 5 | prod-env-scan-detect-404-missed | Invocations | <1 | Sum | 30 min | 1 | 2026-09-02 03:04 | #96 |

**Lambda health checks**: zero transitions to ALARM. All 24 Lambda application errors, 27 throttles, 27 p95 duration, 27 log-errors, plus 3 environment-level checks (errors, throttles, p95, log-errors), plus all 15 AsyncApiLambda checks (5 DLQ + 5 queue-age + 5 worker-errors) remained in OK or INSUFFICIENT_DATA.

### Zero-State-Change Alarms

Three alarms never transitioned state from INSUFFICIENT_DATA:

| Alarm | Type |
|-------|------|
| prod-ca55da7-app-api-5xx | Other |
| prod-ca55da7-app-api-failed | Other |
| prod-env-rum-js-errors | Other |

## Deploy Windows — 90 Days

GitHub Actions `deploy.yml` workflow on main (81 total runs):

| Status | Count | Date Range | Avg Duration |
|--------|-------|-----------|--------------|
| success | 15 | 2026-08-24 to 2026-09-03 | ~47 min |
| failure | 44 | 2026-06-06 to 2026-09-01 | ~48 min |
| cancelled | 22 | 2026-06-23 to 2026-09-01 | ~3 min |

Recent activity (Sept 1–3): 6 successful deploys, 0 failures, 0 cancellations.

## Canary and Probe Test Schedule

### CloudWatch Synthetics Canaries (OpsStack)
- Health canary: rate(51 minutes) — checks main page loads
- API canary: rate(51 minutes) — checks API endpoints

### GitHub Actions Probe Test (`probe-test.yml`)
- Schedule: `57 */4 * * *` (every 4 hours at minute 57 UTC: 00:57Z, 04:57Z, 08:57Z, 12:57Z, 16:57Z, 20:57Z)

### GitHub Probe Test Alarm (`prod-ca55da7-app-github-probe-failed`)
- Metric: behaviour-test (dimension test=submitVatBehaviour)
- Threshold: >= 1 (Minimum statistic)
- Period: 2 hours
- Evaluation: 1 period
- TreatMissingData: BREACHING

Canaries run every 51 minutes (~10.6 cycles per 9 hours); GitHub probe runs every 4 hours (~1 per 9 hours). The 2-hour alarm window captures 0–2 canary runs.

## Alarms Referenced in Runbooks and Routing

### RUNBOOK_INFORMATION_SECURITY.md
References:
- `{deployment}-app-{stack}-stack-health` and `{env}-env-{stack}-stack-health` (composite Lambda health)
- `{env}-env-salt-secret-unexpected-read` (SecurityDetectionStack — included in the 5 firing alarms above)

### EventBridge Alarm Routing (OpsStack lines 374–386)

**AlarmStateChangeRule** pattern: matches `{deployment}-` or `{env}-env-` prefixes. Check-* alarms (lacking both prefixes) are excluded from this routing; they feed into stack-level composite health alarms only.

**Targets**: Telegram forwarder Lambda + optional alarm-to-GitHub-issue Lambda.

## Observations

1. **141 of 146 alarms never transitioned to ALARM in 90 days**: 24 Lambda applications × 4 checks = 96 Lambda health alarms; 3 environment-level × 4 checks = 12 environment health alarms; 15 AsyncApiLambda extras (5 DLQ + 5 queue-age + 5 worker-errors); 3 "other" alarms never transitioned from INSUFFICIENT_DATA; 11 other alarms transitioned to OK only.

2. **Five observability/detection alarms fired to ALARM; four have open GitHub issues**: prod-env-dynamodb-customer-table-scan (#95, 47 fires over 35 hours), prod-env-salt-secret-unexpected-read (#97, 17 fires over 32 hours), prod-env-analytics-nightly-missed (#91, 1 fire), prod-env-scan-detect-404-missed (#96, 1 fire), and prod-env-ga4-report-pull-errors (1 fire, no prod-env issue). Zero fires from the 108 Lambda/environment health checks (errors, throttles, p95, log-errors).

3. **15 successful + 44 failed + 22 cancelled deploys in 90 days; zero ALARM transitions coinciding with deploys**: Alarm evaluation periods (datapointsToAlarm ranging 1–3 by type) and Telegram forwarder's 3-period evaluation window (Lambda.java lines 230–233) produced no spurious ALARM transitions within deploy windows or 30 minutes after completion.
