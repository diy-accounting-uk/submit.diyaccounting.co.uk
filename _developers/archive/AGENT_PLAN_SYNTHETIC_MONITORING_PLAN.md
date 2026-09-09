<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Synthetic Monitoring & Operational Dashboard Plan

**Issue**: #445 - Synthetic tests hooked into Alarms are not yet present
**Priority**: Important for HMRC approval
**Author**: Claude
**Date**: January 2026

---

## Overview

Extend the existing OpsStack to provide a comprehensive operational dashboard combining:
1. **Synthetic Canaries** - Automated health checks with alarms
2. **Real User Metrics** - Visitors, page views, errors (from CloudWatch RUM)
3. **Business Metrics** - Sign-ups, form submissions, authentications, bundle changes

The dashboard will clearly separate synthetic test traffic from real human users.

---

## Architecture

```
                                    +-----------------+
                                    |  SNS Topic      |
                                    |  (Alerts)       |
                                    +--------+--------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
           +--------v--------+      +--------v--------+      +--------v--------+
           | Alarm:          |      | Alarm:          |      | Alarm:          |
           | Canary Health   |      | API Errors      |      | Auth Failures   |
           +--------+--------+      +--------+--------+      +--------+--------+
                    |                        |                        |
+-------------------+------------------------+------------------------+-------------------+
|                                                                                         |
|                           CloudWatch Dashboard (Extended OpsStack)                      |
|                                                                                         |
|  +----------------------------------+  +----------------------------------+             |
|  | SYNTHETIC HEALTH                 |  | REAL USER TRAFFIC               |             |
|  | - Canary success rate            |  | - RUM page views                |             |
|  | - Canary latency                 |  | - RUM errors                    |             |
|  | - Last run status                |  | - CloudFront requests           |             |
|  +----------------------------------+  +----------------------------------+             |
|                                                                                         |
|  +----------------------------------+  +----------------------------------+             |
|  | BUSINESS METRICS                 |  | INFRASTRUCTURE                  |             |
|  | - Sign-ups (Cognito)             |  | - Lambda invocations            |             |
|  | - VAT submissions (hmrcVatReturn)|  | - Lambda errors                 |             |
|  | - Authentications (HMRC OAuth)   |  | - Lambda duration p95           |             |
|  | - Bundle purchases (bundlePost)  |  | - API Gateway 4xx/5xx           |             |
|  +----------------------------------+  +----------------------------------+             |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

---

## Metrics to Monitor

### 1. Real User Traffic (CloudWatch RUM)

| Metric | Source | Purpose |
|--------|--------|---------|
| Page Views | RUM `PageViewCount` | Track visitor engagement |
| Unique Visitors | RUM `SessionCount` | Daily/weekly active users |
| JS Errors | RUM `JsErrorCount` | Frontend stability |
| HTTP Errors | RUM `HttpErrorCount` | API call failures |
| Performance | RUM `PerformanceNavigationDuration` | Page load times |

### 2. Business Metrics (Lambda Invocations)

| Metric | Lambda Function | Purpose |
|--------|-----------------|---------|
| Sign-ups | `cognitoPostConfirmation` | New user registrations |
| VAT Submissions | `hmrcVatReturnPost` | Successful form submissions |
| HMRC Authentications | `hmrcTokenPost` | OAuth token exchanges |
| Bundle Purchases | `bundlePost` | Bundle activations/changes |
| View VAT Return | `hmrcVatReturnGet` | Read operations |
| View Obligations | `hmrcVatObligationGet` | Obligations lookups |

### 3. Synthetic Health (CloudWatch Synthetics + GitHub Actions)

#### CloudWatch Synthetics Canaries (AWS-hosted)

| Canary | Checks | Frequency |
|--------|--------|-----------|
| Health Check | Main page, privacy, terms load | 5 min |
| API Check | OpenAPI docs, API auth enforcement | 5 min |

#### GitHub Actions Synthetic Tests (synthetic-test.yml)

The `synthetic-test.yml` workflow runs Playwright behaviour tests and publishes metrics to CloudWatch.

| Metric | Namespace | Dimensions | Schedule |
|--------|-----------|------------|----------|
| `behaviour-test` | `{apex-domain}` | `deployment-name`, `test` | Every 57 min |

**Metric values**:
- `0` = Test passed (success)
- Non-zero = Test failed

**Alarm**: Alert if no successful test (value=0) in any 2-hour period.

```java
// GitHub Actions Synthetic Test Alarm
Alarm.Builder.create(this, "GithubSyntheticAlarm")
    .alarmName(props.resourceNamePrefix() + "-github-synthetic-failed")
    .alarmDescription("GitHub Actions synthetic test has not succeeded in 2 hours")
    .metric(Metric.Builder.create()
        .namespace(props.sharedNames().envBaseUrl.replace("https://", ""))
        .metricName("behaviour-test")
        .dimensionsMap(Map.of(
            "deployment-name", props.deploymentName(),
            "test", "submitVatBehaviour"))
        .statistic("Minimum")  // Look for any success (0)
        .period(Duration.hours(2))
        .build())
    .threshold(1)  // Alert if minimum is >= 1 (no successes)
    .evaluationPeriods(1)
    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
    .treatMissingData(TreatMissingData.BREACHING)  // Missing data = no tests ran
    .build();
```

### 4. Infrastructure Metrics

| Metric | Source | Purpose |
|--------|--------|---------|
| CloudFront Requests | CloudFront | Total traffic volume |
| CloudFront Error Rate | CloudFront `4xxErrorRate`, `5xxErrorRate` | CDN health |
| API Gateway Latency | API Gateway | Backend performance |
| Lambda Throttles | Lambda | Capacity issues |

---

## Implementation: Extend OpsStack

### 1. Updated OpsStackProps

Add new properties to support extended monitoring:

```java
@Value.Immutable
public interface OpsStackProps extends StackProps, SubmitStackProps {
    // ... existing props ...

    List<String> lambdaFunctionArns();

    // New: Alert configuration
    @Value.Default
    default String alertEmail() { return ""; }

    // New: Canary configuration
    @Value.Default
    default int canaryIntervalMinutes() { return 5; }

    // New: RUM App Monitor ID (from ObservabilityStack)
    @Value.Default
    default String rumAppMonitorId() { return ""; }

    // New: CloudFront Distribution ID (from EdgeStack)
    @Value.Default
    default String cloudFrontDistributionId() { return ""; }

    // New: Base URL for canaries
    String baseUrl();
}
```

### 2. Extended OpsStack Constructor

```java
public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
    super(scope, id, props);

    // ... existing tags and Lambda metric collection ...

    // ============================================================================
    // SNS Topic for Alerts
    // ============================================================================
    this.alertTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-AlertTopic")
            .topicName(props.resourceNamePrefix() + "-ops-alerts")
            .displayName("DIY Accounting Submit - Operational Alerts")
            .build();

    if (props.alertEmail() != null && !props.alertEmail().isBlank()) {
        this.alertTopic.addSubscription(new EmailSubscription(props.alertEmail()));
    }

    // ============================================================================
    // Synthetic Canaries (if baseUrl provided)
    // ============================================================================
    if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
        createSyntheticCanaries(props);
    }

    // ============================================================================
    // Build Comprehensive Dashboard
    // ============================================================================
    buildDashboard(props, lambdaMetrics);
}
```

### 3. Dashboard Layout

```java
private void buildDashboard(OpsStackProps props, LambdaMetrics lambdaMetrics) {
    List<List<IWidget>> rows = new ArrayList<>();

    // Row 1: Synthetic Health (AWS Canaries + GitHub Actions)
    rows.add(List.of(
        // AWS Synthetics canary success rates
        GraphWidget.Builder.create()
            .title("AWS Canary Health")
            .left(List.of(
                createCanaryMetric(healthCanaryName, "SuccessPercent"),
                createCanaryMetric(apiCanaryName, "SuccessPercent")))
            .width(8).height(6).build(),

        // GitHub Actions synthetic test results
        GraphWidget.Builder.create()
            .title("GitHub Synthetic Tests")
            .left(List.of(
                Metric.Builder.create()
                    .namespace(apexDomain)
                    .metricName("behaviour-test")
                    .dimensionsMap(Map.of(
                        "deployment-name", props.deploymentName(),
                        "test", "submitVatBehaviour"))
                    .statistic("Minimum")
                    .period(Duration.hours(1))
                    .build()))
            .width(8).height(6).build(),

        // RUM page views (if configured)
        props.rumAppMonitorId().isBlank() ?
            TextWidget.Builder.create()
                .markdown("RUM not configured").width(8).height(6).build() :
            GraphWidget.Builder.create()
                .title("Real User Traffic (RUM)")
                .left(List.of(
                    createRumMetric(props.rumAppMonitorId(), "PageViewCount"),
                    createRumMetric(props.rumAppMonitorId(), "SessionCount")))
                .width(8).height(6).build()
    ));

    // Row 2: Business Metrics - Submissions & Sign-ups
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("VAT Submissions & Sign-ups")
            .left(List.of(
                filterLambdaMetric(lambdaMetrics, "hmrcVatReturnPost", "Invocations"),
                filterLambdaMetric(lambdaMetrics, "cognitoPostConfirmation", "Invocations")))
            .width(12).height(6).build(),

        GraphWidget.Builder.create()
            .title("HMRC Authentications & Bundle Changes")
            .left(List.of(
                filterLambdaMetric(lambdaMetrics, "hmrcTokenPost", "Invocations"),
                filterLambdaMetric(lambdaMetrics, "bundlePost", "Invocations")))
            .width(12).height(6).build()
    ));

    // Row 3: Lambda Invocations & Errors (existing)
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("Lambda Invocations by Function")
            .left(lambdaMetrics.invocations)
            .width(12).height(6).build(),
        GraphWidget.Builder.create()
            .title("Lambda Errors by Function")
            .left(lambdaMetrics.errors)
            .width(12).height(6).build()
    ));

    // Row 4: Lambda Performance (existing)
    rows.add(List.of(
        GraphWidget.Builder.create()
            .title("Lambda p95 Duration")
            .left(lambdaMetrics.durationsP95)
            .width(12).height(6).build(),
        GraphWidget.Builder.create()
            .title("Lambda Throttles")
            .left(lambdaMetrics.throttles)
            .width(12).height(6).build()
    ));

    // Row 5: Alarms Status
    rows.add(List.of(
        AlarmStatusWidget.Builder.create()
            .title("Alarm Status")
            .alarms(List.of(healthCheckAlarm, apiAlarm, githubSyntheticAlarm))
            .width(24).height(4).build()
    ));

    this.operationalDashboard = Dashboard.Builder.create(this,
            props.resourceNamePrefix() + "-Dashboard")
        .dashboardName(props.resourceNamePrefix() + "-operations")
        .widgets(rows)
        .build();
}
```

### 4. Canary Creation Helper

```java
private void createSyntheticCanaries(OpsStackProps props) {
    String canaryPrefix = sanitizeCanaryName(props.resourceNamePrefix());

    // S3 bucket for canary artifacts
    Bucket canaryBucket = Bucket.Builder.create(this, "CanaryArtifacts")
        .bucketName(props.resourceNamePrefix().toLowerCase() + "-canary-artifacts")
        .encryption(BucketEncryption.S3_MANAGED)
        .removalPolicy(RemovalPolicy.DESTROY)
        .autoDeleteObjects(true)
        .lifecycleRules(List.of(LifecycleRule.builder()
            .expiration(Duration.days(14)).build()))
        .build();

    // IAM role for canaries
    Role canaryRole = Role.Builder.create(this, "CanaryRole")
        .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
        .managedPolicies(List.of(
            ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ManagedPolicy.fromAwsManagedPolicyName("CloudWatchSyntheticsFullAccess")))
        .build();
    canaryBucket.grantReadWrite(canaryRole);

    // Health Check Canary
    String healthCanaryName = truncateCanaryName(canaryPrefix + "-health");
    this.healthCanary = Canary.Builder.create(this, "HealthCanary")
        .canaryName(healthCanaryName)
        .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_7_0)
        .test(Test.custom(Map.of(
            "handler", "healthCheck.handler",
            "code", Code.fromInline(generateHealthCheckCode(props.baseUrl())))))
        .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
        .role(canaryRole)
        .artifactsBucketLocation(ArtifactsBucketLocation.builder()
            .bucket(canaryBucket).prefix("health/").build())
        .startAfterCreation(true)
        .build();

    // Health Check Alarm
    this.healthCheckAlarm = Alarm.Builder.create(this, "HealthAlarm")
        .alarmName(props.resourceNamePrefix() + "-health-failed")
        .metric(Metric.Builder.create()
            .namespace("CloudWatchSynthetics")
            .metricName("SuccessPercent")
            .dimensionsMap(Map.of("CanaryName", healthCanaryName))
            .statistic("Average")
            .period(Duration.minutes(5)).build())
        .threshold(90)
        .evaluationPeriods(2)
        .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
        .treatMissingData(TreatMissingData.BREACHING)
        .build();

    this.healthCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
    this.healthCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

    // API Check Canary (similar pattern)
    // ...
}
```

---

## Distinguishing Synthetic vs Human Traffic

### Option A: User-Agent Filtering (Recommended)

Canaries use a distinctive User-Agent header that can be filtered:

```javascript
// In canary code
const page = await synthetics.getPage();
await page.setUserAgent('DIYAccounting-Synthetic-Monitor/1.0');
```

CloudWatch Logs Insights can then filter:
```sql
fields @timestamp, @message
| filter userAgent NOT LIKE 'DIYAccounting-Synthetic%'
| stats count(*) as realUsers by bin(1h)
```

### Option B: Separate RUM App Monitors

Create two RUM app monitors:
- `prod-submit-rum` - Production traffic (excludes synthetic IPs)
- `prod-submit-rum-synthetic` - Synthetic traffic only

### Option C: Custom Dimensions

Add a `TrafficType` dimension to custom metrics:
- `TrafficType=synthetic` for canary requests
- `TrafficType=human` for real users (default)

---

## Implementation Checklist

- [ ] Update `OpsStackProps` with new properties
- [ ] Add SNS topic and email subscription to OpsStack
- [ ] Create AWS synthetic canaries in OpsStack
- [ ] Create alarm for AWS canary failures
- [ ] Create alarm for GitHub synthetic test failures (no success in 2 hours)
- [ ] Add GitHub synthetic test metric widget to dashboard
- [ ] Add RUM metrics to dashboard (if rumAppMonitorId provided)
- [ ] Add business metrics widgets (VAT submissions, sign-ups, etc.)
- [ ] Add alarm status widget (including github-synthetic alarm)
- [ ] Update `SubmitApplication.java` to pass new props
- [ ] Add `ALERT_EMAIL` secret to GitHub
- [ ] Update `deploy-environment.yml` with new environment variables
- [ ] Test on feature branch
- [ ] Verify dashboard shows all metrics correctly
- [ ] Verify GitHub synthetic alarm triggers when tests fail

---

## Cost Estimate

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| 2 Canaries @ 5-min interval | ~$2.40 |
| S3 Storage (artifacts) | ~$0.10 |
| SNS Notifications | ~$0.10 |
| CloudWatch Alarms (4) | ~$0.40 |
| Dashboard (1) | Free (first 3) |
| **Total** | **~$3.00/month** |

---

## Dashboard Mockup

```
+============================================================================================+
|                           prod-submit-operations Dashboard                                  |
+============================================================================================+

+---------------------------+  +---------------------------+  +---------------------------+
| AWS CANARY HEALTH         |  | GITHUB SYNTHETIC TESTS    |  | REAL USER TRAFFIC (RUM)   |
|                           |  |                           |  |                           |
|  health-canary: 100%      |  |  submitVatBehaviour       |  |  Page Views: 1,234 /day   |
|  api-canary:    100%      |  |  Last success: 45m ago    |  |  Sessions:     456 /day   |
|  [====] [====]            |  |  [====] Pass rate: 98%    |  |  JS Errors:      2 /day   |
+---------------------------+  +---------------------------+  +---------------------------+

+------------------------------------------+  +------------------------------------------+
| VAT SUBMISSIONS & SIGN-UPS               |  | HMRC AUTH & BUNDLE CHANGES               |
|                                          |  |                                          |
|  [Graph: hmrcVatReturnPost invocations]  |  |  [Graph: hmrcTokenPost invocations]      |
|  [Graph: cognitoPostConfirmation]        |  |  [Graph: bundlePost invocations]         |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+------------------------------------------+  +------------------------------------------+
| LAMBDA INVOCATIONS                       |  | LAMBDA ERRORS                            |
|                                          |  |                                          |
|  [Stacked graph by function]             |  |  [Stacked graph by function]             |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+------------------------------------------+  +------------------------------------------+
| LAMBDA P95 DURATION                      |  | LAMBDA THROTTLES                         |
|                                          |  |                                          |
|  [Line graph by function]                |  |  [Line graph by function]                |
|                                          |  |                                          |
+------------------------------------------+  +------------------------------------------+

+============================================================================================+
| ALARM STATUS                                                                               |
|  [OK] aws-health    [OK] aws-api    [OK] github-synthetic    [OK] error-rate              |
+============================================================================================+
```

---

## Multi-Account Architecture & Disaster Recovery

### AWS Account Structure

```
+-----------------------------------------------------------------------------------+
|                              AWS Organizations                                     |
|                                                                                   |
|  +------------------+  +------------------+  +------------------+  +------------+ |
|  | Management/Root  |  | CI Account       |  | Prod Account     |  | Backup     | |
|  | (887764105431)   |  | (TBD)            |  | (TBD)            |  | Account    | |
|  |                  |  |                  |  |                  |  | (TBD)      | |
|  | - GitHub Actions |  | - CI deployments |  | - Production     |  | - DynamoDB | |
|  |   OIDC role      |  | - Feature branch |  |   workloads      |  |   backups  | |
|  | - Organization   |  |   testing        |  | - User data      |  | - S3       | |
|  |   management     |  | - Sandbox HMRC   |  | - Live HMRC      |  |   replicas | |
|  |                  |  |   integration    |  |   integration    |  | - Cross-   | |
|  |                  |  |                  |  |                  |  |   account  | |
|  |                  |  |                  |  |                  |  |   restore  | |
|  +------------------+  +------------------+  +------------------+  +------------+ |
|           |                    |                    |                    ^        |
|           |                    |                    |                    |        |
|           +--------------------+--------------------+--------------------+        |
|                         GitHub Actions OIDC                                       |
|                         (assumes roles in each account)                           |
+-----------------------------------------------------------------------------------+
```

### Account Purposes

| Account | Purpose | Data Classification |
|---------|---------|---------------------|
| **Management/Root** | GitHub Actions OIDC, Organizations, billing | No application data |
| **CI Account** | Feature branch deployments, automated testing | Test data only |
| **Prod Account** | Production workloads, real user data | Sensitive/PII |
| **Backup Account** | Cross-account backups, disaster recovery | Encrypted copies |

---

## Cross-Account Backup Strategy

### Data to Backup

| Resource | Source | Backup Method | RPO | RTO |
|----------|--------|---------------|-----|-----|
| DynamoDB Tables | Prod | Point-in-time + Cross-account copy | 5 min | 1 hour |
| Cognito User Pool | Prod | Export to S3 + Cross-account replica | 24 hours | 4 hours |
| S3 Static Assets | Prod | Cross-region + Cross-account replica | 15 min | 30 min |
| CloudWatch Logs | All | Export to S3 + Cross-account archive | 24 hours | N/A |
| Secrets Manager | Prod | Cross-account replica | On change | 1 hour |

### Backup Architecture

```
+------------------+                    +------------------+
|  Prod Account    |                    |  Backup Account  |
|                  |                    |                  |
|  +------------+  |   S3 Replication   |  +------------+  |
|  | DynamoDB   |--+-------------------->| DynamoDB     |  |
|  | Tables     |  |   (Cross-account)  |  | Backup      |  |
|  +------------+  |                    |  +------------+  |
|                  |                    |                  |
|  +------------+  |   EventBridge      |  +------------+  |
|  | Cognito    |--+-------------------->| User Export  |  |
|  | User Pool  |  |   (Daily export)   |  | Archive     |  |
|  +------------+  |                    |  +------------+  |
|                  |                    |                  |
|  +------------+  |   S3 CRR           |  +------------+  |
|  | S3 Origin  |--+-------------------->| S3 Replica   |  |
|  | Bucket     |  |                    |  | Bucket      |  |
|  +------------+  |                    |  +------------+  |
|                  |                    |                  |
+------------------+                    +------------------+
```

---

## Implementation: Backup Account Bootstrap

### 1. Create Backup Account (Manual - AWS Organizations Console)

```bash
# From management account, create new account
aws organizations create-account \
  --email backup@diyaccounting.co.uk \
  --account-name "DIY Accounting Backup" \
  --iam-user-access-to-billing DENY

# Note the account ID for subsequent steps
```

### 2. BackupAccountStack (New CDK Stack)

Create a new CDK application for the backup account:

```java
public class BackupAccountStack extends Stack {

    @Value.Immutable
    public interface BackupAccountStackProps extends StackProps {
        String sourceAccountId();      // Prod account ID
        String sourceBucketArn();      // S3 bucket to replicate from
        List<String> sourceTableArns(); // DynamoDB tables to backup
    }

    public BackupAccountStack(Construct scope, String id, BackupAccountStackProps props) {
        super(scope, id, props);

        // ================================================================
        // S3 Backup Bucket (receives cross-account replication)
        // ================================================================
        Bucket backupBucket = Bucket.Builder.create(this, "BackupBucket")
            .bucketName("diy-submit-backup-" + this.getAccount())
            .encryption(BucketEncryption.KMS)
            .versioned(true)
            .lifecycleRules(List.of(
                LifecycleRule.builder()
                    .transitions(List.of(
                        Transition.builder()
                            .storageClass(StorageClass.GLACIER)
                            .transitionAfter(Duration.days(90))
                            .build()))
                    .noncurrentVersionExpiration(Duration.days(365))
                    .build()))
            .build();

        // Allow source account to replicate to this bucket
        backupBucket.addToResourcePolicy(PolicyStatement.Builder.create()
            .principals(List.of(new AccountPrincipal(props.sourceAccountId())))
            .actions(List.of(
                "s3:ReplicateObject",
                "s3:ReplicateDelete",
                "s3:ReplicateTags"))
            .resources(List.of(backupBucket.arnForObjects("*")))
            .build());

        // ================================================================
        // DynamoDB Backup Vault
        // ================================================================
        BackupVault backupVault = BackupVault.Builder.create(this, "BackupVault")
            .backupVaultName("diy-submit-backup-vault")
            .encryptionKey(Key.Builder.create(this, "BackupKey")
                .enableKeyRotation(true)
                .build())
            .build();

        // ================================================================
        // Cross-Account Backup Role (for AWS Backup)
        // ================================================================
        Role crossAccountBackupRole = Role.Builder.create(this, "CrossAccountBackupRole")
            .roleName("diy-submit-cross-account-backup")
            .assumedBy(new ServicePrincipal("backup.amazonaws.com"))
            .build();

        // ================================================================
        // Restore Role (for DR scenarios)
        // ================================================================
        Role restoreRole = Role.Builder.create(this, "RestoreRole")
            .roleName("diy-submit-restore-role")
            .assumedBy(new CompositePrincipal(
                new AccountPrincipal(props.sourceAccountId()),
                new ServicePrincipal("backup.amazonaws.com")))
            .inlinePolicies(Map.of("restore-policy", PolicyDocument.Builder.create()
                .statements(List.of(
                    PolicyStatement.Builder.create()
                        .actions(List.of(
                            "dynamodb:RestoreTableFromBackup",
                            "dynamodb:RestoreTableToPointInTime",
                            "s3:GetObject",
                            "s3:ListBucket"))
                        .resources(List.of("*"))
                        .build()))
                .build()))
            .build();

        // Outputs
        cfnOutput(this, "BackupBucketArn", backupBucket.getBucketArn());
        cfnOutput(this, "BackupVaultArn", backupVault.getBackupVaultArn());
        cfnOutput(this, "RestoreRoleArn", restoreRole.getRoleArn());
    }
}
```

### 3. Source Account Configuration (Add to DataStack)

```java
// In DataStack.java - add cross-account backup configuration

// Enable Point-in-Time Recovery
Table bundlesTable = Table.Builder.create(this, "BundlesTable")
    .pointInTimeRecovery(true)  // Enable PITR
    // ... existing config
    .build();

// Create AWS Backup Plan
BackupPlan backupPlan = BackupPlan.Builder.create(this, "BackupPlan")
    .backupPlanName(props.resourceNamePrefix() + "-backup-plan")
    .backupPlanRules(List.of(
        BackupPlanRule.Builder.create()
            .ruleName("DailyBackup")
            .scheduleExpression(Schedule.cron(CronOptions.builder()
                .hour("3")
                .minute("0")
                .build()))
            .startWindow(Duration.hours(1))
            .completionWindow(Duration.hours(2))
            .deleteAfter(Duration.days(35))
            .copyActions(List.of(BackupPlanCopyActionProps.builder()
                .destinationBackupVault(BackupVault.fromBackupVaultArn(this,
                    "DestVault", props.backupAccountVaultArn()))
                .moveToColdStorageAfter(Duration.days(90))
                .deleteAfter(Duration.days(365))
                .build()))
            .build()))
    .build();

// Add DynamoDB tables to backup selection
backupPlan.addSelection("DynamoDBSelection", BackupSelection.Builder.create()
    .resources(List.of(
        BackupResource.fromDynamoDbTable(bundlesTable),
        BackupResource.fromDynamoDbTable(receiptsTable)))
    .build());
```

---

## Disaster Recovery Procedures

### Scenario 1: Recover Single DynamoDB Table

```bash
# 1. List available recovery points in backup account
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name diy-submit-backup-vault \
  --profile backup-account

# 2. Start restore job to prod account
aws backup start-restore-job \
  --recovery-point-arn arn:aws:backup:eu-west-2:BACKUP_ACCOUNT:recovery-point:xxx \
  --iam-role-arn arn:aws:iam::BACKUP_ACCOUNT:role/diy-submit-restore-role \
  --metadata '{"targetTableName":"restored-bundles-table"}' \
  --profile backup-account

# 3. Verify restored table
aws dynamodb describe-table \
  --table-name restored-bundles-table \
  --profile prod-account
```

### Scenario 2: Full Environment Recovery

```bash
#!/bin/bash
# disaster-recovery.sh - Full environment recovery script

set -euo pipefail

BACKUP_ACCOUNT="111111111111"
TARGET_ACCOUNT="222222222222"
BACKUP_VAULT="diy-submit-backup-vault"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== DIY Accounting Submit - Disaster Recovery ==="
echo "Recovering from backup account $BACKUP_ACCOUNT to $TARGET_ACCOUNT"

# 1. List latest recovery points
echo "Fetching latest recovery points..."
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT \
  --by-resource-type DynamoDB \
  --max-results 10 \
  --profile backup

# 2. Restore DynamoDB tables
for table in bundles receipts; do
  echo "Restoring $table table..."
  RECOVERY_POINT=$(aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name $BACKUP_VAULT \
    --by-resource-type DynamoDB \
    --query "RecoveryPoints[?ResourceName=='$table'] | [0].RecoveryPointArn" \
    --output text \
    --profile backup)

  aws backup start-restore-job \
    --recovery-point-arn $RECOVERY_POINT \
    --iam-role-arn arn:aws:iam::$BACKUP_ACCOUNT:role/diy-submit-restore-role \
    --metadata "{\"targetTableName\":\"recovered-$table-$TIMESTAMP\"}" \
    --profile backup
done

# 3. Restore S3 static assets
echo "Syncing S3 assets from backup..."
aws s3 sync \
  s3://diy-submit-backup-$BACKUP_ACCOUNT/ \
  s3://recovered-submit-origin-$TIMESTAMP/ \
  --profile target

# 4. Update CDK context to use recovered resources
echo "Update cdk.json with recovered resource names, then redeploy"

echo "=== Recovery Complete ==="
```

### Scenario 3: Cognito User Pool Recovery

```bash
# Cognito users are exported daily to S3
# Recovery requires re-importing users

# 1. Find latest user export
aws s3 ls s3://diy-submit-backup-ACCOUNT/cognito-exports/ \
  --profile backup | tail -1

# 2. Download export
aws s3 cp s3://diy-submit-backup-ACCOUNT/cognito-exports/latest/ ./cognito-export/ \
  --recursive --profile backup

# 3. Import users to new/recovered pool (using AWS CLI or SDK)
# Note: Passwords cannot be exported - users will need to reset
node scripts/import-cognito-users.js \
  --export-dir ./cognito-export \
  --user-pool-id NEW_POOL_ID
```

---

## GitHub Actions Multi-Account Deployment

### Updated deploy-environment.yml for Multi-Account

```yaml
env:
  MANAGEMENT_ACCOUNT_ID: '887764105431'
  CI_ACCOUNT_ID: 'TBD'
  PROD_ACCOUNT_ID: 'TBD'
  BACKUP_ACCOUNT_ID: 'TBD'

jobs:
  determine-account:
    runs-on: ubuntu-latest
    outputs:
      target-account: ${{ steps.account.outputs.account }}
      deploy-role: ${{ steps.account.outputs.role }}
    steps:
      - id: account
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "account=${{ env.PROD_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
            echo "role=arn:aws:iam::${{ env.PROD_ACCOUNT_ID }}:role/submit-deployment-role" >> $GITHUB_OUTPUT
          else
            echo "account=${{ env.CI_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
            echo "role=arn:aws:iam::${{ env.CI_ACCOUNT_ID }}:role/submit-deployment-role" >> $GITHUB_OUTPUT
          fi

  deploy:
    needs: determine-account
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::${{ env.MANAGEMENT_ACCOUNT_ID }}:role/submit-github-actions-role
          aws-region: eu-west-2

      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ needs.determine-account.outputs.deploy-role }}
          aws-region: eu-west-2
          role-chaining: true

      # Deploy to target account
      - run: npx cdk deploy --all --require-approval never
```

---

## Implementation Checklist - Multi-Account & Backup

### Phase 1: AWS Organizations Setup
- [ ] Create AWS Organization (if not exists)
- [ ] Create CI Account via Organizations
- [ ] Create Prod Account via Organizations
- [ ] Create Backup Account via Organizations
- [ ] Set up consolidated billing

### Phase 2: IAM Cross-Account Roles
- [ ] Create GitHub Actions OIDC role in Management account
- [ ] Create deployment roles in CI and Prod accounts
- [ ] Create cross-account backup role in Backup account
- [ ] Create restore role in Backup account
- [ ] Test role assumption chain

### Phase 3: Backup Infrastructure
- [ ] Deploy BackupAccountStack to Backup account
- [ ] Enable PITR on DynamoDB tables
- [ ] Configure S3 cross-account replication
- [ ] Set up AWS Backup plans
- [ ] Configure Cognito user export

### Phase 4: Recovery Testing
- [ ] Document recovery procedures
- [ ] Test single table restore
- [ ] Test full environment recovery
- [ ] Create recovery runbook
- [ ] Schedule quarterly DR drills

---

## Cost Estimate - Multi-Account & Backup

| Resource | Monthly Cost (estimate) |
|----------|------------------------|
| Additional AWS accounts | Free |
| DynamoDB PITR | ~$0.20/GB stored |
| AWS Backup storage | ~$0.05/GB (S3 Glacier) |
| S3 Cross-region replication | ~$0.02/GB transferred |
| Cross-account data transfer | Free (same region) |
| **Additional Monthly Total** | **~$5-10/month** |

---

## Future Enhancements

1. **OAuth Flow Canary** - Full HMRC sandbox authentication test (Phase 2)
2. **VAT Submission Canary** - End-to-end sandbox submission (Phase 3)
3. **Anomaly Detection** - ML-based alerting for unusual patterns
4. **Cost Dashboard** - AWS Cost Explorer integration
5. **SLO/SLI Tracking** - Error budget and availability targets
6. **Automated DR Testing** - Monthly automated recovery verification
7. **Multi-Region Failover** - Active-passive in eu-west-1
