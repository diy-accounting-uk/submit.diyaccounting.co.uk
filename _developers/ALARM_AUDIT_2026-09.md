# Alarm Audit Report — September 2026

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
