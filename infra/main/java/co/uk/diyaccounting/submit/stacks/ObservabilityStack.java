/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability OPS-117 Provision the Observability stack
// - **Use when:** an account's CloudTrail, GuardDuty, Security Hub, security SNS topic or shared dashboards need synthesizing.
// - **Does:** ObservabilityStack creates the account's CloudTrail with DynamoDB data events, the account-singleton GuardDuty detector and Security Hub, the SNS topic security findings route through, and the CloudWatch dashboards, alarms and log groups other stacks attach to. It also builds the trusted event function (`trustedEventToGithubIssue.js`) with its role and health alarm, and in prod the rule that sends AWS Health and ACM notices to it.
// - **Run:** `npm run cdk:synth-environment`
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ObservabilityStackTest.java, infra/test/java/co/uk/diyaccounting/submit/MetricFilterLogGroupCdkResourceTest.java
// - **Keywords:** observability stack, cloudtrail, guardduty, security hub, sns findings topic, dashboards, trusted event rule
// - **Related:** OPS-118, OPS-121, OPS-122, OPS-185
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureAwsCustomResourceProviderLogGroup;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.IntegrationCallAccess;
import co.uk.diyaccounting.submit.utils.KindCdk;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.RetentionDaysConverter;
import co.uk.diyaccounting.submit.utils.RumWebVitalsAlarm;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.ArnComponents;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.bedrock.CfnGuardrail;
import software.amazon.awscdk.services.bedrock.CfnGuardrailVersion;
import software.amazon.awscdk.services.cloudtrail.Trail;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleTargetInput;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.events.targets.LambdaFunctionProps;
import software.amazon.awscdk.services.events.targets.SnsTopic;
import software.amazon.awscdk.services.guardduty.CfnDetector;
import software.amazon.awscdk.services.iam.ArnPrincipal;
import software.amazon.awscdk.services.iam.Effect;
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
import software.amazon.awscdk.services.sns.subscriptions.LambdaSubscription;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.constructs.Construct;

public class ObservabilityStack extends Stack {

    private static final String TRUSTED_EVENT_REPOSITORY = "diy-accounting-uk/private.diyaccounting.co.uk";

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

        // Apex domain for GitHub probe metrics namespace (e.g., submit.diyaccounting.co.uk)
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

        // The env image tag the trusted event function runs from.
        String baseImageTag();

        // The diya-ops GitHub App the trusted event function opens issues as. Both stay blank
        // until the operator sets the GitHub variables; the function then fails on its first
        // call and its health alarm reports it.
        @Value.Default
        default String githubAppId() {
            return "";
        }

        @Value.Default
        default String githubAppInstallationId() {
            return "";
        }

        // Whether the Health and ACM rules exist. Only prod opens issues for those events; the
        // function, its role and the ledger exist in every environment.
        @Value.Default
        default boolean trustedEventRulesEnabled() {
            return false;
        }

        // Whether the function reads the Companies House API and the management account, on a
        // daily schedule and when the root budget topic publishes. Set for prod only.
        @Value.Default
        default boolean trustedEventReadsEnabled() {
            return false;
        }

        // The management account's budget alert topic (us-east-1) the function subscribes to.
        @Value.Default
        default String rootBudgetAlertsTopicArn() {
            return "";
        }

        @Value.Default
        default String companiesHouseBaseUri() {
            return "";
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
                    .trailName(props.sharedNames().observability.trailName)
                    .bucket(trailBucket)
                    .cloudWatchLogGroup(this.cloudTrailLogGroup)
                    .sendToCloudWatchLogs(true)
                    // Retention is set via AwsCustomResource above, not here
                    .includeGlobalServiceEvents(true)
                    // Multi-region so the trail also covers the WAF, the RUM monitor and the
                    // canaries' us-east-1 activity, not only eu-west-2.
                    .isMultiRegionTrail(true)
                    .build();

            // Ensure the LogGroup is created before the Trail tries to use it
            this.trail.getNode().addDependency(ensureLogGroup);

            // DynamoDB Data Event Logging via L1 construct.
            // Add event selectors for DynamoDB data plane operations (GetItem, PutItem, DeleteItem, Query, Scan)
            // so the security detection metric filters (SecurityDetectionStack) can see them.
            // GetRecords is excluded: the analytics Lambda's DynamoDB Streams event-source mapping polls
            // GetRecords constantly (around 1.3 million events/day), no detector reads it, and it dwarfs
            // every other DynamoDB call combined. Advanced event selectors replace basic ones entirely,
            // so management events must be re-declared here or they are lost.
            software.amazon.awscdk.services.cloudtrail.CfnTrail cfnTrail =
                    (software.amazon.awscdk.services.cloudtrail.CfnTrail)
                            this.trail.getNode().getDefaultChild();

            cfnTrail.setAdvancedEventSelectors(List.of(
                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedEventSelectorProperty.builder()
                            .name("Management events")
                            .fieldSelectors(List.of(
                                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedFieldSelectorProperty
                                            .builder()
                                            .field("eventCategory")
                                            .equalTo(List.of("Management"))
                                            .build()))
                            .build(),
                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedEventSelectorProperty.builder()
                            .name("DynamoDB data events excluding GetRecords")
                            .fieldSelectors(List.of(
                                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedFieldSelectorProperty
                                            .builder()
                                            .field("eventCategory")
                                            .equalTo(List.of("Data"))
                                            .build(),
                                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedFieldSelectorProperty
                                            .builder()
                                            .field("resources.type")
                                            .equalTo(List.of("AWS::DynamoDB::Table"))
                                            .build(),
                                    software.amazon.awscdk.services.cloudtrail.CfnTrail.AdvancedFieldSelectorProperty
                                            .builder()
                                            .field("eventName")
                                            .notEquals(List.of("GetRecords"))
                                            .build()))
                            .build()));
            // The L2 Trail always renders its (empty) basic EventSelectors list, and CloudTrail
            // rejects a trail that carries both kinds of selector.
            cfnTrail.addPropertyDeletionOverride("EventSelectors");

            infof("Configured CloudTrail DynamoDB data event logging for all tables in account, excluding GetRecords");

            // CloudWatch Logs Insights query for detecting bulk data access:
            // filter eventSource = "dynamodb.amazonaws.com" and eventName = "Scan"
            // | stats count(*) by bin(5m)

            // Outputs for Observability resources
            // cfnOutput(this, "TrailBucketArn", this.trailBucket.getBucketArn());
            cfnOutput(this, "TrailArn", this.trail.getTrailArn());
        }

        // Log group for self-destruct operations (idempotent creation). Shared across every
        // deployment in the environment, so it keeps the environment's configured retention
        // rather than the helper default of three days for the same reason as the API access
        // log group below: it is the evidence behind the self-destruct log-errors alarm, and
        // three days was not enough to read the 2026-09-19 to 23 firings by the time they were
        // audited.
        this.selfDestructLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-SelfDestructLogGroup",
                        props.sharedNames().observability.ew2SelfDestructLogGroupName,
                        props.accessLogGroupRetentionPeriodDays())
                .logGroup();

        // API Gateway access log group with env-stable name (idempotent creation). It keeps the
        // environment's configured access-log retention rather than the helper default of three
        // days: this group is the evidence behind every api-5xx alarm, and with three days the
        // four fires of 2026-09-06 to 09-09 had no lines left to read by the time they were
        // investigated.
        this.apiAccessLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-ApiAccessLogGroup",
                        props.sharedNames().observability.apiAccessLogGroupName,
                        props.accessLogGroupRetentionPeriodDays())
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

        // ------------------ Bedrock model invocation logging ------------------
        // The setting is account-and-region wide and CloudFormation has no resource for it, so an
        // AwsCustomResource calls PutModelInvocationLoggingConfiguration. Every Bedrock call runs
        // in this region through the eu.anthropic.* inference profiles. Text, image and embedding
        // bodies stay off because prompts carry support ticket summaries and alarm data; each log
        // record keeps the caller's identity ARN, the model, the token counts and the request id.
        String bedrockLogGroupName = "/%s/bedrock/invocations".formatted(props.envName());
        LogGroup bedrockInvocationLogGroup = LogGroup.Builder.create(
                        this, props.resourceNamePrefix() + "-BedrockInvocationLogGroup")
                .logGroupName(bedrockLogGroupName)
                .retention(RetentionDays.TWO_WEEKS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        Role bedrockInvocationLogRole = Role.Builder.create(
                        this, props.resourceNamePrefix() + "-BedrockInvocationLogRole")
                .assumedBy(new ServicePrincipal("bedrock.amazonaws.com")
                        .withConditions(Map.of(
                                "StringEquals", Map.of("aws:SourceAccount", this.getAccount()),
                                "ArnLike",
                                        Map.of(
                                                "aws:SourceArn",
                                                "arn:aws:bedrock:%s:%s:*"
                                                        .formatted(this.getRegion(), this.getAccount())))))
                .build();
        bedrockInvocationLogRole.addToPolicy(PolicyStatement.Builder.create()
                .actions(List.of("logs:CreateLogStream", "logs:PutLogEvents"))
                .resources(List.of(bedrockInvocationLogGroup.getLogGroupArn() + ":*"))
                .build());
        Map<String, Object> bedrockLoggingConfig = Map.of(
                "cloudWatchConfig",
                Map.of("logGroupName", bedrockLogGroupName, "roleArn", bedrockInvocationLogRole.getRoleArn()),
                "textDataDeliveryEnabled",
                false,
                "imageDataDeliveryEnabled",
                false,
                "embeddingDataDeliveryEnabled",
                false);
        AwsCustomResource bedrockInvocationLogging = AwsCustomResource.Builder.create(
                        this, props.resourceNamePrefix() + "-BedrockInvocationLogging")
                .onCreate(AwsSdkCall.builder()
                        .service("Bedrock")
                        .action("putModelInvocationLoggingConfiguration")
                        .parameters(Map.of("loggingConfig", bedrockLoggingConfig))
                        .physicalResourceId(PhysicalResourceId.of(bedrockLogGroupName))
                        .build())
                .onUpdate(AwsSdkCall.builder()
                        .service("Bedrock")
                        .action("putModelInvocationLoggingConfiguration")
                        .parameters(Map.of("loggingConfig", bedrockLoggingConfig))
                        .physicalResourceId(PhysicalResourceId.of(bedrockLogGroupName))
                        .build())
                .onDelete(AwsSdkCall.builder()
                        .service("Bedrock")
                        .action("deleteModelInvocationLoggingConfiguration")
                        .build())
                .logGroup(ensureAwsCustomResourceProviderLogGroup(this))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(this))
                .build();
        bedrockInvocationLogging.getNode().addDependency(bedrockInvocationLogGroup);
        bedrockInvocationLogging.getNode().addDependency(bedrockInvocationLogRole);
        bedrockInvocationLogging
                .getNode()
                .addDependency(KindCdk.grantToAwsCustomResourceProvider(
                        this,
                        List.of(
                                PolicyStatement.Builder.create()
                                        .actions(List.of(
                                                "bedrock:PutModelInvocationLoggingConfiguration",
                                                "bedrock:DeleteModelInvocationLoggingConfiguration"))
                                        .resources(List.of("*"))
                                        .build(),
                                PolicyStatement.Builder.create()
                                        .actions(List.of("iam:PassRole"))
                                        .resources(List.of(bedrockInvocationLogRole.getRoleArn()))
                                        .build())));
        cfnOutput(this, "BedrockInvocationLogGroupArn", bedrockInvocationLogGroup.getLogGroupArn());

        // ------------------ CloudWatch RUM (Real User Monitoring) ------------------
        String rumAppName = props.resourceNamePrefix() + "-rum";
        // Built from the name: the monitor's own resource policy names it, so a reference to the monitor would be a
        // cycle.
        String rumAppMonitorArn = Stack.of(this)
                .formatArn(ArnComponents.builder()
                        .service("rum")
                        .resource("appmonitor")
                        .resourceName(rumAppName)
                        .build());

        // Create RUM App Monitor
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
                        .telemetries(List.of("performance", "errors", "http"))
                        .build())
                .resourcePolicy(CfnAppMonitor.ResourcePolicyProperty.builder()
                        .policyDocument(Stack.of(this)
                                .toJsonString(Map.of(
                                        "Version",
                                        "2012-10-17",
                                        "Statement",
                                        List.of(Map.of(
                                                "Effect",
                                                "Allow",
                                                "Action",
                                                "rum:PutRumEvents",
                                                "Resource",
                                                rumAppMonitorArn,
                                                "Principal",
                                                "*")))))
                        .build())
                .build();

        // RUM metrics and alarms
        Metric jsErrors = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName("JsErrorCount")
                .dimensionsMap(Map.of("application_name", rumAppName))
                .statistic("sum")
                .period(Duration.minutes(5))
                .build();

        RumWebVitalsAlarm.create(
                this,
                props.resourceNamePrefix() + "-RumLcpP75Alarm",
                props.resourceNamePrefix() + "-rum-lcp-p75",
                "WebVitalsLargestContentfulPaint",
                rumAppName,
                4000, // 4s
                "RUM p75 LCP > 4s");

        RumWebVitalsAlarm.create(
                this,
                props.resourceNamePrefix() + "-RumClsP75Alarm",
                props.resourceNamePrefix() + "-rum-cls-p75",
                "WebVitalsCumulativeLayoutShift",
                rumAppName,
                0.25, // CLS "needs improvement" boundary
                "RUM p75 CLS > 0.25");

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

        // Alarms in SecurityDetectionStack publish to this topic via SnsAction; without this
        // policy CloudWatch Alarms gets AccessDenied on SNS:Publish, and that denial is itself
        // an AccessDenied CloudTrail event counted by the CIS unauthorized-api-calls metric,
        // making the alarm re-fire on its own failed action.
        securityFindingsTopic.addToResourcePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("cloudwatch.amazonaws.com")))
                .actions(List.of("sns:Publish"))
                .resources(List.of(securityFindingsTopic.getTopicArn()))
                .conditions(Map.of(
                        "StringEquals",
                        Map.of("aws:SourceAccount", Stack.of(this).getAccount())))
                .build());

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
            // Default standards are off: SecurityBaselineStack subscribes CIS AWS Foundations
            // Benchmark v5.0.0 and AWS Foundational Security Best Practices explicitly instead,
            // since this property only takes effect when the Hub is first created and cannot swap
            // an already-subscribed standard's version.
            CfnHub securityHub = CfnHub.Builder.create(this, props.resourceNamePrefix() + "-SecurityHub")
                    .enableDefaultStandards(false)
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

        // The apex domain is the namespace of the GitHub probe metrics
        String apexDomain = props.apexDomain() != null && !props.apexDomain().isBlank()
                ? props.apexDomain()
                : props.sharedNames().envDomainName;

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

        // ITSA submission failure alarm, the same shape as HmrcSubmissionFailureAlarm above but
        // watching the Submit/Business metrics hmrcItsaSelfEmploymentPeriodPost.js and
        // hmrcItsaSelfEmploymentPeriodPut.js emit, so the existing alarm-to-issue triage covers
        // ITSA quarterly updates with no new mechanism.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-ItsaSubmissionFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-itsa-submission-failure")
                .alarmDescription("HMRC ITSA submission failed for a customer >= 1 time in 15 minutes")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Business")
                        .metricName("ItsaSubmissionFailure")
                        .dimensionsMap(Map.of("Actor", "customer"))
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Customer email failure alarm: a customer's email failed to send, bounced permanently, drew
        // a complaint, or had no address. Built on the Submit/Business EMF metric the email worker
        // and the SES event handler emit, scoped to Actor=customer so test traffic does not page
        // anyone. No SnsAction: the alarm-state-change rule in OpsStack routes this to Telegram.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-CustomerEmailFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-customer-email-failure")
                .alarmDescription("A customer email failed >= 1 time in 15 minutes")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Business")
                        .metricName("CustomerEmailFailure")
                        .dimensionsMap(Map.of("Actor", "customer"))
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Token charge unpaid alarm (B128). app/services/tokenEnforcement.js logs and swallows
        // "Token charge failed after HMRC success" when a token charge fails after HMRC has
        // already accepted the submission, so the customer keeps the filing but the ledger
        // under-counts the charge. Every deployment's OpsStack carries a metric filter on each
        // HMRC submission endpoint's ingest and worker log group for that message, all
        // incrementing this one Submit/Business metric; the alarm lives here, env-scoped, rather
        // than once per deployment, the same split HmrcSubmissionFailureAlarm and
        // ItsaSubmissionFailureAlarm above use, so every deployment's filters dedupe to one open
        // GitHub issue per environment. No SnsAction: the alarm-state-change rule in OpsStack
        // routes this to Telegram and, in prod, to the alarm-to-issue Lambda.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-TokenChargeUnpaidAlarm")
                .alarmName(props.resourceNamePrefix() + "-token-charge-unpaid")
                .alarmDescription("A token charge failed after HMRC accepted the submission >= 1 time in 5 minutes")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Business")
                        .metricName("TokenChargeUnpaid")
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // HMRC fraud prevention header violation alarm. app/services/hmrcApi.js sendToHmrc emits
        // HmrcFraudHeaderViolation for every request to the HMRC production API that lacks a
        // required Gov-Client or Gov-Vendor header. The metric is environment-wide and must
        // survive a new deployment, so the alarm lives here and not in an app stack. A day is
        // the period because a violation needs a person to read the log line, not a page.
        // No SnsAction: the alarm-state-change rule in OpsStack routes this to the
        // alarm-to-issue Lambda in prod.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-HmrcFraudHeaderViolationAlarm")
                .alarmName(props.resourceNamePrefix() + "-hmrc-fraud-header-violation")
                .alarmDescription("A request to the HMRC production API lacked a required fraud prevention header")
                .metric(Metric.Builder.create()
                        .namespace("Submit/HmrcSend")
                        .metricName("HmrcFraudHeaderViolation")
                        .dimensionsMap(Map.of("Environment", props.envName(), "HmrcHost", "production"))
                        .statistic("Sum")
                        .period(Duration.days(1))
                        .build())
                .threshold(0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // HMRC fraud prevention header rule failure alarm. app/services/hmrcApi.js sendToHmrc emits
        // HmrcFraudHeaderRuleFailure when a header on a request to the HMRC production API breaks
        // a format rule from HMRC's connection method pages (a bad value, a broken cross-check).
        // The request still goes. The metric is environment-wide, so the alarm lives here. No
        // SnsAction: the alarm-state-change rule in OpsStack routes this to the alarm-to-issue
        // Lambda in prod.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-HmrcFraudHeaderRuleFailureAlarm")
                .alarmName(props.resourceNamePrefix() + "-hmrc-fraud-header-rule-failure")
                .alarmDescription(
                        "A request to the HMRC production API had a fraud prevention header that broke a format rule")
                .metric(Metric.Builder.create()
                        .namespace("Submit/HmrcSend")
                        .metricName("HmrcFraudHeaderRuleFailure")
                        .dimensionsMap(Map.of("Environment", props.envName(), "HmrcHost", "production"))
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(0)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // HMRC validator rejection alarm. app/functions/hmrc/hmrcFphCheckWorker.js counts
        // HmrcFphCheckFailed when HMRC's test validator answers INVALID_HEADERS for the synthetic
        // request built from a header shape that the service sends. The check runs under the
        // sandbox application, and a failing shape means a real request has the same structure.
        // The metric is environment-wide, so the alarm lives here. No SnsAction: the alarm-state-change
        // rule in OpsStack routes this to the alarm-to-issue Lambda in prod.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-HmrcFphCheckFailedAlarm")
                .alarmName(props.resourceNamePrefix() + "-hmrc-fph-check-failed")
                .alarmDescription("HMRC's validator rejected the headers of a request shape that the service sends")
                .metric(Metric.Builder.create()
                        .namespace("Submit/HmrcSend")
                        .metricName("HmrcFphCheckFailed")
                        .dimensionsMap(Map.of("Environment", props.envName()))
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Outbound call record failure alarm. app/lib/integrationCalls.js counts
        // IntegrationCallRecordFailed when it cannot write a call record, and the customer's call
        // still works. One hour of data and a threshold of 5 let a short DynamoDB blip pass
        // without a page. A Lambda that lacks the table name or the grant fails on every call, so
        // it reaches 5 within the hour. The metric is environment-wide, so the alarm lives here.
        // No SnsAction: the alarm-state-change rule in OpsStack routes this to the alarm-to-issue
        // Lambda in prod.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-IntegrationCallRecordFailedAlarm")
                .alarmName(props.resourceNamePrefix() + "-integration-call-record-failed")
                .alarmDescription("Outbound call records were not written >= 5 times in 1 hour")
                .metric(Metric.Builder.create()
                        .namespace("Submit/IntegrationCalls")
                        .metricName("IntegrationCallRecordFailed")
                        .dimensionsMap(Map.of("Environment", props.envName()))
                        .statistic("Sum")
                        .period(Duration.hours(1))
                        .build())
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // GitHub Actions probe-test alarm, one per environment rather than one per deployment.
        // Living in OpsStack (per deployment) meant every new deployment created a fresh alarm
        // against this same environment-wide behaviour-test metric, each opening its own GitHub
        // issue. Here it survives deployments, so alarmToGithubIssue's per-alarm-name dedupe
        // (see findOpenIssueByAlarmName) keeps one open issue per environment instead of one per
        // deployment. Period is 5 hours, not 2: probe-test.yml runs on a 4-hour cron
        // (`57 */4 * * *`), and a 2-hour period sat on one side of a datapoint or the other
        // depending on clock alignment, so roughly half of all windows held nothing and the
        // alarm fired with no test having failed. A period longer than the cron interval is
        // guaranteed to contain a datapoint regardless of alignment; 5 hours is the smallest
        // whole-hour value greater than 4. treatMissingData stays BREACHING so a genuinely
        // stalled schedule is still caught. No SnsAction: the alarm-state-change rule in every
        // deployment's OpsStack matches this environment's shared-alarm prefix and routes it to
        // Telegram and the GitHub-issue Lambda, same as BundleCapReachedAlarm above.
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-GithubProbeAlarm")
                .alarmName(props.resourceNamePrefix() + "-github-probe-failed")
                .alarmDescription("GitHub Actions probe test has not succeeded in 5 hours")
                .metric(Metric.Builder.create()
                        .namespace(apexDomain)
                        .metricName("behaviour-test")
                        .dimensionsMap(Map.of("test", "submitVatBehaviour"))
                        .statistic("Minimum")
                        .period(Duration.hours(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        // Row 6: Lambda errors and throttles on the live deployment. Narrowed from an
        // unscoped "{envName}-" prefix, which matched every retired deployment's functions
        // (about 4,700 series) against CloudWatch's 500-series SEARCH limit and never rendered.

        // Row 7: Lambda p95 duration on the live deployment, same narrowing as row 6.

        // Outputs for RUM configuration
        cfnOutput(this, "RumAppMonitorId", rumMonitor.getAttrId());
        cfnOutput(this, "RumRegion", this.getRegion());

        // ============================================================================
        // Alarm triage: read-only role, output guardrail, SSM parameters
        // ============================================================================
        // The triage workflow assumes this account's github-actions-role first (matching the
        // role-chaining every other workflow uses), then chains into this role. That role is named
        // submit-{env}-github-actions-role in each deployment account (see GITHUB_SETUP.md), not the
        // plain "github-actions-role" a first draft of this stack assumed.
        String githubActionsRoleArn =
                "arn:aws:iam::%s:role/submit-%s-github-actions-role".formatted(this.getAccount(), props.envName());

        Role alarmTriageRole = Role.Builder.create(this, props.resourceNamePrefix() + "-AlarmTriageRole")
                .roleName(props.sharedNames().observability.alarmTriageRoleName)
                .maxSessionDuration(Duration.hours(1))
                .description("Read-only role the alarm-triage, board, do-next and auto-merge"
                        + " agent workflows chain into for Bedrock and read-only AWS")
                .assumedBy(new ArnPrincipal(githubActionsRoleArn))
                .build();

        // One read-only telemetry grant: every describe, get, list and query action on Logs,
        // CloudWatch and X-Ray, plus the two CloudFormation reads the board agent's Part 4 needs
        // (which app stacks exist, and whether one is in a failed state). The earlier per-action,
        // per-log-group list was widened one denial at a time (DescribeMetricFilters,
        // DescribeQueries, ...) and the agent, denied once, stopped querying at all. Customer data
        // stays out by the explicit Deny below, not by the shape of this Allow; the log groups and
        // stacks this role can reach carry no customer data by design.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadTelemetry")
                .actions(List.of(
                        "logs:Describe*",
                        "logs:Get*",
                        "logs:FilterLogEvents",
                        "logs:StartQuery",
                        "logs:StopQuery",
                        "cloudwatch:Describe*",
                        "cloudwatch:Get*",
                        "cloudwatch:List*",
                        "xray:Get*",
                        "xray:BatchGet*",
                        "cloudformation:ListStacks",
                        "cloudformation:DescribeStacks"))
                .resources(List.of("*"))
                .build());

        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("InvokeTriageModel")
                .actions(List.of("bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"))
                .resources(List.of(
                        "arn:aws:bedrock:eu-west-2::foundation-model/amazon.nova-pro-v1:0",
                        "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
                        "arn:aws:bedrock:eu-west-2::foundation-model/amazon.titan-embed-text-v2:0",
                        "arn:aws:bedrock:*:%s:inference-profile/global.amazon.nova-2-lite-v1:0"
                                .formatted(this.getAccount()),
                        "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0",
                        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
                        "arn:aws:bedrock:*:%s:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
                                .formatted(this.getAccount()),
                        "arn:aws:bedrock:*:%s:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0"
                                .formatted(this.getAccount())))
                .build());

        // ListInferenceProfiles is how the triage agent resolves the model it then invokes above,
        // and Bedrock gives it no ARN to scope to (it takes no resource identifier at all) — the
        // wildcard resource here is that action's only form, not an oversight.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ListTriageModelProfiles")
                .actions(List.of("bedrock:ListInferenceProfiles"))
                .resources(List.of("*"))
                .build());

        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ApplyOutputGuardrail")
                .actions(List.of("bedrock:ApplyGuardrail"))
                .resources(List.of("arn:aws:bedrock:eu-west-2:%s:guardrail/*".formatted(this.getAccount())))
                .build());

        // AWS Marketplace has no resource-level permissions for these two actions.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("SubscribeMarketplaceModel")
                .actions(List.of("aws-marketplace:ViewSubscriptions", "aws-marketplace:Subscribe"))
                .resources(List.of("*"))
                .build());

        // The /submit/{env}/* wildcard already covers last-known-good-deployment, the one
        // parameter the board agent's Part 4 reads outside the triage namespace.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadTriageParameters")
                .actions(List.of("ssm:GetParameter", "ssm:GetParameters"))
                .resources(List.of(
                        "arn:aws:ssm:eu-west-2:%s:parameter/submit/%s/*".formatted(this.getAccount(), props.envName())))
                .build());

        // The writes this role makes to the lake: an agent-run ledger row per run, under its own
        // prefix. Scoped to that prefix so it cannot touch any other curated table, and to PutObject
        // alone - the DenyCustomerData statement below already denies this role every read of the
        // lake, and that stays true here.
        String analyticsLakeBucketArn = "arn:aws:s3:::" + props.sharedNames().analytics.analyticsLakeBucketName;
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("WriteAgentRunLedgerRows")
                .actions(List.of("s3:PutObject"))
                .resources(List.of(analyticsLakeBucketArn + "/curated/agent-runs/*"))
                .build());

        // The weekly security review's full report: file, line and exploit path for each finding.
        // The repository is public, so this prefix is the only place that report is written; the
        // issue gets counts alone. No Glue table covers private/, and DenyCustomerData below keeps
        // this role from reading the report back.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("WriteSecurityReviewReports")
                .actions(List.of("s3:PutObject"))
                .resources(List.of(analyticsLakeBucketArn + "/private/security-review/*"))
                .build());

        // One explicit Deny so a later widening of an Allow above cannot reach customer data. Athena
        // and the lake are denied deliberately: the triage agent works from logs and traces, and
        // reaching the lake means reaching activity events, which carry hashed subs and bundle
        // history - that lookup stays a by-hand operator skill.
        alarmTriageRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("DenyCustomerData")
                .effect(Effect.DENY)
                .actions(List.of(
                        "dynamodb:*",
                        "secretsmanager:GetSecretValue",
                        "secretsmanager:BatchGetSecretValue",
                        "cognito-idp:*",
                        "cognito-identity:*",
                        "athena:*",
                        "glue:GetTable",
                        "glue:GetPartitions",
                        "s3:GetObject",
                        "s3:ListBucket",
                        "kms:Decrypt"))
                .resources(List.of("*"))
                .build());

        cfnOutput(this, "AlarmTriageRoleArn", alarmTriageRole.getRoleArn());

        // The guardrail screens the triage agent's output for PII the redaction script's regexes
        // might miss (a name in prose, for example). ANONYMIZE, not BLOCK: the alarm and its logs
        // are HMRC's and CloudWatch's content, not ours to withhold, so masking the hit and
        // posting the rest of the triage is more useful than posting nothing. The Bedrock API
        // supports ANONYMIZE for every PII entity type and every regex here, so nothing forces a
        // BLOCK fallback.
        CfnGuardrail alarmTriageGuardrail = CfnGuardrail.Builder.create(
                        this, props.resourceNamePrefix() + "-AlarmTriageGuardrail")
                .name(props.sharedNames().observability.alarmTriageGuardrailName)
                // AWS::Bedrock::Guardrail requires both messages even though this guardrail only
                // ever screens agent output (source OUTPUT) and never blocks it (every entity and
                // regex below is ANONYMIZE); CloudFormation rejects the resource as incomplete
                // without both.
                .blockedInputMessaging("Triage input was blocked by the guardrail.")
                .blockedOutputsMessaging("Triage output was blocked by the guardrail.")
                .sensitiveInformationPolicyConfig(CfnGuardrail.SensitiveInformationPolicyConfigProperty.builder()
                        .piiEntitiesConfig(List.of(
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("EMAIL")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("PHONE")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("NAME")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("ADDRESS")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("IP_ADDRESS")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("AWS_ACCESS_KEY")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("AWS_SECRET_KEY")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("UK_NATIONAL_INSURANCE_NUMBER")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.PiiEntityConfigProperty.builder()
                                        .type("CREDIT_DEBIT_CARD_NUMBER")
                                        .action("ANONYMIZE")
                                        .build()))
                        .regexesConfig(List.of(
                                CfnGuardrail.RegexConfigProperty.builder()
                                        .name("hashed-sub")
                                        .pattern("[0-9a-f]{64}")
                                        .action("ANONYMIZE")
                                        .build(),
                                CfnGuardrail.RegexConfigProperty.builder()
                                        .name("vat-registration-number")
                                        .pattern("\\b(?:GB)?[0-9]{9}\\b")
                                        .action("ANONYMIZE")
                                        .build()))
                        .build())
                .build();

        CfnGuardrailVersion alarmTriageGuardrailVersion = CfnGuardrailVersion.Builder.create(
                        this, props.resourceNamePrefix() + "-AlarmTriageGuardrailVersion")
                .guardrailIdentifier(alarmTriageGuardrail.getAttrGuardrailId())
                .build();

        StringParameter guardrailIdParameter = StringParameter.Builder.create(
                        this, props.resourceNamePrefix() + "-AlarmTriageGuardrailIdParameter")
                .parameterName(props.sharedNames().observability.alarmTriageGuardrailIdParameterName)
                .stringValue(alarmTriageGuardrail.getAttrGuardrailId())
                .build();

        StringParameter guardrailVersionParameter = StringParameter.Builder.create(
                        this, props.resourceNamePrefix() + "-AlarmTriageGuardrailVersionParameter")
                .parameterName(props.sharedNames().observability.alarmTriageGuardrailVersionParameterName)
                .stringValue(alarmTriageGuardrailVersion.getAttrVersion())
                .build();

        cfnOutput(this, "AlarmTriageGuardrailId", alarmTriageGuardrail.getAttrGuardrailId());

        // The agent kill switch: one flag every unattended agent path reads before acting
        // (alarm-triage.yml, through
        // .github/actions/agent-kill-switch). `on` stops them; agent-kill-switch.yml sets it
        // through the deployment role, so the operator can stop everything with one dispatch.
        // CloudFormation only rewrites the value when this resource itself changes, so a flag
        // set to `on` survives an ordinary environment deploy and is turned off by the same
        // dispatch.
        StringParameter killSwitchParameter = StringParameter.Builder.create(
                        this, props.resourceNamePrefix() + "-AgentKillSwitchParameter")
                .parameterName(props.sharedNames().observability.agentKillSwitchParameterName)
                .stringValue("off")
                .description("Set to on to stop every unattended agent workflow before it acts")
                .build();

        // The quarantine reader role reads untrusted text, so it can do three things and no more:
        // invoke the one Nova Pro foundation model in eu-west-2, screen the answer with the
        // guardrail, and read the three parameters
        // the reader job needs. It has no telemetry, S3, DynamoDB or Marketplace grant.
        Role quarantineReaderRole = Role.Builder.create(this, props.resourceNamePrefix() + "-QuarantineReaderRole")
                .roleName(props.sharedNames().observability.quarantineReaderRoleName)
                .maxSessionDuration(Duration.hours(1))
                .description("Role the quarantine reader workflows chain into to summarise untrusted text"
                        + " with Nova Pro and screen the answer with the guardrail")
                .assumedBy(new ArnPrincipal(githubActionsRoleArn))
                .build();

        quarantineReaderRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("InvokeReaderModel")
                .actions(List.of("bedrock:InvokeModel"))
                .resources(List.of("arn:aws:bedrock:eu-west-2::foundation-model/amazon.nova-pro-v1:0"))
                .build());

        quarantineReaderRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ApplyReaderGuardrail")
                .actions(List.of("bedrock:ApplyGuardrail"))
                .resources(List.of(alarmTriageGuardrail.getAttrGuardrailArn()))
                .build());

        quarantineReaderRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadReaderParameters")
                .actions(List.of("ssm:GetParameter"))
                .resources(List.of(
                        guardrailIdParameter.getParameterArn(),
                        guardrailVersionParameter.getParameterArn(),
                        killSwitchParameter.getParameterArn()))
                .build());

        cfnOutput(this, "QuarantineReaderRoleArn", quarantineReaderRole.getRoleArn());

        // The dashboard review role reads what the nightly dashboard review judges and nothing else:
        // the operator snapshot and the console images in the lake, the held passes through the
        // issuer index of the passes table, Nova Pro, the guardrail and four parameters.
        // It has no ListBucket, so a missing key answers AccessDenied; the job reads both as "not
        // published yet". The LeadingKeys condition limits the query to the partition key "held".
        String dashboardReviewLakeArn = "arn:aws:s3:::" + props.sharedNames().analytics.analyticsLakeBucketName;
        Role dashboardReviewRole = Role.Builder.create(this, props.resourceNamePrefix() + "-DashboardReviewRole")
                .roleName(props.sharedNames().observability.dashboardReviewRoleName)
                .maxSessionDuration(Duration.hours(1))
                .description("Role the nightly dashboard review workflow chains into to read the snapshot and"
                        + " the held passes, and to judge the screenshots with Nova Pro")
                .assumedBy(new ArnPrincipal(githubActionsRoleArn))
                .build();

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadSnapshotAndConsole")
                .actions(List.of("s3:GetObject"))
                .resources(List.of(
                        dashboardReviewLakeArn + "/snapshots/" + props.envName() + "/latest.json",
                        dashboardReviewLakeArn + "/snapshots/" + props.envName() + "/console/*"))
                .build());

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("QueryHeldPasses")
                .actions(List.of("dynamodb:Query"))
                .resources(List.of("arn:aws:dynamodb:%s:%s:table/%s/index/issuedBy-index"
                        .formatted(this.getRegion(), this.getAccount(), props.sharedNames().data.passesTableName)))
                .conditions(Map.of("ForAllValues:StringEquals", Map.of("dynamodb:LeadingKeys", List.of("held"))))
                .build());

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("InvokeReviewModel")
                .actions(List.of("bedrock:InvokeModel"))
                .resources(List.of("arn:aws:bedrock:eu-west-2::foundation-model/amazon.nova-pro-v1:0"))
                .build());

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ApplyReviewGuardrail")
                .actions(List.of("bedrock:ApplyGuardrail"))
                .resources(List.of(alarmTriageGuardrail.getAttrGuardrailArn()))
                .build());

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadReviewParameters")
                .actions(List.of("ssm:GetParameter"))
                .resources(List.of(
                        guardrailIdParameter.getParameterArn(),
                        guardrailVersionParameter.getParameterArn(),
                        killSwitchParameter.getParameterArn()))
                .build());

        dashboardReviewRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("DenyScans")
                .effect(Effect.DENY)
                .actions(List.of("dynamodb:Scan"))
                .resources(List.of("*"))
                .build());

        cfnOutput(this, "DashboardReviewRoleArn", dashboardReviewRole.getRoleArn());

        // ============================================================================
        // Trusted events: AWS Health and ACM notices as private issues
        // ============================================================================
        // An env-level function (one per account, not one per app deployment) that writes to the
        // private repository as the ops App. The rule that feeds it exists only where
        // trustedEventRulesEnabled is set (prod); ci proves the function by direct invoke.
        String trustedEventFunctionName = props.sharedNames().observability.trustedEventFunctionName;
        String trustedEventPrivateKeySecretId = "%s/submit/github/ops_app_private_key".formatted(props.envName());
        var trustedEventEnvironment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("TRUSTED_EVENT_GITHUB_REPO", TRUSTED_EVENT_REPOSITORY)
                .with("TRUSTED_EVENT_LEDGER_DYNAMODB_TABLE_NAME", props.sharedNames().data.trustedEventLedgerTableName);
        // The Companies House send path records each call; the Lambda construct grants PutItem on
        // the table named here. The deployment is the environment, because this function is
        // env-level.
        IntegrationCallAccess.addEnv(
                trustedEventEnvironment, props.sharedNames().data.integrationCallsTableName, props.deploymentName());
        String trustedEventCompaniesHouseKeyArn =
                "arn:aws:secretsmanager:%s:%s:secret:prod/submit/companies-house/api_key"
                        .formatted(this.getRegion(), this.getAccount());
        String trustedEventRootReadRoleArn = "arn:aws:iam::887764105431:role/root-trusted-event-read";
        if (props.trustedEventReadsEnabled()) {
            trustedEventEnvironment
                    .with("COMPANIES_HOUSE_BASE_URI", props.companiesHouseBaseUri())
                    .with("COMPANIES_HOUSE_API_KEY_ARN", trustedEventCompaniesHouseKeyArn)
                    .with("TRUSTED_EVENT_ROOT_READ_ROLE_ARN", trustedEventRootReadRoleArn);
        }
        // PopulatedMap rejects a blank value, and the App ids are blank until the operator sets
        // the GitHub variables, so they are added only once both are set.
        if (!props.githubAppId().isBlank() && !props.githubAppInstallationId().isBlank()) {
            trustedEventEnvironment
                    .with("GITHUB_APP_ID", props.githubAppId())
                    .with("GITHUB_APP_INSTALLATION_ID", props.githubAppInstallationId())
                    .with("GITHUB_APP_PRIVATE_KEY_SECRET_ID", trustedEventPrivateKeySecretId);
        }

        // The role has a fixed name because the management account's read role trusts it by ARN.
        Role trustedEventRole = Role.Builder.create(this, props.resourceNamePrefix() + "-TrustedEventRole")
                .roleName(props.sharedNames().observability.trustedEventRoleName)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .description("Execution role of the trusted event function")
                .build();

        var trustedEventLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(trustedEventFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(trustedEventFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler("app/functions/ops/trustedEventToGithubIssue.handler")
                        .ingestLambdaArn("arn:aws:lambda:%s:%s:function:%s"
                                .formatted(this.getRegion(), this.getAccount(), trustedEventFunctionName))
                        .ingestProvisionedConcurrencyAliasArn("arn:aws:lambda:%s:%s:function:%s:%s"
                                .formatted(
                                        this.getRegion(),
                                        this.getAccount(),
                                        trustedEventFunctionName,
                                        props.sharedNames().provisionedConcurrencyAliasName))
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(60))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(trustedEventEnvironment)
                        .role(trustedEventRole)
                        // One invocation at a time makes the ledger's read-then-write order safe
                        // without a lock: two events for one fact cannot both open an issue.
                        .ingestReservedConcurrentExecutions(Optional.of(1))
                        .build());
        var trustedEventLambda = trustedEventLambdaConstruct.ingestLambda;

        trustedEventLambdaConstruct.logGroup.grantWrite(trustedEventRole);

        trustedEventRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadOpsAppKey")
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of("arn:aws:secretsmanager:%s:%s:secret:%s-*"
                        .formatted(this.getRegion(), this.getAccount(), trustedEventPrivateKeySecretId)))
                .build());
        trustedEventRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("Ledger")
                .actions(List.of("dynamodb:GetItem", "dynamodb:PutItem"))
                .resources(List.of("arn:aws:dynamodb:%s:%s:table/%s"
                        .formatted(
                                this.getRegion(),
                                this.getAccount(),
                                props.sharedNames().data.trustedEventLedgerTableName)))
                .build());
        // The function reads the certificate behind every ACM event, and the source check reads
        // it again. CloudFront certificates live in us-east-1, regional ones here.
        trustedEventRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("DescribeCertificates")
                .actions(List.of("acm:DescribeCertificate"))
                .resources(List.of(
                        "arn:aws:acm:eu-west-2:%s:certificate/*".formatted(this.getAccount()),
                        "arn:aws:acm:us-east-1:%s:certificate/*".formatted(this.getAccount())))
                .build());

        if (props.trustedEventReadsEnabled()) {
            trustedEventRole.addToPolicy(PolicyStatement.Builder.create()
                    .sid("ReadCompaniesHouseKey")
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of("%s-*".formatted(trustedEventCompaniesHouseKeyArn)))
                    .build());
            trustedEventRole.addToPolicy(PolicyStatement.Builder.create()
                    .sid("AssumeRootRead")
                    .actions(List.of("sts:AssumeRole"))
                    .resources(List.of(trustedEventRootReadRoleArn))
                    .build());
        }

        // A failure reaches Telegram, and in prod an [ALARM] issue, through OpsStack's rule on
        // this composite's name.
        Lambda.stackHealthAlarm(this, props.resourceNamePrefix(), "obs", List.of(trustedEventLambdaConstruct));

        if (props.trustedEventRulesEnabled()) {
            // The us-east-1 rule in ObservabilityUE1Stack forwards global events onto this bus.
            // This rule's only target is the function, so no event loops.
            Rule.Builder.create(this, props.resourceNamePrefix() + "-TrustedEventsRule")
                    .ruleName(props.sharedNames().observability.trustedEventRuleName)
                    .description("AWS Health and ACM notices to the trusted event function")
                    .eventPattern(EventPattern.builder()
                            .source(List.of("aws.health", "aws.acm"))
                            .detailType(List.of(
                                    "AWS Health Event",
                                    "AWS Health Abuse Event",
                                    "ACM Certificate Approaching Expiration",
                                    "ACM Certificate Expired",
                                    "ACM Certificate Renewal Action Required",
                                    "ACM Certificate Revoked"))
                            .build())
                    .targets(List.of(new LambdaFunction(trustedEventLambda)))
                    .build();
        }

        if (props.trustedEventReadsEnabled()) {
            Rule.Builder.create(this, props.resourceNamePrefix() + "-TrustedDeadlineReadRule")
                    .ruleName(props.sharedNames().observability.trustedDeadlineReadRuleName)
                    .description("Daily read of the domain and Companies House deadlines")
                    .schedule(Schedule.expression("cron(0 7 * * ? *)"))
                    .targets(List.of(new LambdaFunction(
                            trustedEventLambda,
                            LambdaFunctionProps.builder()
                                    .event(RuleTargetInput.fromObject(Map.of("read", "deadlines")))
                                    .build())))
                    .build();

            // The topic is in the management account in us-east-1. Its policy lets this
            // account subscribe this function, and the subscription is created here, in the
            // topic's region.
            Topic.fromTopicArn(
                            this,
                            props.resourceNamePrefix() + "-RootBudgetAlertsTopic",
                            props.rootBudgetAlertsTopicArn())
                    .addSubscription(new LambdaSubscription(trustedEventLambda));
        }

        cfnOutput(this, "TrustedEventFunctionArn", trustedEventLambda.getFunctionArn());
        cfnOutput(this, "TrustedEventRoleArn", trustedEventRole.getRoleArn());
    }
}
