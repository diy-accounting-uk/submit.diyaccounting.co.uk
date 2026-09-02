# Alarm Validation Strategy

> **Status:** Planning
> **Author:** Claude Code
> **Created:** 2025-01-22
> **Last Updated:** 2025-01-22
> **Original Request:** Consider a test strategy for all alarms configured in this repository (CDK in ./infra). Run in CI doing chaos monkey stuff, mutation testing, threshold lowering, or AWS API manipulation. Check alarm state before/after. Focus on: code quality gate testing, secret detection, service downtime detection, throttling (WAF), and data breach detection. Run in CI (destructive) and non-destructively in prod for manual drills.
>
> **Scope Additions:**
> - Ability to simulate and drill all runbook scenarios
> - Comprehensive code review to ensure all monitoring gaps are identified
> - Gold standard practices documentation

---

## Executive Summary

This document outlines a test strategy for validating the ~20 CloudWatch alarms, 6 EventBridge security rules, and synthetic canaries configured in the `./infra` CDK stacks. The strategy uses a combination of:

1. **Chaos injection** - Deliberately break things to trigger alarms
2. **Threshold manipulation** - Temporarily lower thresholds for easy triggering
3. **AWS API manipulation** - Force alarm states via `SetAlarmState`
4. **Traffic injection** - Send specific patterns to trigger WAF/security rules

Two execution modes:
- **CI Mode** (destructive): Full chaos testing in `ci` environment
- **Drill Mode** (non-destructive): AWS API state changes only in `prod`

---

## Current Alarm Inventory

### Lambda Alarms (per function × 4 alarms each, `check-` prefixed)
Every check in a stack feeds that stack's one `{prefix}-{stack}-stack-health` composite alarm, which
is the one that actually routes to Telegram/GitHub. Forcing a `check-` alarm into ALARM still
proves the individual check works, and now also proves the composite fans in.

| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `check-{fn}-errors` | ≥1 error/5min | Mutation testing, chaos injection |
| `check-{fn}-throttles` | ≥1 throttle/5min | Reserved concurrency + load |
| `check-{fn}-high-duration-p95` | ≥80% timeout | Slow code injection |
| `check-{fn}-log-errors` | ≥1 ERROR pattern/5min | Log injection |

### API Gateway Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-api-5xx` | ≥1 5xx/5min | Lambda mutation, chaos |

### WAF Alarms (Edge Stack, us-east-1)
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-waf-rate-limit` | ≥50 blocks/5min | High-frequency requests |
| `{prefix}-waf-attack-signatures` | ≥5 blocks/5min | SQLi/XSS payloads |
| `{prefix}-waf-known-bad-inputs` | ≥5 blocks/5min | Malformed inputs |

### Synthetic Canary Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-health-failed` | <90% success/5min | Break web endpoint |
| `{prefix}-api-failed` | <90% success/5min | Break API endpoint |
| `{prefix}-github-synthetic-failed` | ≥1 (2hr window, missing=breaching) | Skip synthetic workflow |

### RUM Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{prefix}-rum-lcp-p75` | >4s LCP | Slow asset injection |
| `{prefix}-rum-js-errors` | ≥5 errors/5min | JS error injection |

### Async/SQS Alarms
| Alarm | Threshold | Testable Via |
|-------|-----------|--------------|
| `{queue}-not-empty` (DLQ) | >1 message | Fail queue processor |

### Security EventBridge Rules → SNS
| Rule | Trigger | Testable Via |
|------|---------|--------------|
| GuardDuty findings | Any finding | Simulated finding |
| Security Hub findings | Any imported finding | CIS check failure |
| IAM policy changes | Create/Attach/Put policy | Test policy creation |
| Security group changes | Authorize/Revoke ingress/egress | Test SG modification |
| Access key creation | CreateAccessKey | Test key creation |
| Root account activity | Root API calls | Not testable (don't use root) |

---

## Level 1: Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflow                         │
│  ┌──────────────────────┐  ┌──────────────────────┐               │
│  │   CI Mode (ci env)   │  │ Drill Mode (prod)    │               │
│  │   - Full chaos       │  │ - SetAlarmState only │               │
│  │   - Mutation deploy  │  │ - Non-destructive    │               │
│  │   - Traffic injection│  │ - Manual trigger     │               │
│  └──────────────────────┘  └──────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
           ┌─────────────────┐           ┌─────────────────┐
           │ Pre-test Phase  │           │ Chaos/Drill     │
           │ - Record states │           │ - Execute tests │
           │ - Validate SNS  │           │ - Wait periods  │
           └─────────────────┘           └─────────────────┘
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                          ┌─────────────────┐
                          │ Post-test Phase │
                          │ - Verify alarms │
                          │ - Check SNS     │
                          │ - Generate report│
                          │ - Restore state │
                          └─────────────────┘
```

---

## Level 2: Test Categories & Jobs

### Job 1: `code-quality-gate-testing`
**Focus:** Lambda error detection, log-based error detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| Lambda throws exception | Deploy mutant with `throw new Error()` | `check-{fn}-errors` → ALARM |
| Lambda logs ERROR | Deploy mutant with `console.error('ERROR')` | `check-{fn}-log-errors` → ALARM |
| Lambda timeout | Deploy mutant with `await sleep(30000)` | `check-{fn}-high-duration-p95` → ALARM |
| API 5xx response | Break API Lambda | `{prefix}-api-5xx` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Deploy mutant Lambda
    run: |
      # Inject error into Lambda code
      sed -i 's/return response/throw new Error("CHAOS_TEST")/g' app/functions/example.js
      npm run deploy:ci
  - name: Invoke Lambda
    run: aws lambda invoke --function-name $FN_NAME /dev/null
  - name: Wait for alarm
    run: sleep 300  # Wait for 5-min evaluation period
  - name: Verify alarm state
    run: |
      STATE=$(aws cloudwatch describe-alarms --alarm-names "${FN_NAME}-errors" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 2: `secret-detection`
**Focus:** Security event detection, data exfiltration patterns

| Test | Method | Expected Result |
|------|--------|-----------------|
| IAM policy creation | `aws iam create-policy` (test policy) | EventBridge → SNS |
| Access key creation | `aws iam create-access-key` (test user) | EventBridge → SNS |
| Security group modification | `aws ec2 authorize-security-group-ingress` | EventBridge → SNS |

**CI Implementation:**
```yaml
steps:
  - name: Create test IAM policy
    run: |
      aws iam create-policy \
        --policy-name "alarm-test-policy-$(date +%s)" \
        --policy-document '{"Version":"2012-10-17","Statement":[]}' \
        --tags Key=Purpose,Value=AlarmTest
  - name: Wait for EventBridge propagation
    run: sleep 60
  - name: Verify SNS notification received
    run: |
      # Check CloudWatch Logs for SNS delivery to security topic
      aws logs filter-log-events \
        --log-group-name "sns/$REGION/$ACCOUNT/security-findings" \
        --filter-pattern "alarm-test-policy"
  - name: Cleanup
    run: aws iam delete-policy --policy-arn $POLICY_ARN
```

### Job 3: `service-downtime-detection`
**Focus:** Synthetic canaries, health check alarms

| Test | Method | Expected Result |
|------|--------|-----------------|
| Health endpoint down | Return 500 from health Lambda | `{prefix}-health-failed` → ALARM |
| API endpoint down | Return 500 from API Lambda | `{prefix}-api-failed` → ALARM |
| GitHub synthetic gap | Skip synthetic-test workflow | `{prefix}-github-synthetic-failed` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Deploy broken health endpoint
    run: |
      # Inject 500 response
      sed -i 's/statusCode: 200/statusCode: 500/g' app/functions/health.js
      npm run deploy:ci
  - name: Wait for canary failure (2 evaluation periods)
    run: sleep 600
  - name: Verify alarm state
    run: |
      STATE=$(aws cloudwatch describe-alarms --alarm-names "${PREFIX}-health-failed" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 4: `throttling-waf`
**Focus:** WAF rate limiting, attack pattern detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| Rate limit | 2500 requests in <5min from single IP | `{prefix}-waf-rate-limit` → ALARM |
| SQLi detection | Requests with `' OR 1=1 --` | `{prefix}-waf-attack-signatures` → ALARM |
| XSS detection | Requests with `<script>alert(1)</script>` | `{prefix}-waf-attack-signatures` → ALARM |
| Bad inputs | Requests with known malicious payloads | `{prefix}-waf-known-bad-inputs` → ALARM |

**CI Implementation:**
```yaml
steps:
  - name: Generate attack traffic
    run: |
      # SQLi payloads (will be blocked by WAF)
      for i in $(seq 1 10); do
        curl -s "${BASE_URL}/api/test?id=' OR 1=1 --" || true
        curl -s "${BASE_URL}/api/test" -d "name=<script>alert(1)</script>" || true
      done
  - name: Wait for metric aggregation
    run: sleep 300
  - name: Verify WAF alarm (us-east-1)
    run: |
      STATE=$(aws cloudwatch describe-alarms --region us-east-1 \
        --alarm-names "${PREFIX}-waf-attack-signatures" \
        --query 'MetricAlarms[0].StateValue' --output text)
      [ "$STATE" = "ALARM" ] || exit 1
```

### Job 5: `data-breach-detection`
**Focus:** GuardDuty, Security Hub, anomaly detection

| Test | Method | Expected Result |
|------|--------|-----------------|
| GuardDuty finding | Use GuardDuty sample findings API | EventBridge → SNS |
| Security Hub finding | Import sample finding | EventBridge → SNS |
| Unusual API pattern | Make atypical API calls | GuardDuty detection |

**CI Implementation:**
```yaml
steps:
  - name: Generate GuardDuty sample findings
    run: |
      DETECTOR_ID=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
      aws guardduty create-sample-findings --detector-id $DETECTOR_ID \
        --finding-types "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B"
  - name: Wait for finding propagation
    run: sleep 120
  - name: Verify SNS notification
    run: |
      # Check that security findings topic received the event
      # This requires SNS subscription confirmation and log checking
```

---

## Level 3: Implementation Details

### 3.1 Workflow File Structure

```yaml
# .github/workflows/alarm-validation.yml
name: alarm-validation
run-name: "Alarm Validation [${{ inputs.mode }}] - ${{ github.ref_name }}"

on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'Test mode'
        required: true
        type: choice
        options:
          - 'ci'      # Full chaos testing
          - 'drill'   # Non-destructive prod drill
      categories:
        description: 'Test categories (comma-separated)'
        required: false
        type: string
        default: 'all'
        # Options: code-quality,secret-detection,downtime,throttling,data-breach
  schedule:
    - cron: '0 3 * * 0'  # Weekly Sunday 3am UTC (CI mode)

permissions:
  id-token: write
  contents: read

env:
  # ... standard AWS config ...

jobs:
  setup:
    runs-on: ubuntu-24.04
    outputs:
      alarm-states-before: ${{ steps.record.outputs.states }}
      deployment-name: ${{ steps.names.outputs.deployment-name }}
    steps:
      - name: Record alarm states before test
        id: record
        run: |
          aws cloudwatch describe-alarms \
            --alarm-name-prefix "${PREFIX}" \
            --query 'MetricAlarms[*].{Name:AlarmName,State:StateValue}' \
            > /tmp/alarm-states-before.json
          echo "states=$(cat /tmp/alarm-states-before.json | jq -c)" >> $GITHUB_OUTPUT

  code-quality-gate:
    needs: [setup]
    if: contains(inputs.categories, 'code-quality') || inputs.categories == 'all'
    # ... test implementation ...

  secret-detection:
    needs: [setup]
    if: contains(inputs.categories, 'secret-detection') || inputs.categories == 'all'
    # ... test implementation ...

  downtime-detection:
    needs: [setup]
    if: contains(inputs.categories, 'downtime') || inputs.categories == 'all'
    # ... test implementation ...

  throttling-waf:
    needs: [setup]
    if: contains(inputs.categories, 'throttling') || inputs.categories == 'all'
    # ... test implementation ...

  data-breach-detection:
    needs: [setup]
    if: contains(inputs.categories, 'data-breach') || inputs.categories == 'all'
    # ... test implementation ...

  verify-and-restore:
    needs: [code-quality-gate, secret-detection, downtime-detection, throttling-waf, data-breach-detection]
    if: always()
    steps:
      - name: Compare alarm states
        run: |
          # Verify expected alarms triggered
          # Generate report
      - name: Restore alarm states (drill mode only)
        if: inputs.mode == 'drill'
        run: |
          # Use SetAlarmState to restore OK state
```

### 3.2 Drill Mode (Non-Destructive)

For production drills, we only use AWS API state manipulation:

```bash
# Force alarm to ALARM state
aws cloudwatch set-alarm-state \
  --alarm-name "${PREFIX}-api-5xx" \
  --state-value ALARM \
  --state-reason "Drill test - validating SNS notification pipeline"

# Wait and verify SNS delivery
sleep 60

# Check that SNS topic received notification
# (Requires SNS subscription to a verifiable endpoint)

# Restore to OK
aws cloudwatch set-alarm-state \
  --alarm-name "${PREFIX}-api-5xx" \
  --state-value OK \
  --state-reason "Drill test complete"
```

### 3.3 Mutation Testing Framework

Create a lightweight mutation framework:

```javascript
// scripts/alarm-validation/mutators.js
const mutations = {
  'throw-error': {
    pattern: /return\s+\{[\s\S]*statusCode:\s*200/,
    replacement: 'throw new Error("ALARM_VALIDATION_CHAOS"); return { statusCode: 200',
  },
  'slow-response': {
    pattern: /exports\.handler\s*=\s*async/,
    replacement: 'exports.handler = async (event) => { await new Promise(r => setTimeout(r, 25000)); return (async',
  },
  'log-error': {
    pattern: /console\.log/,
    replacement: 'console.error("ERROR ALARM_VALIDATION_TEST"); console.log',
  },
  'return-500': {
    pattern: /statusCode:\s*200/,
    replacement: 'statusCode: 500',
  },
};
```

### 3.4 Test Verification Script

```javascript
// scripts/alarm-validation/verify-alarms.js
const { CloudWatchClient, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');

async function verifyAlarmTransitions(expectedTransitions) {
  const client = new CloudWatchClient({});
  const results = [];

  for (const { alarmName, expectedState } of expectedTransitions) {
    const response = await client.send(new DescribeAlarmsCommand({
      AlarmNames: [alarmName],
    }));

    const actualState = response.MetricAlarms[0]?.StateValue;
    const passed = actualState === expectedState;

    results.push({
      alarmName,
      expectedState,
      actualState,
      passed,
    });
  }

  return results;
}
```

---

## Level 4: Detailed Test Specifications

### 4.1 Code Quality Gate Tests

#### Test CQ-1: Lambda Error Detection
```yaml
name: Lambda Error Detection
id: CQ-1
category: code-quality-gate
alarm: "check-{functionName}-errors"
preconditions:
  - Alarm in OK state
  - Lambda deployed and invokable
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "throw-error"
  marker: "ALARM_VALIDATION_CQ1"
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 3 times (to ensure metrics)
  - Wait 6 minutes (> 5min evaluation period)
verification:
  - Alarm state = ALARM
  - Alarm reason contains metric breach
  - (Optional) SNS notification received
cleanup:
  - Redeploy original Lambda code
  - Wait for alarm to return to OK
```

#### Test CQ-2: Log-Based Error Detection
```yaml
name: Log-Based Error Detection
id: CQ-2
category: code-quality-gate
alarm: "check-{functionName}-log-errors"
preconditions:
  - Alarm in OK state
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "log-error"
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 3 times
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - CloudWatch Logs Insights shows ERROR pattern
cleanup:
  - Redeploy original Lambda code
```

#### Test CQ-3: Lambda Duration (Approaching Timeout)
```yaml
name: Lambda Duration Alarm
id: CQ-3
category: code-quality-gate
alarm: "check-{functionName}-high-duration-p95"
mutation:
  file: "app/functions/{targetFunction}.js"
  type: "slow-response"
  # Inject 25s delay (Lambda timeout typically 30s, alarm at 80% = 24s)
execution:
  - Deploy mutated Lambda
  - Invoke Lambda 5 times (for p95 significance)
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
```

### 4.2 Secret Detection Tests

#### Test SD-1: IAM Policy Change Detection
```yaml
name: IAM Policy Change Detection
id: SD-1
category: secret-detection
rule: "{prefix}-iam-policy-changes"
topic: "{prefix}-security-findings"
execution:
  - Create IAM policy with test name
    aws iam create-policy --policy-name "alarm-test-$(date +%s)" \
      --policy-document '{"Version":"2012-10-17","Statement":[]}'
  - Wait 2 minutes (EventBridge propagation)
verification:
  - EventBridge rule triggered (CloudWatch Events metrics)
  - SNS topic received message
  - (If email subscription) Alert email received
cleanup:
  - Delete test IAM policy
```

#### Test SD-2: Access Key Creation Detection
```yaml
name: Access Key Creation Detection
id: SD-2
category: secret-detection
rule: "{prefix}-access-key-creation"
execution:
  - Create test IAM user (if not exists)
  - Create access key for test user
  - Wait 2 minutes
verification:
  - EventBridge rule triggered
  - SNS notification sent
cleanup:
  - Delete access key
  - Delete test user
```

### 4.3 Service Downtime Tests

#### Test DT-1: Health Canary Failure
```yaml
name: Health Canary Failure Detection
id: DT-1
category: downtime
alarm: "{prefix}-health-failed"
canary: "{prefix}-health-check"
mutation:
  # Break the health endpoint
  file: "app/functions/health.js"  # or relevant endpoint
  type: "return-500"
execution:
  - Deploy broken health endpoint
  - Wait 12 minutes (2 × 5min evaluation periods + buffer)
verification:
  - Alarm state = ALARM
  - Canary SuccessPercent < 90%
  - SNS notification to alertTopic
cleanup:
  - Redeploy working health endpoint
  - Wait for alarm to return to OK
```

### 4.4 WAF Throttling Tests

#### Test TH-1: Rate Limit Trigger
```yaml
name: WAF Rate Limit Detection
id: TH-1
category: throttling
alarm: "{prefix}-waf-rate-limit"
region: us-east-1  # WAF alarms are in CloudFront region
preconditions:
  - WAF rate limit: 2000 requests/5min/IP
  - Alarm threshold: 50 blocks/5min
execution:
  - Send 2500 requests from single IP in 4 minutes
    for i in {1..2500}; do curl -s "$BASE_URL" &; done; wait
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - WAF BlockedRequests metric > 50
```

#### Test TH-2: SQL Injection Detection
```yaml
name: WAF SQLi Detection
id: TH-2
category: throttling
alarm: "{prefix}-waf-attack-signatures"
execution:
  - Send 10 requests with SQLi payloads
    payloads:
      - "' OR '1'='1"
      - "'; DROP TABLE users; --"
      - "1' AND '1'='1"
  - Wait 6 minutes
verification:
  - Alarm state = ALARM
  - WAF BlockedRequests for CommonRuleSet >= 5
```

### 4.5 Data Breach Detection Tests

#### Test DB-1: GuardDuty Finding Detection
```yaml
name: GuardDuty Finding Detection
id: DB-1
category: data-breach
rule: "{prefix}-guardduty-findings"
execution:
  - Get GuardDuty detector ID
  - Create sample findings
    aws guardduty create-sample-findings \
      --detector-id $DETECTOR_ID \
      --finding-types "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B"
  - Wait 3 minutes
verification:
  - EventBridge rule triggered
  - SNS notification to securityFindingsTopic
cleanup:
  - Archive sample findings
```

---

## Level 5: Operational Procedures

### 5.1 Running CI Mode

```bash
# Trigger via GitHub CLI
gh workflow run alarm-validation.yml \
  -f mode=ci \
  -f categories=all \
  --ref main

# Monitor
gh run watch
```

### 5.2 Running Production Drill

```bash
# Manual trigger - drill mode only
gh workflow run alarm-validation.yml \
  -f mode=drill \
  -f categories=downtime,throttling \
  --ref main

# This will:
# 1. Record current alarm states
# 2. Use SetAlarmState to force ALARM state
# 3. Verify SNS notifications are delivered
# 4. Restore alarm states to original
# 5. Generate drill report
```

### 5.3 Interpreting Results

The workflow generates a JSON report:

```json
{
  "runId": "12345",
  "mode": "ci",
  "timestamp": "2025-01-22T10:00:00Z",
  "results": {
    "code-quality-gate": {
      "CQ-1": { "passed": true, "alarmTriggered": true, "snsDelivered": true },
      "CQ-2": { "passed": true, "alarmTriggered": true, "snsDelivered": true },
      "CQ-3": { "passed": false, "alarmTriggered": false, "reason": "Duration not high enough" }
    },
    "throttling": {
      "TH-1": { "passed": true, "alarmTriggered": true, "blockedRequests": 487 },
      "TH-2": { "passed": true, "alarmTriggered": true, "blockedRequests": 10 }
    }
  },
  "summary": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "skipped": 0
  }
}
```

### 5.4 Known Limitations

1. **GuardDuty sample findings** - Limited to AWS-provided sample types
2. **Root account activity** - Cannot test without using root (don't do this)
3. **RUM alarms** - Require browser-side injection, harder to automate
4. **Cross-region alarms** - WAF alarms in us-east-1 require separate handling
5. **Evaluation periods** - Tests require waiting for CloudWatch evaluation windows

---

## Appendix A: Quick Reference - Where to Look

### Alarm Observability Matrix

| Alarm | Console Location | Logs/Details | SNS Topic | Region |
|-------|------------------|--------------|-----------|--------|
| `check-{fn}-errors` | CloudWatch Alarms | Lambda logs in CloudWatch | None (silent) | eu-west-2 |
| `check-{fn}-throttles` | CloudWatch Alarms | Lambda metrics | None (silent) | eu-west-2 |
| `check-{fn}-high-duration-p95` | CloudWatch Alarms | Lambda metrics, X-Ray | None (silent) | eu-west-2 |
| `check-{fn}-log-errors` | CloudWatch Alarms | Lambda logs (search ERROR) | None (silent) | eu-west-2 |
| `{prefix}-api-5xx` | CloudWatch Alarms | API Gateway logs | None (silent) | eu-west-2 |
| `{prefix}-health-failed` | CloudWatch Alarms | Synthetics canary runs | alertTopic | eu-west-2 |
| `{prefix}-api-failed` | CloudWatch Alarms | Synthetics canary runs | alertTopic | eu-west-2 |
| `{prefix}-github-synthetic-failed` | CloudWatch Alarms | GitHub Actions runs | alertTopic | eu-west-2 |
| `{prefix}-rum-lcp-p75` | CloudWatch Alarms | RUM console | None (silent) | eu-west-2 |
| `{prefix}-rum-js-errors` | CloudWatch Alarms | RUM console | None (silent) | eu-west-2 |
| `{prefix}-waf-rate-limit` | CloudWatch Alarms | WAF sampled requests | None | **us-east-1** |
| `{prefix}-waf-attack-signatures` | CloudWatch Alarms | WAF sampled requests | None | **us-east-1** |
| `{prefix}-waf-known-bad-inputs` | CloudWatch Alarms | WAF sampled requests | None | **us-east-1** |
| `{queue}-not-empty` (DLQ) | CloudWatch Alarms | SQS console, dead letters | None (silent) | eu-west-2 |
| `{prefix}-dynamodb-scan-detected` | CloudWatch Alarms | CloudTrail | securityFindingsTopic | eu-west-2 |
| GuardDuty findings | GuardDuty console | GuardDuty finding details | securityFindingsTopic | eu-west-2 |
| Security Hub findings | Security Hub console | Finding details | securityFindingsTopic | eu-west-2 |
| IAM policy changes | EventBridge | CloudTrail | securityFindingsTopic | eu-west-2 |
| Security group changes | EventBridge | CloudTrail | securityFindingsTopic | eu-west-2 |
| Access key creation | EventBridge | CloudTrail | securityFindingsTopic | eu-west-2 |
| Root account activity | EventBridge | CloudTrail | securityFindingsTopic | eu-west-2 |

### Investigation Query Cheat Sheet

**Lambda errors:**
```sql
filter @message like /ERROR|Exception/
| fields @timestamp, @message | sort @timestamp desc | limit 50
```

**API Gateway 5xx:**
```sql
filter status >= 500
| stats count(*) by path, status | sort count desc
```

**DynamoDB unusual access:**
```sql
filter eventSource = "dynamodb.amazonaws.com"
| stats count(*) by eventName, userIdentity.arn | sort count desc
```

**IAM changes:**
```sql
filter eventSource = "iam.amazonaws.com"
| fields @timestamp, eventName, userIdentity.arn, requestParameters
| sort @timestamp desc
```

**WAF blocks (requires S3 access logs):**
```sql
filter action = "BLOCK"
| stats count(*) by terminatingRuleId, clientIp | sort count desc
```

---

## Appendix B: Alarm Inventory (from CDK exploration)

| Stack | Alarm Name Pattern | Threshold | SNS Topic |
|-------|-------------------|-----------|-----------|
| Lambda.java | `check-{fn}-errors` | ≥1/5min | None (silent) |
| Lambda.java | `check-{fn}-throttles` | ≥1/5min | None (silent) |
| Lambda.java | `check-{fn}-high-duration-p95` | ≥80% timeout | None (silent) |
| Lambda.java | `check-{fn}-log-errors` | ≥1/5min | None (silent) |
| Lambda.java | `{prefix}-{stack}-stack-health` (composite, `anyOf` every `check-` alarm in the stack) | n/a | routed via OpsStack's AlarmStateChangeRule |
| ApiStack.java | `{prefix}-api-5xx` | ≥1/5min | None (silent) |
| OpsStack.java | `{prefix}-health-failed` | <90%/5min (2 periods) | alertTopic |
| OpsStack.java | `{prefix}-api-failed` | <90%/5min (2 periods) | alertTopic |
| OpsStack.java | `{prefix}-github-synthetic-failed` | ≥1 (2hr, missing=breaching) | alertTopic |
| ObservabilityStack.java | `{prefix}-rum-lcp-p75` | >4000ms | None (silent) |
| ObservabilityStack.java | `{prefix}-rum-js-errors` | ≥5/5min | None (silent) |
| EdgeStack.java | `{prefix}-waf-rate-limit` | ≥50/5min | None (us-east-1) |
| EdgeStack.java | `{prefix}-waf-attack-signatures` | ≥5/5min | None (us-east-1) |
| EdgeStack.java | `{prefix}-waf-known-bad-inputs` | ≥5/5min | None (us-east-1) |
| AsyncApiLambda.java | `{queue}-not-empty` | >1 message | None (silent) |

## Appendix C: EventBridge Security Rules

| Rule | Event Source | Event Pattern | SNS Topic |
|------|-------------|---------------|-----------|
| `{prefix}-guardduty-findings` | aws.guardduty | GuardDuty Finding | securityFindingsTopic |
| `{prefix}-securityhub-findings` | aws.securityhub | Findings - Imported | securityFindingsTopic |
| `{prefix}-iam-policy-changes` | aws.iam | Create/Attach/Put policy | securityFindingsTopic |
| `{prefix}-security-group-changes` | aws.ec2 | Authorize/Revoke SG | securityFindingsTopic |
| `{prefix}-access-key-creation` | aws.iam | Create/Update AccessKey | securityFindingsTopic |
| `{prefix}-root-account-activity` | CloudTrail | userIdentity.type=Root | securityFindingsTopic |

---

## Level 6: DynamoDB Exfiltration Detection

### 6.1 Current State Analysis

**Operations used in code:**
| Operation | Used | Files |
|-----------|------|-------|
| GetItem | Yes | dynamoDbReceiptRepository.js, dynamoDbAsyncRequestRepository.js |
| Query | Yes | dynamoDbBundleRepository.js, dynamoDbReceiptRepository.js |
| PutItem | Yes | All repositories |
| UpdateItem | Yes | dynamoDbAsyncRequestRepository.js |
| DeleteItem | Yes | dynamoDbBundleRepository.js |
| **Scan** | **NO** | - |
| **BatchGetItem** | **NO** | - |
| **BatchWriteItem** | **NO** | - |

**Current IAM permissions (via CDK grants):**
```java
// grantReadData() includes: GetItem, Query, BatchGetItem, Scan
// grantWriteData() includes: PutItem, UpdateItem, DeleteItem, BatchWriteItem
// grantReadWriteData() includes: All of the above
```

**Gap:** `Scan` and `BatchGetItem` are permitted but never used. These are the primary vectors for bulk data exfiltration.

### 6.2 Proposed IAM Tightening

Replace broad CDK grants with explicit permissions:

```java
// BEFORE (too broad):
bundlesTable.grantReadData(bundleGetLambda);

// AFTER (least privilege):
bundlesTable.grant(bundleGetLambda,
    "dynamodb:GetItem",
    "dynamodb:Query"
);
// Explicitly NO: dynamodb:Scan, dynamodb:BatchGetItem
```

**Per-Lambda Permission Matrix:**

| Lambda | GetItem | Query | PutItem | UpdateItem | DeleteItem |
|--------|---------|-------|---------|------------|------------|
| bundleGet | - | Yes | - | - | - |
| bundlePost (ingest) | - | Yes | - | Yes | - |
| bundlePost (worker) | - | - | Yes | Yes | - |
| bundleDelete (ingest) | - | Yes | - | Yes | - |
| bundleDelete (worker) | - | - | - | Yes | Yes |
| receiptGet | - | Yes | - | - | - |
| hmrcVatReturnPost | Yes | - | Yes | Yes | - |
| customAuthorizer | - | Yes | Yes | Yes | - |

### 6.3 New Alarms for DynamoDB Anomaly Detection

Add to `ObservabilityStack.java`:

| Alarm | Metric Source | Threshold | Rationale |
|-------|---------------|-----------|-----------|
| `{prefix}-dynamodb-scan-detected` | CloudTrail metric filter | ≥1 | Scan should NEVER happen |
| `{prefix}-dynamodb-batch-detected` | CloudTrail metric filter | ≥1 | BatchGet/Write not used |
| `{prefix}-dynamodb-read-spike` | DynamoDB ConsumedReadCapacityUnits | >10× baseline | Unusual read volume |
| `{prefix}-dynamodb-unknown-principal` | CloudTrail metric filter | ≥1 | Access from non-Lambda role |

**CloudTrail Metric Filter Patterns:**

```java
// Scan detection (should trigger on ANY scan)
FilterPattern.all(
    FilterPattern.stringValue("$.eventSource", "=", "dynamodb.amazonaws.com"),
    FilterPattern.stringValue("$.eventName", "=", "Scan")
)

// Batch operation detection
FilterPattern.all(
    FilterPattern.stringValue("$.eventSource", "=", "dynamodb.amazonaws.com"),
    FilterPattern.any(
        FilterPattern.stringValue("$.eventName", "=", "BatchGetItem"),
        FilterPattern.stringValue("$.eventName", "=", "BatchWriteItem")
    )
)

// Unknown principal (not a known Lambda role)
// This requires listing known role ARNs and filtering for NOT IN
```

### 6.4 CloudWatch Logs Insights Queries

For investigation after an alert:

```sql
-- Find ALL Scan operations (should return 0 in normal operation)
filter eventSource = "dynamodb.amazonaws.com" and eventName = "Scan"
| stats count(*) by userIdentity.principalId, requestParameters.tableName
| sort count desc

-- Find bulk read patterns by time window
filter eventSource = "dynamodb.amazonaws.com" and eventName in ["GetItem", "Query"]
| stats count(*) as ops by bin(1m), requestParameters.tableName
| filter ops > 100
| sort ops desc

-- Find access from unexpected principals
filter eventSource = "dynamodb.amazonaws.com"
  and not userIdentity.arn like /.*submit-.*-lambda.*/
| fields @timestamp, eventName, userIdentity.arn, requestParameters.tableName

-- Estimate data volume by operation
filter eventSource = "dynamodb.amazonaws.com" and eventName = "Query"
| stats sum(responseElements.count) as itemsReturned by bin(5m), requestParameters.tableName
```

---

## Level 7: Incident Response Runbooks

### 7.1 Kill Switch: Manual Service Offline

**Location:** CloudFront distribution behavior or WAF rule

**Mechanism:**
1. WAF rule to block all traffic (returns 403)
2. Or: CloudFront custom error page pointing to maintenance page
3. Or: Route 53 failover to static maintenance page

**Trigger:** Manual only - via AWS Console or CLI:
```bash
# Option 1: WAF block-all rule (fastest)
aws wafv2 update-web-acl --region us-east-1 \
  --name "${PREFIX}-waf" \
  --scope CLOUDFRONT \
  --id $WEB_ACL_ID \
  --default-action Block={}

# Option 2: CloudFront disable (slower, ~15min propagation)
aws cloudfront update-distribution --id $DIST_ID \
  --distribution-config file://maintenance-config.json
```

**When to use:** Confirmed active breach, active data exfiltration, or compromised credentials with ongoing abuse.

---

### 7.2 Response Runbook: Lambda Errors (`check-{fn}-errors`)

#### Signal Location
- **Primary:** CloudWatch Alarms console → `check-{fn}-errors`
- **Dashboard:** Operations dashboard → Lambda Errors widget
- **SNS:** Currently silent (no SNS action configured)

#### Investigation Steps
1. **CloudWatch Logs Insights:**
   ```sql
   filter @message like /ERROR|Exception|error/
   | fields @timestamp, @message
   | sort @timestamp desc
   | limit 100
   ```
2. **X-Ray traces:** Look for failed spans
3. **Recent deployments:** Check GitHub Actions for recent deploys

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| Code bug | Consistent error message, started after deploy | Rollback deployment |
| Dependency failure | Timeout errors, connection refused | Check downstream service |
| Configuration issue | Missing env var, invalid ARN | Fix configuration, redeploy |
| Resource exhaustion | Memory/timeout errors | Increase Lambda limits |
| Malicious input | Error in input validation | Check WAF logs, consider blocking |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| Isolated errors (<5/hr) | Monitor, investigate | Internal only |
| Sustained errors (>10/hr) | Investigate urgently, consider rollback | Internal + on-call |
| Complete failure (100% error rate) | Immediate rollback | Internal + on-call + stakeholders |

#### Notification Requirements
- **Customers:** Only if service degraded >15 minutes
- **Authorities:** Not required (operational issue)

---

### 7.3 Response Runbook: API 5xx Errors (`{prefix}-api-5xx`)

#### Signal Location
- **Primary:** CloudWatch Alarms console → `{prefix}-api-5xx`
- **Dashboard:** Operations dashboard → API Gateway widget
- **SNS:** Currently silent

#### Investigation Steps
1. **API Gateway logs:** CloudWatch Logs → `/aws/apigateway/{api-id}`
2. **Identify affected endpoints:**
   ```sql
   filter status >= 500
   | stats count(*) by path, status
   ```
3. **Correlate with Lambda errors:** Check if backend Lambda failing

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| Lambda failure | Corresponding Lambda error alarm | See Lambda runbook |
| API Gateway misconfiguration | 502 Bad Gateway | Check integration settings |
| Timeout | 504 Gateway Timeout | Increase timeout or optimize Lambda |
| Throttling | 429 or 503 | Increase provisioned concurrency |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| Sporadic 5xx (<1%) | Monitor | Internal only |
| Elevated 5xx (1-10%) | Investigate, prepare rollback | Internal + on-call |
| Major outage (>10%) | Rollback, incident declared | All stakeholders |

#### Notification Requirements
- **Customers:** If error rate >5% for >10 minutes
- **Authorities:** Not required

---

### 7.4 Response Runbook: WAF Rate Limiting (`{prefix}-waf-rate-limit`)

#### Signal Location
- **Primary:** CloudWatch Alarms console (us-east-1) → `{prefix}-waf-rate-limit`
- **WAF Console:** WAF & Shield → Web ACLs → Sampled requests
- **SNS:** Currently silent (cross-region SNS needed)

#### Investigation Steps
1. **WAF Sampled Requests:** Identify blocked IPs and request patterns
2. **CloudFront Access Logs:** Full request details in S3
3. **Geolocation:** Check origin countries of blocked requests

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| DDoS attempt | Many IPs, distributed geography | Monitor, WAF handling it |
| Single bad actor | Single IP, high volume | Consider permanent IP block |
| Legitimate traffic spike | Known event, marketing campaign | Temporarily raise limits |
| Bot/scraper | Repetitive patterns, no cookies | Add bot detection rule |
| Compromised API key | Authenticated requests from single source | Revoke key |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| Low volume blocking (<100/hr) | Monitor, review patterns | Internal only |
| Sustained blocking (>500/hr) | Investigate source, consider IP block | Internal + security |
| DDoS indicators (>5000/hr) | Escalate to AWS Shield, review architecture | Internal + security + management |

#### Notification Requirements
- **Customers:** Only if legitimate traffic affected
- **Authorities:** If sustained DDoS (>1hr) or if attack attributed

#### Technical Countermeasures
```bash
# Block specific IP permanently
aws wafv2 update-ip-set --region us-east-1 \
  --name "${PREFIX}-blocked-ips" \
  --scope CLOUDFRONT \
  --addresses "1.2.3.4/32"

# Temporarily lower rate limit (more aggressive blocking)
# Requires WAF rule update via CDK redeploy
```

---

### 7.5 Response Runbook: WAF Attack Signatures (`{prefix}-waf-attack-signatures`)

#### Signal Location
- **Primary:** CloudWatch Alarms console (us-east-1)
- **WAF Console:** Sampled requests filtered by CommonRuleSet
- **SNS:** Currently silent

#### Investigation Steps
1. **Identify attack type:** SQLi, XSS, path traversal, etc.
2. **Check if any requests succeeded:** Were attacks blocked pre-Lambda?
3. **Review application logs:** Any corresponding errors?

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| Automated vulnerability scanner | Many different attack types, systematic | Block IP, monitor |
| Targeted attack | Specific payloads, persistence | Block IP, full security review |
| False positive | Legitimate input matching pattern | Add exception rule |
| Penetration test (authorized) | Expected timing, known source | Confirm authorization |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| Scanner activity (<50 blocks) | Monitor, block IP if persistent | Internal security |
| Targeted attack indicators | Full investigation, preserve evidence | Security team + management |
| Successful bypass suspected | **CRITICAL**: Check Lambda logs for exploitation | Security + consider kill switch |

#### Notification Requirements
- **Customers:** If any attack succeeded and data accessed
- **Authorities:**
  - ICO within 72 hours if personal data breached (GDPR)
  - Action Fraud if criminal activity suspected

#### Technical Countermeasures
```bash
# Immediately block attacking IP
aws wafv2 update-ip-set --region us-east-1 \
  --name "${PREFIX}-blocked-ips" \
  --scope CLOUDFRONT \
  --addresses "$ATTACKER_IP/32"

# If bypass suspected - KILL SWITCH
aws wafv2 update-web-acl --region us-east-1 \
  --name "${PREFIX}-waf" \
  --scope CLOUDFRONT \
  --id $WEB_ACL_ID \
  --default-action Block={}
```

---

### 7.6 Response Runbook: DynamoDB Scan Detected (`{prefix}-dynamodb-scan-detected`)

#### Signal Location
- **Primary:** CloudWatch Alarms console → `{prefix}-dynamodb-scan-detected`
- **CloudTrail:** Event history filtered by `eventName=Scan`
- **SNS:** → `securityFindingsTopic`

#### Investigation Steps
1. **Identify principal:** Who executed the Scan?
   ```sql
   filter eventSource = "dynamodb.amazonaws.com" and eventName = "Scan"
   | fields @timestamp, userIdentity.arn, userIdentity.principalId,
            requestParameters.tableName, sourceIPAddress
   ```
2. **Check if authorized:** Is this a known admin action? Deployment script?
3. **Assess data exposure:** Which table? How much data returned?

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| **Compromised Lambda credentials** | Lambda role ARN, unexpected time | **CRITICAL** - rotate credentials, investigate |
| **Compromised deployment credentials** | Deployment role ARN | **CRITICAL** - rotate, audit GitHub Actions |
| **Insider threat** | IAM user, console access | Suspend user, investigate |
| **Legitimate admin action** | Known admin, documented reason | Document, improve process |
| **Misconfigured application** | Code bug introduced Scan | Fix code, audit deployment |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| **ANY Scan = HIGH SEVERITY** | Immediate investigation | Security + management |
| Unknown principal | **CRITICAL**: Assume breach, preserve evidence | All + consider authorities |
| Known principal, unauthorized | Suspend access, investigate | Security + HR + management |

#### Notification Requirements
- **Customers:** Yes, if their data was in scanned table (potential breach)
- **Authorities:**
  - **ICO:** Within 72 hours if personal data potentially exposed
  - **HMRC:** If tax data potentially exposed (financial services regulations)
  - **Action Fraud:** If criminal activity suspected

#### Technical Countermeasures
```bash
# 1. Identify the compromised role
ROLE_ARN=$(aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Scan \
  --query 'Events[0].CloudTrailEvent' --output text | jq -r '.userIdentity.arn')

# 2. Immediately revoke all sessions for that role
aws iam put-role-policy --role-name $ROLE_NAME \
  --policy-name "DenyAll" \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"*","Resource":"*"}]}'

# 3. If breach confirmed - KILL SWITCH
# Take site offline while investigating
aws wafv2 update-web-acl --region us-east-1 \
  --name "${PREFIX}-waf" --scope CLOUDFRONT --id $WEB_ACL_ID \
  --default-action Block={}

# 4. Preserve evidence
aws cloudtrail lookup-events \
  --start-time $(date -d '24 hours ago' --iso-8601) \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=dynamodb.amazonaws.com \
  > /tmp/dynamodb-audit-$(date +%Y%m%d-%H%M%S).json
```

---

### 7.7 Response Runbook: GuardDuty Findings (`{prefix}-guardduty-findings`)

#### Signal Location
- **Primary:** GuardDuty console → Findings
- **EventBridge:** → SNS `securityFindingsTopic`
- **Security Hub:** Aggregated findings view

#### Investigation Steps
1. **Review finding type:** Severity, affected resources
2. **Check finding details:** Source IP, user agent, API calls
3. **Correlate with other signals:** CloudTrail, VPC Flow Logs

#### Common Finding Types & Response

| Finding Type | Severity | Response |
|--------------|----------|----------|
| `UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B` | HIGH | Unusual console login - verify user, check for credential compromise |
| `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` | CRITICAL | Credentials used from outside AWS - **immediate credential rotation** |
| `Recon:IAMUser/NetworkPermissions` | MEDIUM | Reconnaissance activity - monitor, may precede attack |
| `CryptoCurrency:EC2/BitcoinTool.B` | HIGH | Crypto mining - likely compromised instance - **terminate instance** |
| `Exfiltration:S3/MaliciousIPCaller` | HIGH | Data exfiltration attempt - check S3 access logs |

#### Response Actions
| Severity | Action | Notify |
|----------|--------|--------|
| LOW | Monitor, document | Internal security |
| MEDIUM | Investigate within 24 hours | Security team |
| HIGH | Investigate immediately | Security + management |
| CRITICAL | **Incident response activated** | All stakeholders + consider authorities |

#### Notification Requirements
- **Customers:** If finding indicates their data accessed
- **Authorities:** Depends on finding type (see specific guidance above)

---

### 7.8 Response Runbook: IAM Policy Changes (`{prefix}-iam-policy-changes`)

#### Signal Location
- **Primary:** EventBridge → SNS `securityFindingsTopic`
- **CloudTrail:** Event history filtered by IAM events
- **IAM Console:** Policy versions, attachments

#### Investigation Steps
1. **Who made the change?** Check `userIdentity` in CloudTrail
2. **What changed?** Compare policy versions
3. **Was it authorized?** Check change management records

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| Legitimate deployment | Matches CDK/deployment timing | Document, verify expected |
| Manual admin change | Console access, IAM user | Verify authorization |
| Privilege escalation attempt | New admin permissions, unusual principal | **CRITICAL** - investigate immediately |
| Compromised credentials | Unexpected time, unknown source IP | **CRITICAL** - revoke credentials |

#### Response Actions
| Change Type | Action | Notify |
|-------------|--------|--------|
| Expected (deployment) | Verify, document | None |
| Unexpected but benign | Investigate, document, improve process | Internal |
| Privilege escalation | **Revert immediately**, investigate | Security + management |
| Compromised credentials | **Revoke all credentials**, incident response | All + consider authorities |

---

### 7.9 Response Runbook: Service Downtime (`{prefix}-health-failed`, `{prefix}-api-failed`)

#### Signal Location
- **Primary:** CloudWatch Alarms console
- **Dashboard:** Operations dashboard
- **SNS:** → `alertTopic`

#### Investigation Steps
1. **Verify outage:** Manually test endpoints
2. **Check dependencies:** AWS status page, HMRC status
3. **Review recent changes:** Deployments, configuration changes

#### Possible Causes
| Cause | Indicators | Response |
|-------|------------|----------|
| Deployment failure | Started after deploy | Rollback |
| AWS outage | Multiple services affected, AWS status page | Wait, communicate to customers |
| Certificate expiry | SSL errors | Renew certificate |
| DNS issue | Name resolution failures | Check Route 53 |
| DDoS | High traffic, WAF blocks | See WAF runbook |

#### Response Actions
| Duration | Action | Notify |
|----------|--------|--------|
| <5 minutes | Investigate, likely transient | Internal only |
| 5-15 minutes | Active investigation, prepare comms | Internal + stakeholders |
| >15 minutes | Incident declared, status page update | All customers |
| >1 hour | Major incident, exec notification | All + consider media statement |

#### Notification Requirements
- **Customers:** Status page update if >15 minutes
- **Authorities:** Not required (service availability issue)

---

### 7.10 Response Runbook: Root Account Activity (`{prefix}-root-account-activity`)

#### Signal Location
- **Primary:** EventBridge → SNS `securityFindingsTopic`
- **CloudTrail:** Filter by `userIdentity.type = Root`

#### Investigation Steps
1. **What action was taken?** Review CloudTrail event
2. **Was it authorized?** Check with account owners
3. **Why was root used?** Root should almost never be needed

#### Response Actions
| Scenario | Action | Notify |
|----------|--------|--------|
| Authorized (known admin, documented reason) | Document, review root usage policy | Internal |
| Unauthorized | **CRITICAL**: Assume account compromise | All + AWS Support |

**Root account compromise is CRITICAL:**
```bash
# 1. Change root password immediately (requires console access)
# 2. Rotate root access keys (should not exist)
aws iam list-access-keys --user-name root
# 3. Enable MFA if not already (should already be enabled)
# 4. Review all IAM users and roles for backdoors
# 5. Contact AWS Support
```

#### Notification Requirements
- **Customers:** Yes, if account compromise confirmed
- **Authorities:** Yes, if account compromise confirmed (data protection implications)

---

### 7.11 Escalation Matrix

| Alarm Category | L1 Response | L2 Escalation | L3 Escalation | Kill Switch |
|----------------|-------------|---------------|---------------|-------------|
| Lambda/API errors | On-call engineer | Tech lead | CTO | No |
| WAF rate limiting | On-call engineer | Security + Tech lead | CTO + Legal | If DDoS sustained |
| WAF attack signatures | Security team | CTO + Legal | Authorities | If bypass confirmed |
| DynamoDB Scan | **Immediate to Security** | CTO + Legal | Authorities | If breach confirmed |
| GuardDuty CRITICAL | **Immediate to Security** | CTO + Legal | Authorities | Case-by-case |
| Root activity | **Immediate to CTO** | All stakeholders | AWS Support | Case-by-case |
| Service downtime | On-call engineer | Tech lead | CTO (if >1hr) | No |

---

### 7.12 Regulatory Notification Requirements

#### ICO (Information Commissioner's Office) - GDPR
- **When:** Personal data breach likely to result in risk to individuals
- **Deadline:** Within 72 hours of becoming aware
- **How:** https://ico.org.uk/for-organisations/report-a-breach/
- **What to report:** Nature of breach, categories of data, approximate number of individuals, likely consequences, measures taken

#### HMRC (if applicable as software provider)
- **When:** Tax data potentially compromised
- **Contact:** Through Making Tax Digital support channels
- **Timeline:** As soon as reasonably practicable

#### Action Fraud (UK)
- **When:** Criminal activity suspected (hacking, fraud)
- **How:** https://www.actionfraud.police.uk/
- **Reference:** Keep crime reference number for insurance/legal

#### Affected Customers
- **When:** Their data potentially accessed
- **Timeline:** Without undue delay after confirming breach
- **Content:** What happened, what data affected, what you're doing, what they should do

---

## Level 8: Drill & Simulation Requirements

Every runbook scenario must be testable. This section defines how to simulate each incident type for both CI testing and production drills.

### 8.1 Simulation Methods by Category

| Scenario | CI Simulation (Destructive) | Prod Drill (Non-Destructive) |
|----------|----------------------------|------------------------------|
| Lambda errors | Mutation testing - deploy code that throws | `SetAlarmState` to ALARM |
| Lambda timeout | Mutation testing - deploy slow code | `SetAlarmState` to ALARM |
| API 5xx | Break Lambda backend | `SetAlarmState` to ALARM |
| WAF rate limit | Send 2500+ requests from CI runner | `SetAlarmState` to ALARM (us-east-1) |
| WAF attack signatures | Send SQLi/XSS payloads | `SetAlarmState` to ALARM (us-east-1) |
| DynamoDB Scan | Grant Scan permission, invoke | CloudTrail log injection (test account only) |
| GuardDuty finding | `create-sample-findings` API | `SetAlarmState` equivalent via finding |
| IAM policy change | Create/delete test policy | EventBridge test event |
| Service downtime | Break health endpoint | `SetAlarmState` to ALARM |
| Root activity | **Cannot simulate safely** | EventBridge test event (simulated payload) |
| Certificate expiry | **Cannot simulate in prod** | `SetAlarmState` if alarm exists |
| HMRC API failure | Mock HMRC returning 503 | `SetAlarmState` to ALARM |
| SQS queue backup | Pause consumer, send messages | `SetAlarmState` to ALARM |
| Backup failure | **Cannot simulate safely** | SNS test notification |

### 8.2 Drill Checklist Template

For each drill execution:

```markdown
## Drill Record: [Scenario Name]
- **Date:** YYYY-MM-DD HH:MM UTC
- **Environment:** ci / prod
- **Mode:** Simulation / SetAlarmState
- **Executed by:** [Name]

### Pre-Drill
- [ ] Confirmed current alarm state: OK
- [ ] Notified on-call team of drill
- [ ] SNS subscriptions verified active

### Execution
- [ ] Triggered simulation/state change at: HH:MM
- [ ] Alarm transitioned to ALARM at: HH:MM (Δ = X min)
- [ ] SNS notification received at: HH:MM (Δ = X min)
- [ ] On-call acknowledged at: HH:MM (Δ = X min)

### Verification
- [ ] Correct escalation path followed
- [ ] Investigation steps executable
- [ ] Runbook accurate and complete
- [ ] All referenced consoles/logs accessible

### Post-Drill
- [ ] Alarm restored to OK at: HH:MM
- [ ] Drill documented in incident log
- [ ] Runbook updates required: Yes/No
- [ ] Follow-up actions: [List]
```

### 8.3 Drill Scenarios by Runbook

#### Drill: Lambda Errors (7.2)
```bash
# CI Mode
sed -i 's/return {/throw new Error("DRILL"); return {/' app/functions/bundleGet.js
npm run deploy:ci
aws lambda invoke --function-name ci-bundleGet /dev/null
# Wait 6 minutes, verify alarm

# Prod Drill Mode
aws cloudwatch set-alarm-state \
  --alarm-name "prod-bundleGet-errors" \
  --state-value ALARM \
  --state-reason "DRILL: Testing incident response"
# Verify SNS, verify on-call response
# Restore after drill
```

#### Drill: WAF Attack (7.5)
```bash
# CI Mode
for i in {1..10}; do
  curl -s "${CI_URL}/?id=' OR 1=1 --" || true
  curl -s "${CI_URL}/" -d "<script>alert(1)</script>" || true
done
# Wait 6 minutes, verify alarm in us-east-1

# Prod Drill Mode
aws cloudwatch set-alarm-state --region us-east-1 \
  --alarm-name "prod-waf-attack-signatures" \
  --state-value ALARM \
  --state-reason "DRILL: Testing security response"
```

#### Drill: DynamoDB Scan Detection (7.6)
```bash
# CI Mode ONLY - Never in prod
# Temporarily grant Scan permission
aws iam put-role-policy --role-name ci-bundleGet-lambda \
  --policy-name "TempScanForDrill" \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"dynamodb:Scan","Resource":"*"}]}'

# Deploy Lambda that does Scan
# Invoke Lambda
# Wait for CloudTrail propagation (5-15 min)
# Verify alarm triggered

# CLEANUP IMMEDIATELY
aws iam delete-role-policy --role-name ci-bundleGet-lambda --policy-name "TempScanForDrill"

# Prod Drill Mode - Use SetAlarmState only
aws cloudwatch set-alarm-state \
  --alarm-name "prod-dynamodb-scan-detected" \
  --state-value ALARM \
  --state-reason "DRILL: Testing data exfiltration response"
```

#### Drill: Kill Switch (7.1)
```bash
# CI Mode - Actually activate kill switch
aws wafv2 update-web-acl --region us-east-1 \
  --name "ci-waf" --scope CLOUDFRONT --id $CI_WEB_ACL_ID \
  --default-action Block={}
# Verify site returns 403
# Restore immediately
aws wafv2 update-web-acl --region us-east-1 \
  --name "ci-waf" --scope CLOUDFRONT --id $CI_WEB_ACL_ID \
  --default-action Allow={}

# Prod Drill Mode - TABLETOP ONLY
# Walk through kill switch procedure without executing
# Verify credentials and commands are documented and accessible
# Verify rollback procedure is documented
```

#### Drill: Full Incident Response (End-to-End)
```bash
# Quarterly drill: Simulate breach detection through resolution
# 1. Trigger DynamoDB Scan alarm (SetAlarmState in prod)
# 2. Verify SNS notification received
# 3. Security team acknowledges and investigates
# 4. Team decides kill switch needed (tabletop)
# 5. Document time-to-decision
# 6. Walk through customer notification process (draft only)
# 7. Walk through ICO notification process (draft only)
# 8. Restore alarm state
# 9. Document lessons learned
```

### 8.4 Drill Schedule

| Drill Type | Frequency | Environment | Mode |
|------------|-----------|-------------|------|
| Individual alarm validation | Weekly (CI) | ci | Destructive |
| SNS delivery verification | Monthly | prod | SetAlarmState |
| On-call response time | Monthly | prod | SetAlarmState |
| Security incident (tabletop) | Quarterly | N/A | Discussion |
| Full breach simulation | Annually | ci | Destructive |
| Kill switch verification | Quarterly | ci | Destructive |
| Regulatory notification (tabletop) | Annually | N/A | Discussion |

---

## Level 9: Gap Analysis - What's Missing

Based on comprehensive code review, the following monitoring gaps exist:

### 9.1 Critical Gaps (Must Fix)

| Gap | Risk | Current State | Recommendation |
|-----|------|---------------|----------------|
| DynamoDB PITR verification | Data loss, compliance failure | PITR enabled but not verified | Add alarm for PITR disabled |
| Scan/BatchGet IAM permissions | Data exfiltration vector | Permitted via grantReadData() | Tighten to explicit GetItem/Query only |
| HMRC API error rate | Silent third-party failures | Logged but not alarmed | Add error rate alarm (>5% = alert) |
| Certificate expiration | Service outage | ACM auto-renews but no alarm | Add expiration warning (<30 days) |
| SQS queue depth | Job backlog undetected | DLQ alarm only | Add queue depth and message age alarms |

### 9.2 High Priority Gaps

| Gap | Risk | Current State | Recommendation |
|-----|------|---------------|----------------|
| Network timeout errors | External dependency issues masked | Caught but not metriced | Add metric filter for ECONNRESET, ETIMEDOUT |
| Async request stuck in processing | Orphaned jobs | State tracked but not alarmed | Add alarm for processing > 30 min |
| JWT validation error rate | Auth service degradation | Errors logged only | Add error rate alarm |
| API Gateway 429 (throttling) | Capacity issues masked | No alarm | Add throttling alarm |
| Backup job duration | Recovery point objective risk | Job failures alarmed, duration not | Add duration alarm |
| Provisioned concurrency exhaustion | Cold start spike | Throttle alarm exists, utilization not | Add utilization trend alarm |

### 9.3 Medium Priority Gaps

| Gap | Risk | Current State | Recommendation |
|-----|------|---------------|----------------|
| CloudFront cache hit ratio | Origin overload | Not monitored | Add cache hit ratio degradation alarm |
| Secret rotation failures | Credential staleness | Not monitored | Add rotation failure alarm |
| Cognito service availability | Auth outage | Not monitored | Add Cognito API error alarm |
| API Gateway auth failures trend | Attack indicator | Logged only | Add 403 rate trend alarm |
| Cross-account backup copy lag | DR capability degradation | Not monitored | Add copy completion alarm |
| Deployment workflow failures | Release pipeline issues | Not monitored | Add GitHub Actions failure alarm |

### 9.4 Low Priority Gaps

| Gap | Risk | Current State | Recommendation |
|-----|------|---------------|----------------|
| RUM First Contentful Paint | User experience | LCP alarmed, FCP not | Add FCP alarm |
| Self-destruct mechanism failures | Orphaned environments | Not monitored | Add execution failure alarm |
| DNS query latency | Routing performance | Not monitored | Add Route53 health check |
| GuardDuty detector disabled | Security blind spot | Not monitored | Add detector status alarm |

### 9.5 Silent Failure Patterns Found

These code patterns can fail without triggering alerts:

```javascript
// 1. Non-awaited async operations (app/services/asyncApiServices.js)
putAsyncRequest(userId, requestId, 'processing', {}).catch(() => {});
// FIX: Add error metric emission in catch block

// 2. Secret fallback masking failures (app/functions/hmrc/hmrcTokenPost.js)
const secret = process.env.OVERRIDE_SECRET || await getSecret();
// FIX: Log/metric when override is used vs Secrets Manager

// 3. Validation errors not metriced (app/functions/hmrc/hmrcVatReturnPost.js)
if (!isValid) return { statusCode: 400, body: 'Invalid' };
// FIX: Emit validation failure metric before returning
```

---

## Level 10: Gold Standard Practices

This section documents industry best practices for alarm validation and incident response. Use this as a benchmark for maturity assessment.

### 10.1 AWS Well-Architected Framework - Operational Excellence

| Practice | Current State | Gold Standard | Gap |
|----------|---------------|---------------|-----|
| **Alarm coverage** | ~20 alarms across 5 categories | Every failure mode has an alarm | Missing ~15 alarms (see 9.1-9.4) |
| **Alarm testing** | Manual verification | Automated weekly validation | Need alarm-validation workflow |
| **Runbooks** | Documented (this doc) | Tested quarterly, version controlled | Need drill schedule |
| **Escalation paths** | Defined in matrix | Automated via PagerDuty/OpsGenie | Currently SNS to email only |
| **Post-incident review** | Ad-hoc | Formal blameless postmortem | Need template and process |

### 10.2 NIST Cybersecurity Framework Alignment

| Function | Gold Standard | Current State | Recommendation |
|----------|---------------|---------------|----------------|
| **Identify** | Asset inventory, risk assessment | Infrastructure as code, partial | Complete data flow mapping |
| **Protect** | Defense in depth, least privilege | WAF, IAM, but permissions too broad | Tighten DynamoDB IAM |
| **Detect** | Continuous monitoring, anomaly detection | CloudTrail, GuardDuty, but gaps | Add missing alarms |
| **Respond** | Tested incident response plan | Runbooks documented, not tested | Implement drill schedule |
| **Recover** | Tested backup/restore, DR plan | PITR enabled, not tested | Add recovery drills |

### 10.3 SOC 2 Type II Relevant Controls

| Control | Requirement | Current State | Gap |
|---------|-------------|---------------|-----|
| **CC7.2** | Security event monitoring | GuardDuty, Security Hub, CloudTrail | Need alarm testing evidence |
| **CC7.3** | Incident response procedures | Runbooks documented | Need drill evidence |
| **CC7.4** | Incident communication | Escalation matrix defined | Need tested notification process |
| **A1.2** | Backup and recovery | PITR, cross-account backup | Need recovery testing evidence |

### 10.4 Chaos Engineering Maturity Model

| Level | Description | Current State | Next Step |
|-------|-------------|---------------|-----------|
| **0 - Ad-hoc** | No systematic testing | Past ✓ | - |
| **1 - Reactive** | Test after incidents | Current ➜ | - |
| **2 - Proactive** | Scheduled chaos testing in non-prod | Target | Implement CI chaos |
| **3 - Continuous** | Chaos in prod with safeguards | Future | After Level 2 stable |
| **4 - Advanced** | Automated fault injection, ML anomaly detection | Future | Long-term goal |

**Current state:** Level 1
**Target state:** Level 2 with quarterly Level 3 exercises

### 10.5 Industry Benchmarks

| Metric | Industry Average | Best-in-Class | Target |
|--------|------------------|---------------|--------|
| Mean Time to Detect (MTTD) | 197 days (breaches) | <1 hour | <15 minutes |
| Mean Time to Respond (MTTR) | 69 days (breaches) | <4 hours | <1 hour |
| Alarm-to-acknowledgment | 15-30 minutes | <5 minutes | <10 minutes |
| False positive rate | 40-60% | <10% | <20% |
| Drill frequency | Annual | Monthly | Monthly (alarms), Quarterly (full) |
| Runbook coverage | 50% of alarms | 100% of alarms | 100% |

### 10.6 Gold Standard Alarm Design Principles

1. **Every alarm must be actionable**
   - If you wouldn't wake someone up for it, it's not an alarm
   - Document the response action in the alarm description

2. **Alarms should have clear ownership**
   - Each alarm routes to a specific team/person
   - Escalation path defined and tested

3. **Thresholds based on data, not intuition**
   - Use anomaly detection where possible
   - Review thresholds quarterly based on actual data

4. **No alarm fatigue**
   - Target <5 alarms per on-call shift in steady state
   - Auto-resolve transient issues with composite alarms

5. **Test alarms regularly**
   - Every alarm should trigger at least once per quarter (drill or real)
   - Untriggered alarms may have broken metric pipelines

6. **Correlate related alarms**
   - Use composite alarms to reduce noise
   - Group related failures into single incident

7. **Include context in alarm notifications**
   - Link to runbook
   - Link to relevant dashboard
   - Include recent metric values

### 10.7 Gold Standard Incident Response

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Incident Response Lifecycle                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Detect   │───▶│ Triage   │───▶│ Contain  │───▶│ Eradicate│      │
│  │ (<5min)  │    │ (<15min) │    │ (<1hr)   │    │ (varies) │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │               │              │
│       ▼               ▼               ▼               ▼              │
│  Alarm fires    Severity set    Threat stopped   Root cause        │
│  SNS sent       Owner assigned  Kill switch if   fixed             │
│  On-call paged  Comms started   needed           Systems restored   │
│                                                                      │
│  ┌──────────┐    ┌──────────┐                                       │
│  │ Recover  │───▶│ Learn    │                                       │
│  │ (varies) │    │ (<1 week)│                                       │
│  └──────────┘    └──────────┘                                       │
│       │               │                                              │
│       ▼               ▼                                              │
│  Service         Postmortem                                         │
│  restored        conducted                                          │
│  Customers       Improvements                                       │
│  notified        implemented                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.8 Regulatory Compliance Checklist

| Regulation | Requirement | Implementation | Evidence Needed |
|------------|-------------|----------------|-----------------|
| **GDPR Art. 33** | Breach notification within 72 hours | Runbook 7.12 | Drill records showing <72hr capability |
| **GDPR Art. 34** | Customer notification without undue delay | Runbook 7.12 | Communication templates, drill records |
| **GDPR Art. 32** | Appropriate security measures | WAF, GuardDuty, encryption | Alarm validation reports |
| **PCI DSS 10.6** | Review logs daily | CloudTrail, GuardDuty | Automated review evidence |
| **PCI DSS 12.10** | Incident response plan | This document | Drill records |
| **ISO 27001 A.16** | Information security incident management | Runbooks, escalation | Drill records, postmortems |

---

## Appendix D: Proposed New Alarms

Based on gap analysis, add these alarms to CDK:

### D.1 DynamoDB Protection (ObservabilityStack.java)

```java
// Scan detection - CRITICAL
createCloudTrailMetricAlarm("dynamodb-scan-detected",
    "eventSource = 'dynamodb.amazonaws.com' && eventName = 'Scan'",
    1, ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    securityFindingsTopic);

// Batch operation detection
createCloudTrailMetricAlarm("dynamodb-batch-detected",
    "eventSource = 'dynamodb.amazonaws.com' && eventName in ['BatchGetItem', 'BatchWriteItem']",
    1, ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    securityFindingsTopic);
```

### D.2 HMRC Integration Health (HmrcStack.java)

```java
// HMRC API error rate
Alarm.Builder.create(this, "HmrcApiErrorRate")
    .alarmName(resourceNamePrefix + "-hmrc-api-errors")
    .metric(hmrcErrorMetric.with(MetricOptions.builder()
        .statistic("Sum")
        .period(Duration.minutes(5))
        .build()))
    .threshold(5)
    .evaluationPeriods(1)
    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
    .build();

// HMRC rate limiting (429)
Alarm.Builder.create(this, "HmrcRateLimited")
    .alarmName(resourceNamePrefix + "-hmrc-rate-limited")
    .metric(hmrc429Metric)
    .threshold(1)
    .build();
```

### D.3 SQS Queue Health (HmrcStack.java)

```java
// Queue depth (jobs backing up)
Alarm.Builder.create(this, "QueueDepthAlarm")
    .alarmName(queueName + "-depth")
    .metric(queue.metricApproximateNumberOfMessagesVisible())
    .threshold(10)
    .evaluationPeriods(3)
    .build();

// Message age (jobs stuck)
Alarm.Builder.create(this, "MessageAgeAlarm")
    .alarmName(queueName + "-age")
    .metric(queue.metricApproximateAgeOfOldestMessage())
    .threshold(Duration.minutes(30).toSeconds())
    .build();
```

### D.4 Certificate Expiration (EdgeStack.java)

```java
// Certificate expiration warning
Alarm.Builder.create(this, "CertExpirationAlarm")
    .alarmName(resourceNamePrefix + "-cert-expiring")
    .metric(Metric.Builder.create()
        .namespace("AWS/CertificateManager")
        .metricName("DaysToExpiry")
        .dimensionsMap(Map.of("CertificateArn", certificate.getCertificateArn()))
        .build())
    .threshold(30)
    .comparisonOperator(ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD)
    .build();
```

### D.5 Authentication Health (AuthStack.java)

```java
// JWT validation error rate
createLambdaLogMetricAlarm(customAuthorizer,
    "jwt-validation-errors",
    "[timestamp, requestId, level=ERROR, message=*JWT*]",
    5, Duration.minutes(5));

// Cognito API errors
Alarm.Builder.create(this, "CognitoErrorsAlarm")
    .alarmName(resourceNamePrefix + "-cognito-errors")
    .metric(Metric.Builder.create()
        .namespace("AWS/Cognito")
        .metricName("TokenRefreshFailures")
        .build())
    .threshold(5)
    .build();
```

### D.6 Network and External Dependencies

```java
// HTTP timeout/connection errors (from Lambda logs)
createLambdaLogMetricAlarm(hmrcVatReturnPostWorker,
    "network-errors",
    "ECONNRESET ETIMEDOUT ENOTFOUND ECONNREFUSED",
    5, Duration.minutes(5));

// Async request stuck in processing
Alarm.Builder.create(this, "AsyncRequestStuckAlarm")
    .alarmName(resourceNamePrefix + "-async-stuck")
    .metric(asyncRequestAgeMetric)
    .threshold(Duration.minutes(30).toSeconds())
    .build();
```

### D.7 API Gateway Health

```java
// Throttling (429 Too Many Requests)
Alarm.Builder.create(this, "ApiThrottlingAlarm")
    .alarmName(resourceNamePrefix + "-api-throttled")
    .metric(api.metricCount(MetricOptions.builder()
        .dimensionsMap(Map.of("StatusCode", "429"))
        .build()))
    .threshold(10)
    .evaluationPeriods(1)
    .build();

// Authorization failures trend
Alarm.Builder.create(this, "ApiAuthFailuresAlarm")
    .alarmName(resourceNamePrefix + "-api-auth-failures")
    .metric(api.metricCount(MetricOptions.builder()
        .dimensionsMap(Map.of("StatusCode", "403"))
        .build()))
    .threshold(50)
    .evaluationPeriods(2)
    .build();
```

---

## Next Steps

### Phase 1: Critical Security Gaps (Immediate)
1. [ ] **Implement DynamoDB IAM tightening** - Replace grantReadData() with explicit GetItem/Query only
2. [ ] **Add DynamoDB Scan detection alarm** - CloudTrail metric filter → securityFindingsTopic
3. [ ] **Add DynamoDB BatchGet/Write detection alarm** - CloudTrail metric filter
4. [ ] **Add certificate expiration alarm** - ACM DaysToExpiry < 30

### Phase 2: Alarm Infrastructure
5. [ ] Create `.github/workflows/alarm-validation.yml` workflow
6. [ ] Create `scripts/alarm-validation/` directory with helper scripts
7. [ ] Add IAM permissions for alarm state manipulation (SetAlarmState)
8. [ ] Create SNS subscription for verification (SQS queue for automated checking)
9. [ ] **Set up SNS routing for currently-silent alarms**
10. [ ] **Configure cross-region SNS for WAF alarms (us-east-1 → eu-west-2)**

### Phase 3: High Priority Alarms (see Appendix D)
11. [ ] Add HMRC API error rate alarm
12. [ ] Add HMRC 429 rate limit alarm
13. [ ] Add SQS queue depth alarm
14. [ ] Add SQS message age alarm
15. [ ] Add JWT validation error rate alarm
16. [ ] Add API Gateway throttling (429) alarm
17. [ ] Add network timeout error metric filter

### Phase 4: Testing Infrastructure
18. [ ] Implement mutation testing framework
19. [ ] Add weekly CI alarm validation schedule
20. [ ] **Create kill switch documentation and CLI scripts** (WAF block-all)
21. [ ] Create drill checklist templates
22. [ ] Set up drill schedule (monthly SNS, quarterly security tabletop)

### Phase 5: Medium Priority Alarms
23. [ ] Add CloudFront cache hit ratio alarm
24. [ ] Add secret rotation failure alarm
25. [ ] Add Cognito API error alarm
26. [ ] Add API Gateway 403 trend alarm
27. [ ] Add backup job duration alarm
28. [ ] Add async request stuck alarm (processing > 30 min)

### Phase 6: Documentation & Compliance
29. [ ] Create postmortem template
30. [ ] Create customer notification templates
31. [ ] Create ICO notification template
32. [ ] Document evidence collection for SOC 2 / ISO 27001
33. [ ] Schedule annual tabletop for regulatory notification drill

### Phase 7: Code Fixes for Silent Failures
34. [ ] Fix non-awaited async operations in asyncApiServices.js
35. [ ] Add metric emission for validation failures in hmrcVatReturnPost.js
36. [ ] Add logging when secret override is used vs Secrets Manager
