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

        // ----------------------------------------------------------------------------------
        // PLAN_ISSUE_10 acceptance criterion 1 remainder: an alarm on any GetSecretValue read
        // of the salt secret by a principal outside the deployment pipeline. The resource
        // policy (scripts/put-salt-secret-resource-policy.sh) stops unexpected reads; this
        // alarm catches a read from a principal the policy does allow but that isn't expected
        // to read the salt day-to-day, e.g. a console session or SSO user assuming a role that
        // happens to match the policy's allow patterns.
        //
        // Every legitimate reader assumes a role whose name starts with the environment name
        // (see SubmitSharedNames' *-app-* / *-env-* naming), so this fires on a console read, an
        // SSO session, or any role created outside the deployment pipeline. It is expected to
        // fire during salt backup and rotation -- runbook section 6.6 documents that.
        //
        // The GitHub Actions deployment role is named "submit-<env>-deployment-role" (see
        // scripts/aws-accounts/bootstrap-account.sh), which does not match the "<env>-*" pattern
        // above, so it is excluded by exact name too: the CDK deploy itself reads the salt
        // secret's resource policy grant.
        // ----------------------------------------------------------------------------------
        String deploymentRoleName = "submit-%s-deployment-role".formatted(props.envName());
        String saltReadMetricName = "SaltSecretUnexpectedRead";
        MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-SaltSecretReadMetricFilter")
                .logGroup(cloudTrailLogGroup)
                .filterPattern(FilterPattern.literal(
                        ("{ ($.eventSource = \"secretsmanager.amazonaws.com\") && ($.eventName = \"GetSecretValue\")"
                                        + " && ($.requestParameters.secretId = \"*user-sub-hash-salt*\")"
                                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"%s-*\")"
                                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"%s\") }")
                                .formatted(props.envName(), deploymentRoleName)))
                .metricNamespace("Submit/Security")
                .metricName(saltReadMetricName)
                .metricValue("1")
                .defaultValue(0)
                .build();

        Alarm saltSecretUnexpectedReadAlarm =
                Alarm.Builder.create(this, props.resourceNamePrefix() + "-SaltSecretUnexpectedReadAlarm")
                        .alarmName(props.resourceNamePrefix() + "-salt-secret-unexpected-read")
                        .alarmDescription(
                                "GetSecretValue on the user-sub-hash-salt secret by a principal whose role name"
                                        + " does not start with this environment's name. Expected during salt"
                                        + " backup and rotation (runbook section 6.6); otherwise investigate.")
                        .metric(Metric.Builder.create()
                                .namespace("Submit/Security")
                                .metricName(saltReadMetricName)
                                .statistic("Sum")
                                .period(Duration.minutes(5))
                                .build())
                        .threshold(1)
                        .evaluationPeriods(1)
                        .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                        .treatMissingData(TreatMissingData.NOT_BREACHING)
                        .build();
        saltSecretUnexpectedReadAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));

        // ----------------------------------------------------------------------------------
        // The fourteen CIS AWS Foundations Benchmark CloudWatch log metric filter controls
        // (CIS CloudWatch.1 through .14), each a metric filter plus an any-occurrence alarm on
        // the same CloudTrail log group, following the shape above. The trail already records
        // global service events, so IAM, and other global-service activity is visible here even
        // though the trail itself is single-region.
        // ----------------------------------------------------------------------------------
        String deploymentRoleNameCis = "submit-%s-deployment-role".formatted(props.envName());
        String deploymentRoleExclusion =
                " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"%s\")"
                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"cdk-hnb659fds-cfn-exec-role-*\")"
                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"cdk-hnb659fds-deploy-role-*\")"
                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"cdk-hnb659fds-file-publishing-role-*\")"
                        + " && ($.userIdentity.sessionContext.sessionIssuer.userName != \"cdk-hnb659fds-lookup-role-*\")"
                .formatted(deploymentRoleNameCis);

        for (CisControl control : CIS_CONTROLS) {
            String metricName = "Cis" + control.name();
            String filterPatternStr = control.filterPattern();

            // Exclude deploy and CDK bootstrap roles from filters that monitor infrastructure
            // changes the deployment pipeline itself performs (see PLAN_ISSUE_30, B30q).
            if (control.name().equals("UnauthorizedApiCalls")
                    || control.name().equals("IamPolicyChanges")
                    || control.name().equals("S3BucketPolicyChanges")
                    || control.name().equals("SecurityGroupChanges")
                    || control.name().equals("NaclChanges")
                    || control.name().equals("NetworkGatewayChanges")
                    || control.name().equals("RouteTableChanges")
                    || control.name().equals("VpcChanges")) {
                // Patterns end with " }" so insert the exclusion before the closing brace.
                filterPatternStr = filterPatternStr.substring(0, filterPatternStr.length() - 2)
                        + deploymentRoleExclusion
                        + " }";
            }

            MetricFilter.Builder.create(this, props.resourceNamePrefix() + "-Cis" + control.name() + "MetricFilter")
                    .logGroup(cloudTrailLogGroup)
                    .filterPattern(FilterPattern.literal(filterPatternStr))
                    .metricNamespace("Submit/Security")
                    .metricName(metricName)
                    .metricValue("1")
                    .defaultValue(0)
                    .build();

            Alarm cisAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-Cis" + control.name() + "Alarm")
                    .alarmName(props.resourceNamePrefix() + "-cis-" + control.slug())
                    .alarmDescription(control.description())
                    .metric(Metric.Builder.create()
                            .namespace("Submit/Security")
                            .metricName(metricName)
                            .statistic("Sum")
                            .period(Duration.minutes(5))
                            .build())
                    .threshold(1)
                    .evaluationPeriods(1)
                    .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                    .treatMissingData(TreatMissingData.NOT_BREACHING)
                    .build();
            cisAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));
        }

        infof(
                "SecurityDetectionStack %s created: DynamoDB customer-table Scan and GetItem-volume alarms, the salt"
                        + " secret unexpected-read alarm, and the fourteen CIS CloudWatch metric filter controls, all"
                        + " wired to the security-findings topic",
                this.getNode().getId());
    }

    /** One CIS AWS Foundations Benchmark CloudWatch log metric filter control. */
    private record CisControl(String name, String slug, String description, String filterPattern) {}

    private static final List<CisControl> CIS_CONTROLS = List.of(
            new CisControl(
                    "UnauthorizedApiCalls",
                    "unauthorized-api-calls",
                    "CIS CloudWatch.1: an unauthorized API call was made",
                    "{ ($.errorCode = \"*UnauthorizedAccess*\") || ($.errorCode = \"AccessDenied*\") }"),
            new CisControl(
                    "ConsoleSigninWithoutMfa",
                    "console-signin-without-mfa",
                    "CIS CloudWatch.2: a console sign-in was made without MFA",
                    "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") }"),
            new CisControl(
                    "RootAccountUsage",
                    "root-account-usage",
                    "CIS CloudWatch.3: the root account was used",
                    "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS &&"
                            + " $.eventType != \"AwsServiceEvent\" }"),
            new CisControl(
                    "IamPolicyChanges",
                    "iam-policy-changes",
                    "CIS CloudWatch.4: an IAM policy was changed",
                    "{ ($.eventName = DeleteGroupPolicy) || ($.eventName = DeleteRolePolicy) ||"
                            + " ($.eventName = DeleteUserPolicy) || ($.eventName = PutGroupPolicy) ||"
                            + " ($.eventName = PutRolePolicy) || ($.eventName = PutUserPolicy) ||"
                            + " ($.eventName = CreatePolicy) || ($.eventName = DeletePolicy) ||"
                            + " ($.eventName = CreatePolicyVersion) || ($.eventName = DeletePolicyVersion) ||"
                            + " ($.eventName = AttachRolePolicy) || ($.eventName = DetachRolePolicy) ||"
                            + " ($.eventName = AttachUserPolicy) || ($.eventName = DetachUserPolicy) ||"
                            + " ($.eventName = AttachGroupPolicy) || ($.eventName = DetachGroupPolicy) }"),
            new CisControl(
                    "CloudTrailConfigurationChanges",
                    "cloudtrail-configuration-changes",
                    "CIS CloudWatch.5: CloudTrail's own configuration was changed",
                    "{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) ||"
                            + " ($.eventName = StartLogging) || ($.eventName = StopLogging) }"),
            new CisControl(
                    "ConsoleAuthenticationFailures",
                    "console-authentication-failures",
                    "CIS CloudWatch.6: a console sign-in authentication attempt failed",
                    "{ ($.eventName = ConsoleLogin) && ($.errorMessage = \"Failed authentication\") }"),
            new CisControl(
                    "CmkDeletion",
                    "cmk-deletion",
                    "CIS CloudWatch.7: a customer managed KMS key was disabled or scheduled for deletion",
                    "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) ||"
                            + " ($.eventName = ScheduleKeyDeletion)) }"),
            new CisControl(
                    "S3BucketPolicyChanges",
                    "s3-bucket-policy-changes",
                    "CIS CloudWatch.8: an S3 bucket policy or ACL was changed",
                    "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) ||"
                            + " ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) ||"
                            + " ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) ||"
                            + " ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) ||"
                            + " ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }"),
            new CisControl(
                    "AwsConfigChanges",
                    "aws-config-changes",
                    "CIS CloudWatch.9: AWS Config's own configuration was changed",
                    "{ ($.eventSource = config.amazonaws.com) && (($.eventName = StopConfigurationRecorder) ||"
                            + " ($.eventName = DeleteDeliveryChannel) || ($.eventName = PutDeliveryChannel) ||"
                            + " ($.eventName = PutConfigurationRecorder)) }"),
            new CisControl(
                    "SecurityGroupChanges",
                    "security-group-changes",
                    "CIS CloudWatch.10: a security group was changed",
                    "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) ||"
                            + " ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) ||"
                            + " ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }"),
            new CisControl(
                    "NaclChanges",
                    "nacl-changes",
                    "CIS CloudWatch.11: a network ACL was changed",
                    "{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) ||"
                            + " ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) ||"
                            + " ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }"),
            new CisControl(
                    "NetworkGatewayChanges",
                    "network-gateway-changes",
                    "CIS CloudWatch.12: a network gateway was changed",
                    "{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) ||"
                            + " ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) ||"
                            + " ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }"),
            new CisControl(
                    "RouteTableChanges",
                    "route-table-changes",
                    "CIS CloudWatch.13: a route table was changed",
                    "{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) ||"
                            + " ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) ||"
                            + " ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) ||"
                            + " ($.eventName = DisassociateRouteTable) }"),
            new CisControl(
                    "VpcChanges",
                    "vpc-changes",
                    "CIS CloudWatch.14: a VPC was changed",
                    "{ ($.eventName = CreateVpc) || ($.eventName = DeleteVpc) || ($.eventName = ModifyVpcAttribute) ||"
                            + " ($.eventName = AcceptVpcPeeringConnection) || ($.eventName = CreateVpcPeeringConnection) ||"
                            + " ($.eventName = DeleteVpcPeeringConnection) || ($.eventName = RejectVpcPeeringConnection) ||"
                            + " ($.eventName = AttachClassicLinkVpc) || ($.eventName = DetachClassicLinkVpc) ||"
                            + " ($.eventName = DisableVpcClassicLink) || ($.eventName = EnableVpcClassicLink) }"));
}

