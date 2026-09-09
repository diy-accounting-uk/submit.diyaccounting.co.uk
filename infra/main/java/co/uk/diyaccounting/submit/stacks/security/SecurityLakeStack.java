/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.security;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.stacks.SubmitStackProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
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
import software.amazon.awscdk.services.events.CronOptions;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.sns.ITopic;
import software.amazon.awscdk.services.sns.Topic;
import software.constructs.Construct;

/**
 * The security dashboard's data pipeline: one nightly Lambda that writes Security Hub findings,
 * GuardDuty findings, GitHub alert counts, the lifecycle calendar, WAF blocks per rule and the
 * secret rotation record to the analytics lake, one JSON-lines file per source per day, and a
 * Glue table per source ({@link SecurityLakeTables}).
 *
 * <p>Imports the analytics lake bucket, the Glue database and the security-findings SNS topic by
 * the deterministic names {@code AnalyticsStack} and {@code ObservabilityStack} create, the same
 * way {@code SecurityDetectionStack} imports the CloudTrail log group: this stack can deploy and
 * destroy independently of either, while a CDK stack-level dependency (added where this stack is
 * instantiated) still orders it after both so the bucket and the database exist first.
 *
 * <p>Only synthesized when {@code securityServicesEnabled} is true, the same gate {@code
 * SecurityBaselineStack} uses: Security Hub and GuardDuty are account-singleton resources, so
 * their findings are only meaningful once those services are actually on for this account.
 */
public class SecurityLakeStack extends Stack {

    public final Lambda nightlyLambdaConstruct;
    public final Rule nightlySchedule;
    public final SecurityLakeTables tables;
    public final Alarm lifecycleDaysRemainingAlarm;

    // Every environment secret this deploy pipeline writes lives under "{env}/submit/...", so the
    // rotation record and the GitHub token read are scoped to that prefix rather than "*".
    private static final String SECRETS_PATH_PREFIX = "submit/";

    @Value.Immutable
    public interface SecurityLakeStackProps extends StackProps, SubmitStackProps {

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

        /** The GitHub repository the alert counts are read from. */
        @Value.Default
        default String githubRepo() {
            return "diy-accounting-uk/submit.diyaccounting.co.uk";
        }

        @Value.Default
        default boolean securityServicesEnabled() {
            return true;
        }

        static ImmutableSecurityLakeStackProps.Builder builder() {
            return ImmutableSecurityLakeStackProps.builder();
        }
    }

    public SecurityLakeStack(final Construct scope, final String id, final SecurityLakeStackProps props) {
        super(scope, id, props);

        if (!props.securityServicesEnabled()) {
            infof(
                    "SecurityLakeStack %s: securityServicesEnabled is false, skipping the security lake pipeline",
                    this.getNode().getId());
            this.nightlyLambdaConstruct = null;
            this.nightlySchedule = null;
            this.tables = null;
            this.lifecycleDaysRemainingAlarm = null;
            return;
        }

        var prefix = props.resourceNamePrefix();
        var sharedNames = props.sharedNames();

        // ============================================================================
        // Imports: the analytics lake bucket, the Glue database (by name only - see class doc)
        // and the security-findings SNS topic ObservabilityStack creates
        // ============================================================================
        IBucket lakeBucket = Bucket.fromBucketName(this, prefix + "-SecurityLakeBucketRef", sharedNames.analyticsLakeBucketName);

        String securityFindingsTopicArn =
                "arn:aws:sns:%s:%s:%s-security-findings".formatted(this.getRegion(), this.getAccount(), prefix);
        ITopic securityFindingsTopic =
                Topic.fromTopicArn(this, prefix + "-SecurityLakeFindingsTopic", securityFindingsTopicArn);

        // ============================================================================
        // Glue tables, one per source
        // ============================================================================
        this.tables = new SecurityLakeTables(
                this,
                SecurityLakeTables.SecurityLakeTablesProps.builder()
                        .idPrefix(prefix)
                        .databaseName(sharedNames.glueDatabaseName)
                        .lakeBucketName(sharedNames.analyticsLakeBucketName)
                        .build());

        // ============================================================================
        // Nightly Lambda
        // ============================================================================
        var functionName = prefix + "-security-lake-nightly";
        // The GitHub token secret is created by deploy-environment.yml's create-secrets job, one
        // per environment, at "{env}/submit/github/issue_bot_token" (see
        // scripts/put-secret-with-rotation-tag.sh); referencing it by name rather than ARN avoids
        // the random ARN suffix Secrets Manager appends, so no wildcard match is needed for
        // GetSecretValue's SecretId parameter.
        String opsGithubTokenSecretId = "%s/%s%s".formatted(props.envName(), SECRETS_PATH_PREFIX, "github/issue_bot_token");

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", sharedNames.analyticsLakeBucketName)
                .with("GITHUB_REPO", props.githubRepo())
                .with("OPS_GITHUB_TOKEN_SECRET_ID", opsGithubTokenSecretId);

        this.nightlyLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(functionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                        .ingestFunctionName(functionName)
                        .ingestHandler("app/functions/security/securityLakeNightly.handler")
                        .ingestLambdaArn(
                                "arn:aws:lambda:%s:%s:function:%s".formatted(this.getRegion(), this.getAccount(), functionName))
                        .ingestProvisionedConcurrencyAliasArn("arn:aws:lambda:%s:%s:function:%s:%s"
                                .formatted(
                                        this.getRegion(),
                                        this.getAccount(),
                                        functionName,
                                        sharedNames.provisionedConcurrencyAliasName))
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.minutes(5))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .environment(environment)
                        .build());
        var nightlyLambda = this.nightlyLambdaConstruct.ingestLambda;

        // ----------------------------------------------------------------------------------
        // IAM: Security Hub and GuardDuty findings are account-singleton, read-only, and have no
        // resource-level ARNs to scope to.
        // ----------------------------------------------------------------------------------
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("securityhub:GetFindings"))
                .resources(List.of("*"))
                .build());
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("guardduty:ListDetectors", "guardduty:ListFindings", "guardduty:GetFindings"))
                .resources(List.of("*"))
                .build());

        // The GitHub token read, scoped to the one secret this Lambda reads.
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:GetSecretValue"))
                .resources(List.of("arn:aws:secretsmanager:%s:%s:secret:%s-*"
                        .formatted(this.getRegion(), this.getAccount(), opsGithubTokenSecretId)))
                .build());

        // The rotation record, scoped to every secret this environment's deploy pipeline creates.
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("secretsmanager:DescribeSecret"))
                .resources(List.of("arn:aws:secretsmanager:%s:%s:secret:%s/%s*"
                        .formatted(this.getRegion(), this.getAccount(), props.envName(), SECRETS_PATH_PREFIX)))
                .build());

        // WAF logs live in us-east-1, on whichever deployment's WAF log group is currently live
        // (EdgeStack, one per app deployment); this Lambda discovers the current set by prefix
        // rather than depending on a specific deployment's stack.
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:DescribeLogGroups"))
                .resources(List.of(
                        "arn:aws:logs:us-east-1:%s:log-group:aws-waf-logs-%s-*".formatted(this.getAccount(), props.envName())))
                .build());
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:StartQuery", "logs:GetQueryResults", "logs:StopQuery"))
                .resources(List.of("arn:aws:logs:us-east-1:%s:log-group:aws-waf-logs-%s-*:*"
                        .formatted(this.getAccount(), props.envName())))
                .build());

        // The lake bucket write, scoped to this pipeline's own prefix.
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(lakeBucket.getBucketArn() + "/curated/security/*"))
                .build());

        // The lifecycle-days-remaining custom metric, namespace-scoped so this role can publish
        // nothing else.
        nightlyLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("cloudwatch:PutMetricData"))
                .resources(List.of("*"))
                .conditions(java.util.Map.of("StringEquals", java.util.Map.of("cloudwatch:namespace", "Submit/Security")))
                .build());

        // ============================================================================
        // Nightly schedule: 03:20 UTC, after the analytics ingestion chain's usual small hours
        // and off the top-of-hour queue.
        // ============================================================================
        this.nightlySchedule = Rule.Builder.create(this, prefix + "-SecurityLakeNightlySchedule")
                .ruleName(prefix + "-security-lake-nightly")
                .description("Nightly Security Hub, GuardDuty, GitHub alert, lifecycle, WAF and rotation pull")
                .schedule(Schedule.cron(CronOptions.builder()
                        .minute("20")
                        .hour("3")
                        .day("*")
                        .month("*")
                        .year("*")
                        .build()))
                .targets(List.of(new LambdaFunction(nightlyLambda)))
                .build();

        // ============================================================================
        // Alarms: the Lambda construct's own health checks (Errors and log-error-line detection)
        // fanned into one composite and wired to the security-findings topic, the same shape
        // ObservabilityUE1Stack uses for its budget alert forward Lambda; plus a dedicated alarm
        // on the lifecycle-days-remaining metric for when any tracked item is inside 60 days of
        // its end date.
        // ============================================================================
        var healthAlarm = Lambda.stackHealthAlarm(this, prefix, "security-lake", List.of(this.nightlyLambdaConstruct));
        healthAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));

        this.lifecycleDaysRemainingAlarm = Alarm.Builder.create(this, prefix + "-LifecycleDaysRemainingAlarm")
                .alarmName(prefix + "-lifecycle-days-remaining")
                .alarmDescription(
                        "A tracked lifecycle item (a runtime, a dependency, a certificate) is within 60 days of its"
                                + " end date")
                .metric(Metric.Builder.create()
                        .namespace("Submit/Security")
                        .metricName("LifecycleMinDaysRemaining")
                        .statistic("Minimum")
                        .period(Duration.hours(24))
                        .build())
                .threshold(60)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
        this.lifecycleDaysRemainingAlarm.addAlarmAction(new SnsAction(securityFindingsTopic));

        cfnOutput(this, "SecurityLakeNightlyLambdaArn", nightlyLambda.getFunctionArn());
        infof(
                "SecurityLakeStack %s created: nightly Lambda %s, seven Glue tables under %s, and two alarms wired to"
                        + " the security-findings topic",
                this.getNode().getId(), functionName, sharedNames.glueDatabaseName);
    }
}
