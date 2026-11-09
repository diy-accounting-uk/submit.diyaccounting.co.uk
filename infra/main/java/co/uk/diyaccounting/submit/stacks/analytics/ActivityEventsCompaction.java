/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * The Lambda that gives each closed day of {@code activity_events} one compacted copy and replaces
 * the {@code activity_events_lake} view that reads it. It has no schedule of its own: {@code
 * NightlyIngestionWorkflow} runs it.
 *
 * <p>Its role can write only under {@code compacted/activity-events/} and holds no delete action,
 * so the job cannot change or remove a raw object.
 *
 * <p>Not a {@code Stack}: lives inside {@code AnalyticsStack}, modelled on {@link PassFiguresPublish}.
 */
public class ActivityEventsCompaction extends Construct {

    private static final String RAW_PREFIX = "curated/activity-events/";
    private static final String COMPACTED_PREFIX = "compacted/activity-events/";
    private static final String READ_VIEW_NAME = "activity_events_lake";

    public final Function compactLambda;
    public final Alarm errorsAlarm;

    @Value.Immutable
    public interface ActivityEventsCompactionProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** Athena writes its query output here with this Lambda's own role. */
        IBucket resultsBucket();

        /** The lake: Athena reads the raw objects and writes the compacted copy with this role. */
        IBucket lakeBucket();

        String glueDatabaseName();

        String athenaWorkGroupName();

        static ImmutableActivityEventsCompactionProps.Builder builder() {
            return ImmutableActivityEventsCompactionProps.builder();
        }
    }

    public ActivityEventsCompaction(final Construct scope, final ActivityEventsCompactionProps props) {
        super(scope, props.idPrefix() + "-ActivityEventsCompaction");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();
        var lakeArn = props.lakeBucket().getBucketArn();
        var resultsArn = props.resultsBucket().getBucketArn();
        var catalogArn = "arn:aws:glue:%s:%s:catalog".formatted(region, account);
        var databaseArn = "arn:aws:glue:%s:%s:database/%s".formatted(region, account, props.glueDatabaseName());
        var tableArnPrefix = "arn:aws:glue:%s:%s:table/%s/".formatted(region, account, props.glueDatabaseName());

        var functionName = prefix + "-activity-events-compact";

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ATHENA_WORK_GROUP_NAME", props.athenaWorkGroupName())
                .with("GLUE_DATABASE_NAME", props.glueDatabaseName())
                .with("ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName());

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-ActivityEventsCompact-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        var logGroup = ensureLogGroupWithDependency(
                stack, prefix + "-ActivityEventsCompactLogGroup", "/aws/lambda/" + functionName);

        this.compactLambda = DockerImageFunction.Builder.create(this, prefix + "-ActivityEventsCompactFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/activityEventsCompact.handler"))
                                .build()))
                .timeout(Duration.minutes(15))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(logGroup.logGroup())
                .build();
        this.compactLambda.getNode().addDependency(logGroup.ensureResource());

        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults",
                        "athena:StopQueryExecution"))
                .resources(List.of(
                        "arn:aws:athena:%s:%s:workgroup/%s".formatted(region, account, props.athenaWorkGroupName())))
                .build());

        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetTables", "glue:GetPartitions"))
                .resources(List.of(catalogArn, databaseArn, tableArnPrefix + "*"))
                .build());

        // CREATE OR REPLACE VIEW is a catalog write. Glue checks the catalog and database as well as
        // the table, and this names one table: the read view.
        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:CreateTable", "glue:UpdateTable"))
                .resources(List.of(catalogArn, databaseArn, tableArnPrefix + READ_VIEW_NAME))
                .build());

        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(resultsArn + "/*"))
                .build());
        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(resultsArn))
                .build());

        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketMultipartUploads"))
                .resources(List.of(lakeArn))
                .build());
        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(lakeArn + "/" + RAW_PREFIX + "*", lakeArn + "/" + COMPACTED_PREFIX + "*"))
                .build());
        this.compactLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"))
                .resources(List.of(lakeArn + "/" + COMPACTED_PREFIX + "*"))
                .build());

        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-ActivityEventsCompact-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("Activity events compaction errored at least once in an hour")
                .metric(this.compactLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(1)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }
}
