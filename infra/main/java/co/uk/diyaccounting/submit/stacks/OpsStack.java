/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;
import software.amazon.awscdk.services.events.EventBus;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.events.targets.SnsTopic;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.EmailSubscription;
import software.amazon.awscdk.services.synthetics.ArtifactsBucketLocation;
import software.amazon.awscdk.services.synthetics.Canary;
import software.amazon.awscdk.services.synthetics.Code;
import software.amazon.awscdk.services.synthetics.CustomTestOptions;
import software.amazon.awscdk.services.synthetics.Runtime;
import software.amazon.awscdk.services.synthetics.Schedule;
import software.amazon.awscdk.services.synthetics.Test;
import software.constructs.Construct;

public class OpsStack extends Stack {

    public final Topic alertTopic;
    public final Alarm githubSyntheticAlarm;
    public Canary healthCanary;
    public Canary apiCanary;
    public Alarm healthCheckAlarm;
    public Alarm apiCheckAlarm;
    public software.amazon.awscdk.services.events.IEventBus activityBus;

    @Value.Immutable
    public interface OpsStackProps extends StackProps, SubmitStackProps {

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

        String baseImageTag();

        // Alert configuration
        @Value.Default
        default String alertEmail() {
            return "";
        }

        // Telegram configuration
        @Value.Default
        default String telegramBotTokenArn() {
            return "";
        }

        @Value.Default
        default String telegramTestChatId() {
            return "";
        }

        @Value.Default
        default String telegramLiveChatId() {
            return "";
        }

        @Value.Default
        default String telegramOpsChatId() {
            return "";
        }

        // Canary configuration
        @Value.Default
        default int canaryIntervalMinutes() {
            return 51;
        }

        // Base URL for canaries (e.g., https://submit.diyaccounting.co.uk)
        @Value.Default
        default String baseUrl() {
            return "";
        }

        // Apex domain for GitHub synthetic metrics namespace (e.g., submit.diyaccounting.co.uk)
        @Value.Default
        default String apexDomain() {
            return "";
        }

        static ImmutableOpsStackProps.Builder builder() {
            return ImmutableOpsStackProps.builder();
        }
    }

    public OpsStack(final Construct scope, final String id, final OpsStackProps props) {
        super(scope, id, props);

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "OpsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // ============================================================================
        // SNS Topic for Alerts
        // ============================================================================
        this.alertTopic = Topic.Builder.create(this, props.resourceNamePrefix() + "-AlertTopic")
                .topicName(props.resourceNamePrefix() + "-ops-alerts")
                .displayName("DIY Accounting Submit - Operational Alerts")
                .build();

        if (props.alertEmail() != null && !props.alertEmail().isBlank()) {
            this.alertTopic.addSubscription(new EmailSubscription(props.alertEmail()));
            infof("Added email subscription for alerts: %s", props.alertEmail());
        }

        // ============================================================================
        // EventBridge Custom Activity Bus (imported from env-level ActivityStack)
        // ============================================================================
        this.activityBus = EventBus.fromEventBusName(this, "ActivityBus", props.sharedNames().activityBusName);

        // Email proof rule: all ActivityEvent detail-types → SNS alertTopic
        Rule.Builder.create(this, "ActivityEmailProofRule")
                .ruleName(props.resourceNamePrefix() + "-activity-email-proof")
                .eventBus(this.activityBus)
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("ActivityEvent"))
                        .build())
                .targets(List.of(new SnsTopic(this.alertTopic)))
                .build();

        // ============================================================================
        // Telegram Forwarder Lambda + EventBridge Rule
        // ============================================================================
        var telegramForwarderEnv = new PopulatedMap<String, String>().with("ENVIRONMENT_NAME", props.envName());
        if (props.telegramBotTokenArn() != null && !props.telegramBotTokenArn().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_BOT_TOKEN_ARN", props.telegramBotTokenArn());
        }
        if (props.telegramTestChatId() != null && !props.telegramTestChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_TEST_CHAT_ID", props.telegramTestChatId());
        }
        if (props.telegramLiveChatId() != null && !props.telegramLiveChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_LIVE_CHAT_ID", props.telegramLiveChatId());
        }
        if (props.telegramOpsChatId() != null && !props.telegramOpsChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_OPS_CHAT_ID", props.telegramOpsChatId());
        }
        var telegramForwarderLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.sharedNames().activityTelegramForwarderLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().activityTelegramForwarderLambdaFunctionName)
                        .ingestHandler(props.sharedNames().activityTelegramForwarderLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().activityTelegramForwarderLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(10))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(telegramForwarderEnv)
                        .build());

        // Single catch-all rule: the Lambda handles routing to the correct chat IDs
        // based on (actor, flow, env) in the event detail.
        Rule.Builder.create(this, "ActivityTelegramRule")
                .ruleName(props.resourceNamePrefix() + "-activity-telegram")
                .eventBus(this.activityBus)
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("ActivityEvent"))
                        .build())
                .targets(List.of(LambdaFunction.Builder.create(telegramForwarderLambda.ingestLambda)
                        .build()))
                .build();

        if (props.telegramBotTokenArn() != null && !props.telegramBotTokenArn().isBlank()) {
            var telegramSecretArnWithWildcard = props.telegramBotTokenArn().endsWith("*")
                    ? props.telegramBotTokenArn()
                    : props.telegramBotTokenArn() + "-*";
            telegramForwarderLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(telegramSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Telegram bot token secret %s",
                    telegramForwarderLambda.ingestLambda.getFunctionName(), props.telegramBotTokenArn());
        }

        cfnOutput(this, "TelegramForwarderLambdaArn", telegramForwarderLambda.ingestLambda.getFunctionArn());
        infof(
                "Created Telegram Forwarder Lambda %s",
                telegramForwarderLambda.ingestLambda.getNode().getId());

        // ============================================================================
        // Default Bus Rules: CloudFormation + CloudWatch → Telegram Forwarder
        // ============================================================================
        // These rules match AWS service events on the default EventBridge bus
        // (no eventBus specified → default bus). AWS service events are free.

        // CloudFormation Stack Status Change → Telegram forwarder
        // Filter to terminal statuses only to avoid noisy intermediate states
        Rule.Builder.create(this, "CfnStackStatusRule")
                .ruleName(props.resourceNamePrefix() + "-cfn-stack-status")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.cloudformation"))
                        .detailType(List.of("CloudFormation Stack Status Change"))
                        .detail(java.util.Map.of(
                                "status-details",
                                java.util.Map.of(
                                        "status",
                                        List.of(
                                                "CREATE_COMPLETE",
                                                "UPDATE_COMPLETE",
                                                "DELETE_COMPLETE",
                                                "CREATE_FAILED",
                                                "UPDATE_FAILED",
                                                "DELETE_FAILED",
                                                "ROLLBACK_COMPLETE",
                                                "UPDATE_ROLLBACK_COMPLETE"))))
                        .build())
                .targets(List.of(LambdaFunction.Builder.create(telegramForwarderLambda.ingestLambda)
                        .build()))
                .build();

        // CloudWatch Alarm State Change → Telegram forwarder
        Rule.Builder.create(this, "AlarmStateChangeRule")
                .ruleName(props.resourceNamePrefix() + "-alarm-state-change")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.cloudwatch"))
                        .detailType(List.of("CloudWatch Alarm State Change"))
                        .build())
                .targets(List.of(LambdaFunction.Builder.create(telegramForwarderLambda.ingestLambda)
                        .build()))
                .build();

        infof("Created default bus rules for CloudFormation and CloudWatch alarm events");

        // ============================================================================
        // Synthetic Canaries (if baseUrl provided)
        // ============================================================================
        if (props.baseUrl() != null && !props.baseUrl().isBlank()) {
            createSyntheticCanaries(props);
        }

        // ============================================================================
        // GitHub Actions Synthetic Test Alarm
        // ============================================================================
        String apexDomain = props.apexDomain() != null && !props.apexDomain().isBlank()
                ? props.apexDomain()
                : "submit.diyaccounting.co.uk";

        this.githubSyntheticAlarm = Alarm.Builder.create(this, "GithubSyntheticAlarm")
                .alarmName(props.resourceNamePrefix() + "-github-synthetic-failed")
                .alarmDescription("GitHub Actions synthetic test has not succeeded in 2 hours")
                .metric(Metric.Builder.create()
                        .namespace(apexDomain)
                        .metricName("behaviour-test")
                        .dimensionsMap(Map.of("deployment-name", props.deploymentName(), "test", "submitVatBehaviour"))
                        .statistic("Minimum")
                        .period(Duration.hours(2))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.githubSyntheticAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.githubSyntheticAlarm.addOkAction(new SnsAction(this.alertTopic));

        // ============================================================================
        // Security Detection Alarms - Phase 1.1 & 2.3 (Deferred)
        // ============================================================================
        // NOTE: Authentication failure metric filters for Lambda log groups are NOT created here
        // because the log groups don't exist until the Lambdas are deployed and invoked.
        // These metric filters should be created in the respective Lambda stacks (AuthStack, HmrcStack)
        // or added manually after deployment via CloudWatch console.
        //
        // Required metric filters for security monitoring:
        // 1. Auth failure filter on custom-authorizer log group (WARN/ERROR levels)
        // 2. HMRC auth failure filter on hmrc-token-post log group (statusCode:401)
        //
        // See SECURITY_DETECTION_UPLIFT_PLAN.md for manual setup instructions.

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "AlertTopicArn", this.alertTopic.getTopicArn());
        cfnOutput(this, "GithubSyntheticAlarmArn", this.githubSyntheticAlarm.getAlarmArn());

        if (this.healthCanary != null) {
            cfnOutput(this, "HealthCanaryName", this.healthCanary.getCanaryName());
        }
        if (this.apiCanary != null) {
            cfnOutput(this, "ApiCanaryName", this.apiCanary.getCanaryName());
        }

        infof("OpsStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }

    private void createSyntheticCanaries(OpsStackProps props) {
        // Use deployment name for unique canary names (max 21 chars for canary names)
        // Format: {env}-{suffix} e.g., "ci-monitorin-hlth" or "prod-hlth"
        String deploymentPrefix = sanitizeCanaryName(props.deploymentName());

        // S3 bucket for canary artifacts — no explicit bucketName (globally unique; collisions during account
        // migration)
        Bucket canaryBucket = Bucket.Builder.create(this, "CanaryArtifacts")
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(
                        LifecycleRule.builder().expiration(Duration.days(14)).build()))
                .build();

        // IAM role for canaries
        Role canaryRole = Role.Builder.create(this, "CanaryRole")
                .roleName(props.resourceNamePrefix() + "-canary-role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                        ManagedPolicy.fromAwsManagedPolicyName("CloudWatchSyntheticsFullAccess")))
                .build();
        canaryBucket.grantReadWrite(canaryRole);

        // Health Check Canary - use short suffix to maximize prefix uniqueness
        String healthCanaryName = truncateCanaryName(deploymentPrefix + "-hlth");
        this.healthCanary = Canary.Builder.create(this, "HealthCanary")
                .canaryName(healthCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_11_0)
                .test(Test.custom(CustomTestOptions.builder()
                        .handler("index.handler")
                        .code(Code.fromInline(generateHealthCheckCode(props.baseUrl())))
                        .build()))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(ArtifactsBucketLocation.builder()
                        .bucket(canaryBucket)
                        .prefix("health/")
                        .build())
                .startAfterCreation(true)
                .build();

        // Health Check Alarm
        this.healthCheckAlarm = Alarm.Builder.create(this, "HealthAlarm")
                .alarmName(props.resourceNamePrefix() + "-health-failed")
                .alarmDescription("Health check canary is failing - application may be down")
                .metric(Metric.Builder.create()
                        .namespace("CloudWatchSynthetics")
                        .metricName("SuccessPercent")
                        .dimensionsMap(Map.of("CanaryName", healthCanaryName))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(90)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.healthCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.healthCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

        // API Check Canary - use short suffix to maximize prefix uniqueness
        String apiCanaryName = truncateCanaryName(deploymentPrefix + "-api");
        this.apiCanary = Canary.Builder.create(this, "ApiCanary")
                .canaryName(apiCanaryName)
                .runtime(Runtime.SYNTHETICS_NODEJS_PUPPETEER_11_0)
                .test(Test.custom(CustomTestOptions.builder()
                        .handler("index.handler")
                        .code(Code.fromInline(generateApiCheckCode(props.baseUrl())))
                        .build()))
                .schedule(Schedule.rate(Duration.minutes(props.canaryIntervalMinutes())))
                .role(canaryRole)
                .artifactsBucketLocation(ArtifactsBucketLocation.builder()
                        .bucket(canaryBucket)
                        .prefix("api/")
                        .build())
                .startAfterCreation(true)
                .build();

        // API Check Alarm
        this.apiCheckAlarm = Alarm.Builder.create(this, "ApiAlarm")
                .alarmName(props.resourceNamePrefix() + "-api-failed")
                .alarmDescription("API check canary is failing - API endpoints may be unavailable")
                .metric(Metric.Builder.create()
                        .namespace("CloudWatchSynthetics")
                        .metricName("SuccessPercent")
                        .dimensionsMap(Map.of("CanaryName", apiCanaryName))
                        .statistic("Average")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(90)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        this.apiCheckAlarm.addAlarmAction(new SnsAction(this.alertTopic));
        this.apiCheckAlarm.addOkAction(new SnsAction(this.alertTopic));

        cfnOutput(this, "CanaryArtifactsBucket", canaryBucket.getBucketName());
        infof("Created synthetic canaries: %s, %s", healthCanaryName, apiCanaryName);
    }

    private String sanitizeCanaryName(String name) {
        return name.toLowerCase().replaceAll("[^a-z0-9-]", "-").replaceAll("-+", "-");
    }

    private String truncateCanaryName(String name) {
        if (name.length() <= 21) {
            return name;
        }
        return name.substring(0, 21);
    }

    private String generateHealthCheckCode(String baseUrl) {
        return """
            const synthetics = require('Synthetics');
            const log = require('SyntheticsLogger');

            const healthCheck = async function () {
                const baseUrl = '%s';

                // Step 1: Check main page loads
                log.info('Step 1: Checking main page...');
                let page = await synthetics.getPage();
                await page.setUserAgent('DIYAccounting-Synthetic-Monitor/1.0');
                const response = await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (response.status() !== 200) {
                    throw new Error(`Main page returned status ${response.status()}`);
                }
                log.info('Main page loaded successfully');

                // Step 2: Check privacy page (static content)
                log.info('Step 2: Checking privacy page...');
                const privacyResponse = await page.goto(baseUrl + 'privacy.html', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                if (privacyResponse.status() !== 200) {
                    throw new Error(`Privacy page returned status ${privacyResponse.status()}`);
                }
                log.info('Privacy page loaded successfully');

                log.info('Health check completed successfully');
            };

            exports.handler = async () => {
                return await healthCheck();
            };
            """
                .formatted(baseUrl);
    }

    private String generateApiCheckCode(String baseUrl) {
        return """
            const https = require('https');
            const http = require('http');
            const { URL } = require('url');
            const synthetics = require('Synthetics');
            const log = require('SyntheticsLogger');

            const makeRequest = (urlString) => {
                return new Promise((resolve, reject) => {
                    const url = new URL(urlString);
                    const client = url.protocol === 'https:' ? https : http;

                    const req = client.get(urlString, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'DIYAccounting-Synthetic-Monitor/1.0' }
                    }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve({ status: res.statusCode, data }));
                    });

                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });
                });
            };

            const apiCheck = async function () {
                const baseUrl = '%s';

                // Step 1: Check OpenAPI documentation is accessible
                log.info('Step 1: Checking OpenAPI docs endpoint...');
                try {
                    const docsResponse = await makeRequest(baseUrl + 'docs/api/openapi.json');
                    if (docsResponse.status !== 200) {
                        throw new Error(`OpenAPI docs returned status ${docsResponse.status}`);
                    }
                    JSON.parse(docsResponse.data);
                    log.info('OpenAPI docs accessible and valid');
                } catch (error) {
                    log.error('OpenAPI docs check failed: ' + error.message);
                    throw error;
                }

                // Step 2: Check API returns 401 for unauthenticated request (proves API is up)
                log.info('Step 2: Checking API auth enforcement...');
                try {
                    const apiResponse = await makeRequest(baseUrl + 'api/v1/bundles');
                    if (apiResponse.status !== 401 && apiResponse.status !== 403) {
                        throw new Error(`API returned unexpected status ${apiResponse.status}`);
                    }
                    log.info('API is responding correctly (returned expected auth error)');
                } catch (error) {
                    if (error.message.includes('unexpected status')) {
                        throw error;
                    }
                    log.error('API check failed: ' + error.message);
                    throw error;
                }

                log.info('API check completed successfully');
            };

            exports.handler = async () => {
                return await apiCheck();
            };
            """
                .formatted(baseUrl);
    }
}
