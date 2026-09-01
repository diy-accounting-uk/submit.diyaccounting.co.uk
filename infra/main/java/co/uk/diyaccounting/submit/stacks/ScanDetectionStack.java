/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
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
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.constructs.Construct;

/**
 * Environment-level 404-rate scan detection (GitHub issue #9, acceptance criteria 2 and 5).
 *
 * <p>Runs one Lambda every five minutes over the {@code cloudfront_requests} Glue table that
 * {@code AnalyticsStack} already catalogues from {@code EdgeStack}'s v2 Parquet access-log
 * delivery, looking for one client IP raising more than a threshold of 404s in one minute against
 * one distribution. {@code SecurityDetectionStack} reads CloudTrail and creates no compute; this
 * stack reads access logs and owns a Lambda and a schedule, which is why it is a separate stack
 * rather than a phase added to that one.
 */
public class ScanDetectionStack extends Stack {

    public final Function scanRate404DetectFunction;
    public final Rule schedule;

    @Value.Immutable
    public interface ScanDetectionStackProps extends StackProps, SubmitStackProps {

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

        // Read from cdk-environment/cdk.json's scanDetection404PerMinute context key, through the
        // same reflection loader ga4PropertyId uses.
        @Value.Default
        default int scanDetection404PerMinute() {
            return 20;
        }

        static ImmutableScanDetectionStackProps.Builder builder() {
            return ImmutableScanDetectionStackProps.builder();
        }
    }

    public ScanDetectionStack(final Construct scope, final String id, final ScanDetectionStackProps props) {
        super(scope, id, props);

        var prefix = props.resourceNamePrefix();
        var sharedNames = props.sharedNames();
        var region = this.getRegion();
        var account = this.getAccount();

        Tags.of(this).add("DataClassification", "internal");
        Tags.of(this).add("BackupRequired", "false");

        // ============================================================================
        // The aggregator Lambda
        // ============================================================================
        var functionName = prefix + "-scan-detect-404";

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", sharedNames.analyticsLakeBucketName)
                .with("ATHENA_WORK_GROUP_NAME", sharedNames.athenaWorkGroupName)
                .with("GLUE_DATABASE_NAME", sharedNames.glueDatabaseName)
                .with("SCAN_DETECTION_404_PER_MINUTE", String.valueOf(props.scanDetection404PerMinute()))
                .with("ACTIVITY_BUS_NAME", sharedNames.activityBusName);

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-ScanDetect404-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(sharedNames.ecrRepositoryArn)
                        .repositoryName(sharedNames.ecrRepositoryName)
                        .build());

        // This stack is env-scoped (one deployment per environment, redeployed indefinitely), so
        // the function name is stable forever, not per-deployment - use the idempotent
        // create-if-missing path rather than a plain LogGroup, matching every other job Lambda in
        // an env-scoped stack (IngestionStack, AnalyticsDashboard).
        var logGroup = ensureLogGroupWithDependency(this, prefix + "-ScanDetect404LogGroup", "/aws/lambda/" + functionName);

        this.scanRate404DetectFunction = DockerImageFunction.Builder.create(this, prefix + "-ScanDetect404Fn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/security/scanRate404Detect.handler"))
                                .build()))
                .timeout(Duration.minutes(2))
                .memorySize(512)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(logGroup.logGroup())
                .build();
        this.scanRate404DetectFunction.getNode().addDependency(logGroup.ensureResource());

        // Discover distributions: partition projection means Athena cannot enumerate them itself,
        // so the Lambda lists the lake's raw/cloudfront/ common prefixes. Scoped to that one
        // prefix, not the whole bucket. cloudfront:ListDistributions is not an option here: it
        // only accepts Resource: "*", which this repo's IAM checks reject.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(lakeBucketArn(sharedNames.analyticsLakeBucketName)))
                .conditions(Map.of("StringLike", Map.of("s3:prefix", "raw/cloudfront/*")))
                .build());

        // The high-water mark: one SSM parameter, standard tier. Parameter Store rather than
        // DynamoDB, so this security job never writes to a table SecurityDetectionStack's own
        // alarms watch.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("ssm:GetParameter", "ssm:PutParameter"))
                .resources(List.of(highWaterMarkParameterArn(region, account, props.envName())))
                .build());

        // Athena: run and poll one query per date the window touches, on this environment's own
        // workgroup.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults"))
                .resources(List.of(athenaWorkGroupArn(region, account, sharedNames.athenaWorkGroupName)))
                .build());

        // Glue: read the database and the one table the query reads.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(region, account),
                        glueDatabaseArn(region, account, sharedNames.glueDatabaseName),
                        glueTableArn(region, account, sharedNames.glueDatabaseName, "cloudfront_requests")))
                .build());

        // Athena writes its query output to the results bucket and reads it back for
        // GetQueryResults, and checks the bucket's location before it starts.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(resultsBucketArn(sharedNames.analyticsResultsBucketName) + "/*"))
                .build());
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation"))
                .resources(List.of(resultsBucketArn(sharedNames.analyticsResultsBucketName)))
                .build());

        // Athena reads the Parquet data itself from the lake, under the same prefix this Lambda
        // lists above.
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(lakeBucketArn(sharedNames.analyticsLakeBucketName) + "/raw/cloudfront/*"))
                .build());

        // Publish one ActivityEvent per row detected, onto this environment's own activity bus.
        // Same region as this stack (eu-west-2), so no cross-region client construction is needed
        // (contrast EdgeStack's wafScanDetect Lambda, which runs in us-east-1).
        this.scanRate404DetectFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(
                        "arn:aws:events:" + region + ":" + account + ":event-bus/" + sharedNames.activityBusName))
                .build());

        // ============================================================================
        // Schedule and alarms
        // ============================================================================
        this.schedule = Rule.Builder.create(this, prefix + "-ScanDetect404Schedule")
                .ruleName(functionName + "-schedule")
                .description("Poll cloudfront_requests every five minutes for a 404 scan burst from one IP")
                .schedule(Schedule.rate(Duration.minutes(5)))
                .targets(List.of(LambdaFunction.Builder.create(this.scanRate404DetectFunction)
                        .build()))
                .build();

        // A security job erroring is worth knowing about quickly. No SnsAction: the
        // alarm-state-change rule in OpsStack routes every {env}-env-* alarm in the account to
        // Telegram, which keeps the app-scoped alert topic out of this env-scoped stack.
        Alarm.Builder.create(this, prefix + "-ScanDetect404ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("The 404 scan-rate detector errored at least once in five minutes")
                .metric(this.scanRate404DetectFunction.metricErrors(
                        MetricOptions.builder().period(Duration.minutes(5)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // A security job that silently stops running is the failure mode worth catching most: no
        // invocation in 30 minutes (six missed five-minute schedules) breaches.
        Alarm.Builder.create(this, prefix + "-ScanDetect404MissedAlarm")
                .alarmName(functionName + "-missed")
                .alarmDescription("The 404 scan-rate detector has not run in 30 minutes")
                .metric(this.scanRate404DetectFunction.metricInvocations(
                        MetricOptions.builder().period(Duration.minutes(30)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.BREACHING)
                .build();

        cfnOutput(this, "ScanDetect404FunctionArn", this.scanRate404DetectFunction.getFunctionArn());
        cfnOutput(this, "ScanDetect404ScheduleArn", this.schedule.getRuleArn());

        infof("ScanDetectionStack %s created successfully for %s", this.getNode().getId(), prefix);
    }

    private String lakeBucketArn(String bucketName) {
        return "arn:aws:s3:::" + bucketName;
    }

    private String resultsBucketArn(String bucketName) {
        return "arn:aws:s3:::" + bucketName;
    }

    private String highWaterMarkParameterArn(String region, String account, String envName) {
        return "arn:aws:ssm:%s:%s:parameter/%s/submit/scan-detection/last-evaluated-minute"
                .formatted(region, account, envName);
    }

    private String athenaWorkGroupArn(String region, String account, String workGroupName) {
        return "arn:aws:athena:%s:%s:workgroup/%s".formatted(region, account, workGroupName);
    }

    private String glueCatalogArn(String region, String account) {
        return "arn:aws:glue:%s:%s:catalog".formatted(region, account);
    }

    private String glueDatabaseArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(region, account, databaseName);
    }

    private String glueTableArn(String region, String account, String databaseName, String tableName) {
        return "arn:aws:glue:%s:%s:table/%s/%s".formatted(region, account, databaseName, tableName);
    }
}
