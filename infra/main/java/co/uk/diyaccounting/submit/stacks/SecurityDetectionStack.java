/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.amazon.awscdk.services.sns.ITopic;
import software.amazon.awscdk.services.sns.Topic;
import software.constructs.Construct;

/**
 * Environment-level detection alarms for issue #9 (scan detection) and issue #10 (data theft
 * detection), built on the CloudTrail DynamoDB data events ObservabilityStack already collects.
 *
 * <p>This stack does not create its own CloudTrail trail or SNS topic: it imports the trail's
 * CloudWatch Logs group and the security-findings topic ObservabilityStack creates, by the same
 * deterministic naming convention ObservabilityStack uses, so it can be deployed and destroyed
 * independently of that stack while still depending on it for deployment ordering.
 */
public class SecurityDetectionStack extends Stack {

    @Value.Immutable
    public interface SecurityDetectionStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        // Must match the value passed to ObservabilityStack so the CloudTrail log group name
        // this stack imports resolves to the same log group ObservabilityStack's trail writes to.
        String cloudTrailLogGroupPrefix();

        static ImmutableSecurityDetectionStackProps.Builder builder() {
            return ImmutableSecurityDetectionStackProps.builder();
        }
    }

    public SecurityDetectionStack(Construct scope, String id, SecurityDetectionStackProps props) {
        this(scope, id, null, props);
    }

    public SecurityDetectionStack(Construct scope, String id, StackProps stackProps, SecurityDetectionStackProps props) {
        super(scope, id, stackProps);

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        if (!cloudTrailEnabled) {
            infof(
                    "SecurityDetectionStack %s: CloudTrail disabled for this environment, skipping detection alarms",
                    this.getNode().getId());
            return;
        }

        // Import the CloudTrail log group ObservabilityStack creates. Naming must match
        // ObservabilityStack's cloudTrailLogGroupName exactly: "%s%s-cloud-trail".
        String cloudTrailLogGroupName =
                "%s%s-cloud-trail".formatted(props.cloudTrailLogGroupPrefix(), props.resourceNamePrefix());
        ILogGroup cloudTrailLogGroup =
                LogGroup.fromLogGroupName(this, props.resourceNamePrefix() + "-DetectionCloudTrailGroup", cloudTrailLogGroupName);

        // Import the security-findings SNS topic ObservabilityStack creates. Naming must match
        // ObservabilityStack's securityFindingsTopic topicName exactly: "%s-security-findings".
        String securityFindingsTopicArn = "arn:aws:sns:%s:%s:%s-security-findings"
                .formatted(this.getRegion(), this.getAccount(), props.resourceNamePrefix());
        ITopic securityFindingsTopic =
                Topic.fromTopicArn(this, props.resourceNamePrefix() + "-DetectionSecurityFindingsTopic", securityFindingsTopicArn);

        // Customer data tables in scope for data-theft detection (PLAN_ISSUE_10 acceptance
        // criterion 1): receipts, bundles, passes, subscriptions, hmrc-api-requests. Excludes
        // the async-request and bundle-capacity tables, which hold operational state rather than
        // customer records.
        List<String> customerTableNames = List.of(
                props.sharedNames().receiptsTableName,
                props.sharedNames().bundlesTableName,
                props.sharedNames().passesTableName,
                props.sharedNames().subscriptionsTableName,
                props.sharedNames().hmrcApiRequestsTableName);

        String tableNameClause = customerTableNames.stream()
                .map(tableName -> "$.requestParameters.tableName = \"%s\"".formatted(tableName))
                .reduce((a, b) -> a + " || " + b)
                .orElseThrow();

        // ----------------------------------------------------------------------------------
        // PLAN_ISSUE_10 acceptance criterion 2 / PLAN_SECURITY_DETECTION_UPLIFT 2.2:
        // "any IAM principal performing dynamodb:Scan on customer tables ... raises a detection
        // event". App code never calls Scan against these tables (grantReadData() includes Scan
        // in the IAM grant, but no caller invokes it), so any Scan CloudTrail event here is a
        // clean, near-zero-false-positive signal. Threshold: any occurrence (>= 1).
        // ----------------------------------------------------------------------------------
        String scanMetricName = "DynamoDbCustomerTableScan";
        MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-DynamoDbScanMetricFilter")
                .logGroup(cloudTrailLogGroup)
                .filterPattern(FilterPattern.literal(
                        "{ ($.eventSource = \"dynamodb.amazonaws.com\") && ($.eventName = \"Scan\") && (%s) }"
                                .formatted(tableNameClause)))
                .metricNamespace("Submit/Security")
                .metricName(scanMetricName)
                .metricValue("1")
                .defaultValue(0)
                .build();

        Alarm dynamoDbScanAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-DynamoDbScanAlarm")
                .alarmName(props.resourceNamePrefix() + "-dynamodb-customer-table-scan")
                .alarmDescription(
                        "A Scan operation ran against a customer data table (receipts, bundles, passes, "
                                + "subscriptions, or hmrc-api-requests). App code never calls Scan on these "
                                + "tables, so this is a strong signal of bulk data access outside normal use.")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Security")
                        .metricName(scanMetricName)
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
        dynamoDbScanAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));

        // ----------------------------------------------------------------------------------
        // PLAN_SECURITY_DETECTION_UPLIFT 2.2 acceptance criterion: "Alarm fires on > 1000 GetItem
        // in 5 minutes" against the customer data tables.
        // ----------------------------------------------------------------------------------
        String getItemMetricName = "DynamoDbCustomerTableGetItem";
        MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-DynamoDbGetItemMetricFilter")
                .logGroup(cloudTrailLogGroup)
                .filterPattern(FilterPattern.literal(
                        "{ ($.eventSource = \"dynamodb.amazonaws.com\") && ($.eventName = \"GetItem\") && (%s) }"
                                .formatted(tableNameClause)))
                .metricNamespace("Submit/Security")
                .metricName(getItemMetricName)
                .metricValue("1")
                .defaultValue(0)
                .build();

        Alarm dynamoDbGetItemVolumeAlarm =
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-DynamoDbGetItemVolumeAlarm")
                        .alarmName(props.resourceNamePrefix() + "-dynamodb-customer-table-getitem-volume")
                        .alarmDescription(
                                "More than 1000 GetItem calls against a customer data table in 5 minutes, "
                                        + "consistent with bulk read access to receipts, bundles, passes, "
                                        + "subscriptions, or hmrc-api-requests.")
                        .metric(Metric.Builder.create()
                                .namespace("Submit/Security")
                                .metricName(getItemMetricName)
                                .statistic("Sum")
                                .period(Duration.minutes(5))
                                .build())
                        .threshold(1000)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .build();
        dynamoDbGetItemVolumeAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));

        infof(
                "SecurityDetectionStack %s created: DynamoDB customer-table Scan and GetItem-volume alarms wired to"
                        + " the security-findings topic",
                this.getNode().getId());
    }
}
