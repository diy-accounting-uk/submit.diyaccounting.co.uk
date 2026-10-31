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
 * The Lambda behind the per-pass figures on "My generated passes": reads {@code
 * v_pass_performance} through Athena and writes one {@code figures#<code>} item per pass into the
 * passes table. {@code passMyPassesGet.js} reads those items by key and never queries Athena or
 * scans a customer table. It has no schedule of its own: {@code NightlyIngestionWorkflow} runs it
 * as its last step, after the ingestion jobs have landed.
 *
 * <p>Not a {@code Stack}: lives inside {@code AnalyticsStack}, modelled on {@link
 * OperatorSnapshotPublish}.
 */
public class PassFiguresPublish extends Construct {

    public final Function figuresPublishLambda;
    public final Alarm errorsAlarm;

    @Value.Immutable
    public interface PassFiguresPublishProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** The analytics results bucket: Athena writes its query output here, and the Lambda's
         * own role (not a separate Athena service role) needs to read and write it. */
        IBucket resultsBucket();

        /** The analytics lake bucket: read via Athena for the view query. */
        IBucket lakeBucket();

        /** The passes table the figures items are written to and read back from, by key. */
        String passesTableName();

        String glueDatabaseName();

        String athenaWorkGroupName();

        static ImmutablePassFiguresPublishProps.Builder builder() {
            return ImmutablePassFiguresPublishProps.builder();
        }
    }

    public PassFiguresPublish(final Construct scope, final PassFiguresPublishProps props) {
        super(scope, props.idPrefix() + "-PassFiguresPublish");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();

        // ============================================================================
        // Figures-publish Lambda
        // ============================================================================
        var functionName = prefix + "-pass-figures-publish";

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ATHENA_WORK_GROUP_NAME", props.athenaWorkGroupName())
                .with("GLUE_DATABASE_NAME", props.glueDatabaseName())
                .with("PASSES_DYNAMODB_TABLE_NAME", props.passesTableName());

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-PassFiguresPublish-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped, so this function name is stable forever, not
        // per-deployment - the idempotent create-if-missing path, matching metricsPublishLambda.
        var figuresPublishLogGroup = ensureLogGroupWithDependency(
                stack, prefix + "-PassFiguresPublishLogGroup", "/aws/lambda/" + functionName);

        this.figuresPublishLambda = DockerImageFunction.Builder.create(this, prefix + "-PassFiguresPublishFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/passFiguresPublish.handler"))
                                .build()))
                .timeout(Duration.minutes(15))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(figuresPublishLogGroup.logGroup())
                .build();
        this.figuresPublishLambda.getNode().addDependency(figuresPublishLogGroup.ensureResource());

        // Athena: run and poll queries against the one workgroup this stack owns.
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "athena:StartQueryExecution",
                        "athena:GetQueryExecution",
                        "athena:GetQueryResults",
                        "athena:StopQueryExecution"))
                .resources(List.of(athenaWorkGroupArn(region, account, props.athenaWorkGroupName())))
                .build());

        // Glue: read the database and every table in it (the views and the tables they read).
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"))
                .resources(List.of(
                        glueCatalogArn(region, account),
                        glueDatabaseArn(region, account, props.glueDatabaseName()),
                        glueAllTablesArn(region, account, props.glueDatabaseName())))
                .build());

        // Athena writes its own query output to the results bucket and this Lambda reads it
        // back via GetQueryResults' underlying CSV, so both actions are needed even though the
        // Lambda never calls S3 directly for it - same grant as metricsPublishLambda.
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject"))
                .resources(List.of(props.resultsBucket().getBucketArn() + "/*"))
                .build());
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetBucketLocation", "s3:ListBucket"))
                .resources(List.of(props.resultsBucket().getBucketArn()))
                .build());

        // The lake: read for the files the view's tables sit on.
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/*"))
                .build());
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(props.lakeBucket().getBucketArn()))
                .build());

        // The passes table: read figures items by key and write them. No Query or Scan.
        this.figuresPublishLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:BatchGetItem", "dynamodb:PutItem"))
                .resources(
                        List.of("arn:aws:dynamodb:%s:%s:table/%s".formatted(region, account, props.passesTableName())))
                .build());

        // ============================================================================
        // Alarm
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-PassFiguresPublish-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("Pass figures publish errored at least once in an hour")
                .metric(this.figuresPublishLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(1)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }

    private static String glueCatalogArn(String region, String account) {
        return "arn:aws:glue:%s:%s:catalog".formatted(region, account);
    }

    private static String glueDatabaseArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(region, account, databaseName);
    }

    private static String glueAllTablesArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:table/%s/*".formatted(region, account, databaseName);
    }

    private static String athenaWorkGroupArn(String region, String account, String workGroupName) {
        return "arn:aws:athena:%s:%s:workgroup/%s".formatted(region, account, workGroupName);
    }
}
