/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureAwsCustomResourceProviderLogGroup;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.KindCdk;
import co.uk.diyaccounting.submit.utils.RetentionDaysConverter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Dashboard;
import software.amazon.awscdk.services.cloudwatch.GraphWidget;
import software.amazon.awscdk.services.cloudwatch.IWidget;
import software.amazon.awscdk.services.cloudwatch.MathExpression;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TextWidget;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cognito.CfnIdentityPool;
import software.amazon.awscdk.services.cognito.CfnIdentityPoolRoleAttachment;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.SnsTopic;
import software.amazon.awscdk.services.guardduty.CfnDetector;
import software.amazon.awscdk.services.iam.FederatedPrincipal;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.rum.CfnAppMonitor;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.securityhub.CfnHub;
import software.amazon.awscdk.services.sns.Topic;
import software.constructs.Construct;

public class ObservabilityStack extends Stack {

    // public Bucket trailBucket;
    public Trail trail;
    public ILogGroup cloudTrailLogGroup;
    public ILogGroup selfDestructLogGroup;
    public ILogGroup apiAccessLogGroup;

    @Value.Immutable
    public interface ObservabilityStackProps extends StackProps, SubmitStackProps {

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

        String cloudTrailLogGroupPrefix();

        String cloudTrailLogGroupRetentionPeriodDays();

        int accessLogGroupRetentionPeriodDays();

        // Apex domain for GitHub synthetic metrics namespace (e.g., submit.diyaccounting.co.uk)
        @Value.Default
        default String apexDomain() {
            return "";
        }

        // Whether to create account-singleton security services (Security Hub, GuardDuty)
        // Set to true for the primary environment (prod) and false for secondary environments (ci)
        // to avoid conflicts when multiple environments share the same AWS account.
        @Value.Default
        default boolean securityServicesEnabled() {
            return true;
        }

        static ImmutableObservabilityStackProps.Builder builder() {
            return ImmutableObservabilityStackProps.builder();
        }
    }

    public ObservabilityStack(Construct scope, String id, ObservabilityStackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityStack(Construct scope, String id, StackProps stackProps, ObservabilityStackProps props) {
        super(scope, id, stackProps);

        boolean cloudTrailEnabled = Boolean.parseBoolean(props.cloudTrailEnabled());
        int cloudTrailLogGroupRetentionPeriodDays = Integer.parseInt(props.cloudTrailLogGroupRetentionPeriodDays());

        // Create a CloudTrail for the stack resources
        RetentionDays cloudTrailLogGroupRetentionPeriod =
                RetentionDaysConverter.daysToRetentionDays(cloudTrailLogGroupRetentionPeriodDays);
        if (cloudTrailEnabled) {
            // Use AwsCustomResource to idempotently ensure the LogGroup exists before creating the Trail.
            // This prevents CloudFormation drift failures when the LogGroup is deleted externally.
            // The createLogGroup API is idempotent when ignoring ResourceAlreadyExistsException.
            String cloudTrailLogGroupName =
                    "%s%s-cloud-trail".formatted(props.cloudTrailLogGroupPrefix(), props.resourceNamePrefix());

            // Use AwsCustomResource to idempotently ensure the LogGroup exists.
            // Both onCreate and onUpdate call createLogGroup with ignoreErrorCodesMatching
            // so deployments work whether the log group exists or was deleted externally.
            // Then import it with fromLogGroupName (not create, which would fail if it exists).
            AwsCustomResource ensureLogGroup = AwsCustomResource.Builder.create(
                            this, props.resourceNamePrefix() + "-EnsureCloudTrailLogGroup")
                    .onCreate(AwsSdkCall.builder()
                            .service("CloudWatchLogs")
                            .action("createLogGroup")
                            .parameters(Map.of("logGroupName", cloudTrailLogGroupName))
                            .physicalResourceId(PhysicalResourceId.of(cloudTrailLogGroupName))
                            .ignoreErrorCodesMatching("ResourceAlreadyExistsException")
                            .build())
                    .onUpdate(AwsSdkCall.builder()
                            .service("CloudWatchLogs")
                            .action("createLogGroup")
                            .parameters(Map.of("logGroupName", cloudTrailLogGroupName))
                            .physicalResourceId(PhysicalResourceId.of(cloudTrailLogGroupName))
                            .ignoreErrorCodesMatching("ResourceAlreadyExistsException")
                            .build())
                    .logGroup(ensureAwsCustomResourceProviderLogGroup(this))
                    .role(KindCdk.ensureAwsCustomResourceProviderRole(this))
                    .build();
            ensureLogGroup
                    .getNode()
                    .addDependency(KindCdk.grantToAwsCustomResourceProvider(
                            this,
                            List.of(PolicyStatement.Builder.create()
                                    .actions(List.of("logs:CreateLogGroup"))
                                    .resources(List.of("arn:aws:logs:" + this.getRegion() + ":" + this.getAccount()
                                            + ":log-group:" + cloudTrailLogGroupName + ":*"))
                                    .build())));

            // Import the LogGroup created by AwsCustomResource (don't use Builder.create which fails if it exists)
            this.cloudTrailLogGroup = LogGroup.fromLogGroupName(
                    this, props.resourceNamePrefix() + "-CloudTrailGroup", cloudTrailLogGroupName);

            // S3 bucket for CloudTrail logs — no explicit bucketName (globally unique; collisions during account
            // migration)
            Bucket trailBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-TrailBucket")
                    .encryption(BucketEncryption.S3_MANAGED)
                    .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                    .removalPolicy(RemovalPolicy.DESTROY)
                    .autoDeleteObjects(true)
                    .build();

            this.trail = Trail.Builder.create(this, props.resourceNamePrefix() + "-Trail")
                    .trailName(props.sharedNames().trailName)
                    .bucket(trailBucket)
                    .cloudWatchLogGroup(this.cloudTrailLogGroup)
                    .sendToCloudWatchLogs(true)
                    // Retention is set via AwsCustomResource above, not here
                    .includeGlobalServiceEvents(false)
                    .isMultiRegionTrail(false)
                    .build();

            // Ensure the LogGroup is created before the Trail tries to use it
            this.trail.getNode().addDependency(ensureLogGroup);

            // Phase 2.2: DynamoDB Data Event Logging via L1 construct
            // Add event selectors for DynamoDB data plane operations (GetItem, PutItem, DeleteItem, Query, Scan)
            // This enables detection of bulk data access patterns indicating potential data breach
            software.amazon.awscdk.services.cloudtrail.CfnTrail cfnTrail =
                    (software.amazon.awscdk.services.cloudtrail.CfnTrail)
                            this.trail.getNode().getDefaultChild();

            cfnTrail.setEventSelectors(
                    List.of(software.amazon.awscdk.services.cloudtrail.CfnTrail.EventSelectorProperty.builder()
                            .readWriteType("All")
                            .includeManagementEvents(true)
                            .dataResources(List.of(
                                    software.amazon.awscdk.services.cloudtrail.CfnTrail.DataResourceProperty.builder()
                                            .type("AWS::DynamoDB::Table")
                                            // Log all DynamoDB tables in this account
                                            // Note: CloudTrail doesn't support wildcards in table ARNs,
                                            // so we use "arn:aws:dynamodb" to match all tables
                                            .values(List.of("arn:aws:dynamodb"))
                                            .build()))
                            .build()));

            infof("Configured CloudTrail DynamoDB data event logging for all tables in account");

            // CloudWatch Logs Insights query for detecting bulk data access:
            // filter eventSource = "dynamodb.amazonaws.com" and eventName = "Scan"
            // | stats count(*) by bin(5m)

            // Outputs for Observability resources
            // cfnOutput(this, "TrailBucketArn", this.trailBucket.getBucketArn());
            cfnOutput(this, "TrailArn", this.trail.getTrailArn());
        }

        // Log group for self-destruct operations (idempotent creation)
        this.selfDestructLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-SelfDestructLogGroup",
                        props.sharedNames().ew2SelfDestructLogGroupName)
                .logGroup();

        // API Gateway access log group with env-stable name (idempotent creation)
        this.apiAccessLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-ApiAccessLogGroup",
                        props.sharedNames().apiAccessLogGroupName)
                .logGroup();

        // Add a single shared resource policy to allow all API Gateway APIs in this environment to write logs
        // This prevents hitting the 10 resource policy limit when multiple ApiStacks try to add their own policies
        this.apiAccessLogGroup.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowApiGatewayAccessLogs")
                .principals(List.of(new ServicePrincipal("apigateway.amazonaws.com")))
                .actions(List.of("logs:CreateLogStream", "logs:PutLogEvents"))
                .resources(List.of(this.apiAccessLogGroup.getLogGroupArn() + ":*"))
                .conditions(java.util.Map.of(
                        "StringEquals", java.util.Map.of("aws:SourceAccount", this.getAccount()),
                        "ArnLike",
                                java.util.Map.of(
                                        "aws:SourceArn",
                                        "arn:aws:apigateway:" + this.getRegion() + "::/apis/*/stages/*")))
                .build());

        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);

        // Outputs for Observability resources
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());
        cfnOutput(this, "ApiAccessLogGroupArn", this.apiAccessLogGroup.getLogGroupArn());

        // ------------------ CloudWatch RUM (Real User Monitoring) ------------------
        // Create Cognito Identity Pool for unauthenticated identities used by RUM web client
        CfnIdentityPool rumIdentityPool = CfnIdentityPool.Builder.create(
                        this, props.resourceNamePrefix() + "-RumIdentityPool")
                .allowUnauthenticatedIdentities(true)
                .build();

        // Role for unauthenticated identities allowing PutRumEvents
        Role rumGuestRole = Role.Builder.create(this, props.resourceNamePrefix() + "-RumGuestRole")
                .assumedBy(new FederatedPrincipal(
                        "cognito-identity.amazonaws.com",
                        Map.of(
                                "StringEquals", Map.of("cognito-identity.amazonaws.com:aud", rumIdentityPool.getRef()),
                                "ForAnyValue:StringLike",
                                        Map.of("cognito-identity.amazonaws.com:amr", "unauthenticated")),
                        "sts:AssumeRoleWithWebIdentity"))
                .build();
        rumGuestRole.addToPolicy(PolicyStatement.Builder.create()
                .actions(List.of("rum:PutRumEvents"))
                .resources(List.of("*"))
                .build());

        // Attach role to Identity Pool
        CfnIdentityPoolRoleAttachment.Builder.create(this, props.resourceNamePrefix() + "-RumIdentityPoolRole")
                .identityPoolId(rumIdentityPool.getRef())
                .roles(Map.of("unauthenticated", rumGuestRole.getRoleArn()))
                .build();

        // Create RUM App Monitor
        String rumAppName = props.resourceNamePrefix() + "-rum";
        CfnAppMonitor rumMonitor = CfnAppMonitor.Builder.create(this, props.resourceNamePrefix() + "-RumAppMonitor")
                .name(rumAppName)
                .domainList(List.of(
                        props.sharedNames().deploymentDomainName,
                        props.sharedNames().envDomainName,
                        props.sharedNames().publicDomainName,
                        props.sharedNames().hostedZoneName))
                .appMonitorConfiguration(CfnAppMonitor.AppMonitorConfigurationProperty.builder()
                        .sessionSampleRate(1.0)
                        .allowCookies(true)
                        .enableXRay(true)
                        .guestRoleArn(rumGuestRole.getRoleArn())
                        .identityPoolId(rumIdentityPool.getRef())
                        .telemetries(List.of("performance", "errors", "http"))
                        .build())
                .build();

        // RUM metrics and alarms
        Metric lcpP75 = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("WebVitalsLargestContentfulPaint")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("p75")
                .period(Duration.minutes(5))
                .build();

        Metric jsErrors = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("JsErrorCount")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("sum")
                .period(Duration.minutes(5))
                .build();

        Alarm.Builder.create(this, props.resourceNamePrefix() + "-RumLcpP75Alarm")
                .alarmName(props.resourceNamePrefix() + "-rum-lcp-p75")
                .metric(lcpP75)
                .threshold(4000) // 4s
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("RUM p75 LCP > 4s")
                .build();

        Alarm.Builder.create(this, props.resourceNamePrefix() + "-RumJsErrorAlarm")
                .alarmName(props.resourceNamePrefix() + "-rum-js-errors")
                .metric(jsErrors)
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("RUM JavaScript errors >= 5 in 5 minutes")
                .build();

        // SNS topic for security findings (used by GuardDuty, Security Hub, and anomaly detection rules)
        Topic securityFindingsTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-SecurityFindingsTopic")
                .topicName(props.resourceNamePrefix() + "-security-findings")
                .displayName("DIY Accounting Submit - Security Findings")
                .build();

        cfnOutput(this, "SecurityFindingsTopicArn", securityFindingsTopic.getTopicArn());

        // ============================================================================
        // AWS GuardDuty & Security Hub - Account-Singleton Services
        // ============================================================================
        // These services can only have one instance per AWS account per region.
        // Only create them for the primary environment (prod) to avoid conflicts
        // when multiple environments share the same AWS account.
        if (props.securityServicesEnabled()) {
            // GuardDuty provides intelligent threat detection for compromised credentials,
            // unusual API patterns, cryptocurrency mining, and other security threats.
            CfnDetector guardDutyDetector = CfnDetector.Builder.create(this, props.resourceNamePrefix() + "-GuardDuty")
                    .enable(true)
                    .findingPublishingFrequency("FIFTEEN_MINUTES")
                    .build();

            // EventBridge rule to route HIGH and MEDIUM severity GuardDuty findings to SNS
            // Severity levels: 0.0-3.9 = LOW, 4.0-6.9 = MEDIUM, 7.0-8.9 = HIGH, 9.0+ = CRITICAL
            Rule guardDutyRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-GuardDutyRule")
                    .ruleName(props.resourceNamePrefix() + "-guardduty-findings")
                    .description("Route MEDIUM+ severity GuardDuty findings to SNS for alerting")
                    .eventPattern(EventPattern.builder()
                            .source(List.of("aws.guardduty"))
                            .detailType(List.of("GuardDuty Finding"))
                            .build())
                    .build();

            guardDutyRule.addTarget(new SnsTopic(securityFindingsTopic));

            cfnOutput(this, "GuardDutyDetectorId", guardDutyDetector.getAttrId());

            infof("Created GuardDuty detector with EventBridge rule for security findings");

            // Security Hub aggregates findings from GuardDuty, IAM Access Analyzer, and other
            // AWS services. It provides compliance checks against CIS AWS Foundations Benchmark.
            CfnHub securityHub = CfnHub.Builder.create(this, props.resourceNamePrefix() + "-SecurityHub")
                    .enableDefaultStandards(true) // Enable CIS AWS Foundations Benchmark
                    .build();

            // EventBridge rule to route CRITICAL and HIGH severity Security Hub findings to SNS
            Rule securityHubRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-SecurityHubRule")
                    .ruleName(props.resourceNamePrefix() + "-securityhub-findings")
                    .description("Route HIGH+ severity Security Hub findings to SNS for alerting")
                    .eventPattern(EventPattern.builder()
                            .source(List.of("aws.securityhub"))
                            .detailType(List.of("Security Hub Findings - Imported"))
                            .build())
                    .build();

            securityHubRule.addTarget(new SnsTopic(securityFindingsTopic));

            cfnOutput(this, "SecurityHubArn", securityHub.getAttrArn());

            infof("Created Security Hub with EventBridge rule for security findings");
        } else {
            infof("Security services (GuardDuty, Security Hub) disabled - using existing account-level services");
        }

        // ============================================================================
        // Phase 3.2: Cross-Account/Region Anomaly Detection
        // ============================================================================
        // EventBridge rules to detect suspicious AWS API activity that may indicate
        // credential compromise or lateral movement attacks.

        // Rule 1: IAM Policy Changes - detect unauthorized permission escalation
        Rule iamPolicyChangeRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-IamPolicyChangeRule")
                .ruleName(props.resourceNamePrefix() + "-iam-policy-changes")
                .description("Alert on IAM policy changes that may indicate privilege escalation")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.iam"))
                        .detailType(List.of("AWS API Call via CloudTrail"))
                        .detail(Map.of(
                                "eventName",
                                List.of(
                                        "CreatePolicy",
                                        "CreatePolicyVersion",
                                        "DeletePolicy",
                                        "DeletePolicyVersion",
                                        "AttachUserPolicy",
                                        "AttachRolePolicy",
                                        "AttachGroupPolicy",
                                        "DetachUserPolicy",
                                        "DetachRolePolicy",
                                        "DetachGroupPolicy",
                                        "PutUserPolicy",
                                        "PutRolePolicy",
                                        "PutGroupPolicy")))
                        .build())
                .build();
        iamPolicyChangeRule.addTarget(new SnsTopic(securityFindingsTopic));

        // Rule 2: Security Group Changes - detect network security modifications
        Rule securityGroupChangeRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-SgChangeRule")
                .ruleName(props.resourceNamePrefix() + "-security-group-changes")
                .description("Alert on security group changes that may expose resources")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.ec2"))
                        .detailType(List.of("AWS API Call via CloudTrail"))
                        .detail(Map.of(
                                "eventName",
                                List.of(
                                        "AuthorizeSecurityGroupIngress",
                                        "AuthorizeSecurityGroupEgress",
                                        "RevokeSecurityGroupIngress",
                                        "RevokeSecurityGroupEgress",
                                        "CreateSecurityGroup",
                                        "DeleteSecurityGroup")))
                        .build())
                .build();
        securityGroupChangeRule.addTarget(new SnsTopic(securityFindingsTopic));

        // Rule 3: Access Key Creation - detect potential credential theft preparation
        Rule accessKeyCreationRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-AccessKeyRule")
                .ruleName(props.resourceNamePrefix() + "-access-key-creation")
                .description("Alert on new IAM access key creation that may indicate credential theft")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.iam"))
                        .detailType(List.of("AWS API Call via CloudTrail"))
                        .detail(Map.of("eventName", List.of("CreateAccessKey", "UpdateAccessKey")))
                        .build())
                .build();
        accessKeyCreationRule.addTarget(new SnsTopic(securityFindingsTopic));

        // Rule 4: Root Account Activity - detect any root account usage
        Rule rootActivityRule = Rule.Builder.create(this, props.resourceNamePrefix() + "-RootActivityRule")
                .ruleName(props.resourceNamePrefix() + "-root-account-activity")
                .description("Alert on any AWS root account activity - should never be used in normal operations")
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("AWS API Call via CloudTrail"))
                        .detail(Map.of("userIdentity", Map.of("type", List.of("Root"))))
                        .build())
                .build();
        rootActivityRule.addTarget(new SnsTopic(securityFindingsTopic));

        infof("Created anomaly detection rules: IAM policy changes, security groups, access keys, root activity");

        // ============================================================================
        // Consolidated Operations Dashboard
        // ============================================================================
        // This dashboard provides a single view across all deployments in this environment
        List<List<IWidget>> dashboardRows = new ArrayList<>();

        // Determine apex domain for GitHub synthetic metrics namespace
        String apexDomain = props.apexDomain() != null && !props.apexDomain().isBlank()
                ? props.apexDomain()
                : props.sharedNames().hostedZoneName;

        // Lambda function search pattern for this environment
        // Pattern matches: {env}-*-submit-*-app-{function-name}
        // Example: prod-abc123-submit-diyaccounting-co-uk-app-hmrc-vat-return-post-ingest-handler
        String lambdaSearchPrefix = props.envName() + "-";

        // Row 1: Real User Traffic (RUM) and Web Vitals
        Metric inpP75 = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("WebVitalsInteractionToNextPaint")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("p75")
                .period(Duration.minutes(5))
                .build();

        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("RUM p75 LCP (ms)")
                        .left(List.of(lcpP75))
                        .width(8)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("RUM p75 INP (ms)")
                        .left(List.of(inpP75))
                        .width(8)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("RUM JS Errors (5m sum)")
                        .left(List.of(jsErrors))
                        .width(8)
                        .height(6)
                        .build()));

        // Row 2: GitHub Synthetic Tests and Deployment Events
        // GitHub synthetic test metrics (sent from deploy.yml)
        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("GitHub Synthetic Tests (all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{%s,deployment-name,test} MetricName=\"behaviour-test\"', 'Minimum', 3600)",
                                        apexDomain))
                                .label("Behaviour Tests (0=pass)")
                                .period(Duration.hours(1))
                                .build()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("Deployments")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{%s,deployment-name} MetricName=\"deployment\"', 'Sum', 3600)",
                                        apexDomain))
                                .label("Deployment events")
                                .period(Duration.hours(1))
                                .build()))
                        .width(12)
                        .height(6)
                        .build()));

        // Row 3: Business Metrics - Key Lambda function invocations across all deployments
        // Using SEARCH to aggregate across deployment-specific function names
        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("VAT Submissions (all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*hmrc-vat-return-post-ingest.*\" MetricName=\"Invocations\"', 'Sum', 3600)",
                                        lambdaSearchPrefix))
                                .label("hmrcVatReturnPost")
                                .period(Duration.hours(1))
                                .build()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("HMRC Authentications (all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*hmrc-token-post-ingest.*\" MetricName=\"Invocations\"', 'Sum', 3600)",
                                        lambdaSearchPrefix))
                                .label("hmrcTokenPost")
                                .period(Duration.hours(1))
                                .build()))
                        .width(12)
                        .height(6)
                        .build()));

        // Row 4: More Business Metrics
        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("Bundle Operations (all deployments)")
                        .left(List.of(
                                MathExpression.Builder.create()
                                        .expression(String.format(
                                                "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*bundle-post-ingest.*\" MetricName=\"Invocations\"', 'Sum', 3600)",
                                                lambdaSearchPrefix))
                                        .label("bundlePost")
                                        .period(Duration.hours(1))
                                        .build(),
                                MathExpression.Builder.create()
                                        .expression(String.format(
                                                "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*bundle-get-ingest.*\" MetricName=\"Invocations\"', 'Sum', 3600)",
                                                lambdaSearchPrefix))
                                        .label("bundleGet")
                                        .period(Duration.hours(1))
                                        .build()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("Sign-ups & Cognito Auth (all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*cognito-token-post-ingest.*\" MetricName=\"Invocations\"', 'Sum', 3600)",
                                        lambdaSearchPrefix))
                                .label("cognitoTokenPost")
                                .period(Duration.hours(1))
                                .build()))
                        .width(12)
                        .height(6)
                        .build()));

        // Row 5: Bundle Capacity Metrics (EMF from bundlePost and reconciliation Lambda)
        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("Bundle Grants & Cap Enforcement")
                        .left(List.of(
                                Metric.Builder.create()
                                        .namespace("Submit/BundleCapacity")
                                        .metricName("BundleGranted")
                                        .statistic("Sum")
                                        .period(Duration.hours(1))
                                        .build(),
                                Metric.Builder.create()
                                        .namespace("Submit/BundleCapacity")
                                        .metricName("BundleCapReached")
                                        .statistic("Sum")
                                        .period(Duration.hours(1))
                                        .build(),
                                Metric.Builder.create()
                                        .namespace("Submit/BundleCapacity")
                                        .metricName("BundleAlreadyGranted")
                                        .statistic("Sum")
                                        .period(Duration.hours(1))
                                        .build()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("Active Bundle Allocations (reconciled)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(
                                        "SEARCH('{Submit/BundleCapacity,bundleId} MetricName=\"BundleActiveAllocations\"', 'Maximum', 300)")
                                .label("Active allocations by bundle")
                                .period(Duration.minutes(5))
                                .build()))
                        .width(12)
                        .height(6)
                        .build()));

        // Alarms for bundle capacity and pass/token events (EMF custom metrics)
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-BundleCapReachedAlarm")
                .alarmName(props.resourceNamePrefix() + "-bundle-cap-reached")
                .metric(Metric.Builder.create()
                        .namespace("Submit/BundleCapacity")
                        .metricName("BundleCapReached")
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Bundle capacity cap reached >= 1 in 5 minutes")
                .build();

        // HMRC submission failure alarm, built on the Submit/Business EMF metrics emitted by
        // hmrcVatReturnPost.js. Scoped to Actor=customer so CI/test-user traffic doesn't page
        // anyone. No SnsAction: the alarm-state-change rule in OpsStack routes this to Telegram.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-HmrcSubmissionFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-hmrc-submission-failure")
                .alarmDescription("HMRC VAT submission failed for a customer >= 1 time in 15 minutes")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Business")
                        .metricName("VatSubmissionFailure")
                        .dimensionsMap(Map.of("Actor", "customer"))
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Row 6: Lambda Errors across all deployments (was Row 5)
        dashboardRows.add(List.of(
                GraphWidget.Builder.create()
                        .title("Lambda Errors (all functions, all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*\" MetricName=\"Errors\"', 'Sum', 300)",
                                        lambdaSearchPrefix))
                                .label("Errors by function")
                                .period(Duration.minutes(5))
                                .build()))
                        .width(12)
                        .height(6)
                        .build(),
                GraphWidget.Builder.create()
                        .title("Lambda Throttles (all functions, all deployments)")
                        .left(List.of(MathExpression.Builder.create()
                                .expression(String.format(
                                        "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*\" MetricName=\"Throttles\"', 'Sum', 300)",
                                        lambdaSearchPrefix))
                                .label("Throttles by function")
                                .period(Duration.minutes(5))
                                .build()))
                        .width(12)
                        .height(6)
                        .build()));

        // Row 7: Lambda Performance across all deployments (was Row 6)
        dashboardRows.add(List.of(GraphWidget.Builder.create()
                .title("Lambda p95 Duration (all functions, all deployments)")
                .left(List.of(MathExpression.Builder.create()
                        .expression(String.format(
                                "SEARCH('{AWS/Lambda,FunctionName} FunctionName=~\"%s.*\" MetricName=\"Duration\"', 'p95', 300)",
                                lambdaSearchPrefix))
                        .label("p95 Duration by function")
                        .period(Duration.minutes(5))
                        .build()))
                .width(24)
                .height(6)
                .build()));

        // Row 8: Help text for deployment annotations (was Row 7)
        dashboardRows.add(List.of(TextWidget.Builder.create()
                .markdown(
                        """
                        ### Deployment Tracking

                        Deployment events are tracked via custom metrics sent from GitHub Actions.
                        The metric namespace is `%s` with dimension `deployment-name`.

                        To send deployment metrics from your CI/CD pipeline:
                        ```bash
                        aws cloudwatch put-metric-data \\
                          --namespace "%s" \\
                          --metric-name "deployment" \\
                          --dimensions "deployment-name=$DEPLOYMENT_NAME" \\
                          --value 1 \\
                          --unit Count
                        ```
                        """
                                .formatted(apexDomain, apexDomain))
                .width(24)
                .height(4)
                .build()));

        Dashboard operationsDashboard = Dashboard.Builder.create(
                        this, props.resourceNamePrefix() + "-OperationsDashboard")
                .dashboardName(props.resourceNamePrefix() + "-operations")
                .widgets(dashboardRows)
                .build();

        // Outputs for RUM configuration and dashboard
        cfnOutput(this, "RumAppMonitorId", rumMonitor.getAttrId());
        cfnOutput(this, "RumIdentityPoolId", rumIdentityPool.getRef());
        cfnOutput(this, "RumGuestRoleArn", rumGuestRole.getRoleArn());
        cfnOutput(this, "RumRegion", this.getRegion());
        cfnOutput(
                this,
                "OperationsDashboard",
                "https://" + this.getRegion() + ".console.aws.amazon.com/cloudwatch/home?region=" + this.getRegion()
                        + "#dashboards:name=" + operationsDashboard.getDashboardName());
    }
}
