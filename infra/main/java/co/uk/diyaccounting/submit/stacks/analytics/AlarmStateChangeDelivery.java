/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.IEventBus;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.FirehoseDeliveryStream;
import software.amazon.awscdk.services.glue.CfnTable;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.kinesisfirehose.CfnDeliveryStream;
import software.amazon.awscdk.services.kinesisfirehose.DeliveryStream;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;
import software.constructs.IDependable;

/**
 * Delivers every CloudWatch alarm state change on this environment's alarms into the lake: one
 * {@link Rule} on the default bus, one Firehose delivery stream and one Glue table, modelled on
 * {@link TableChangeDelivery} and, for the stream itself, on {@code AnalyticsStack}'s activity
 * events stream (a Lambda processor flattens the JSON envelope, then Firehose converts to
 * Parquet against the Glue table's schema).
 *
 * <p>One rule per environment, not per deployment: {@code OpsStack}'s {@code
 * AlarmStateChangeRule} is built once per live deployment, so copying that shape here would
 * double every environment-scoped row while two deployments are up. The {@code {envName}-}
 * prefix on {@code detail.alarmName} covers both {@code {env}-env-} and {@code
 * {env}-<slug>-app-} names and excludes the {@code check-} alarms, matching what {@code
 * alarmToGithubIssue.js} already sees.
 */
public class AlarmStateChangeDelivery extends Construct {

    public final Rule rule;
    public final CfnDeliveryStream deliveryStream;
    public final CfnTable glueTable;
    public final Lambda transformLambdaConstruct;

    @Value.Immutable
    public interface AlarmStateChangeDeliveryProps {

        IBucket lakeBucket();

        String glueDatabaseName();

        /**
         * The Glue database resource, so this construct's table carries an explicit
         * CloudFormation dependency on it. Optional because a standalone test of this construct
         * has no separate database resource to depend on.
         */
        @Value.Default
        default Optional<IDependable> glueDatabaseDependency() {
            return Optional.empty();
        }

        SubmitSharedNames sharedNames();

        String envName();

        String resourceNamePrefix();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        static ImmutableAlarmStateChangeDeliveryProps.Builder builder() {
            return ImmutableAlarmStateChangeDeliveryProps.builder();
        }
    }

    private static final String CURATED_PREFIX = "curated/alarm-state-changes/";
    private static final String GLUE_TABLE_NAME = "alarm_state_changes";

    public AlarmStateChangeDelivery(final Construct scope, final String id, final AlarmStateChangeDeliveryProps props) {
        super(scope, id);

        var stack = Stack.of(this);
        var sharedNames = props.sharedNames();
        var prefix = props.resourceNamePrefix();
        var lakeBucket = props.lakeBucket();
        var deliveryStreamName = sharedNames.alarmStateChangeDeliveryStreamName;

        // ============================================================================
        // Glue table
        // ============================================================================
        this.glueTable = buildGlueTable(props, prefix);
        props.glueDatabaseDependency().ifPresent(dependency -> this.glueTable.getNode().addDependency(dependency));

        // ============================================================================
        // Transform Lambda: flattens the EventBridge envelope before Firehose converts to
        // Parquet, the same shape AnalyticsStack builds for the activity events stream.
        // ============================================================================
        this.transformLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(sharedNames.alarmStateChangeTransformLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .ingestFunctionName(sharedNames.alarmStateChangeTransformLambdaFunctionName)
                        .ingestHandler(sharedNames.alarmStateChangeTransformLambdaHandler)
                        .ingestLambdaArn(sharedNames.alarmStateChangeTransformLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.alarmStateChangeTransformProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(60))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .environment(new PopulatedMap<String, String>().with("ENVIRONMENT_NAME", props.envName()))
                        .build());
        var transformLambda = this.transformLambdaConstruct.ingestLambda;

        // ============================================================================
        // Delivery stream
        // ============================================================================
        var streamLogGroup = LogGroup.Builder.create(this, prefix + "-AlarmStateChangesStreamLogGroup")
                .logGroupName(sharedNames.deliveryStreamLogGroupName(deliveryStreamName))
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var firehoseRole = Role.Builder.create(this, prefix + "-AlarmStateChangesFirehoseRole")
                .roleName(deliveryStreamName + "-firehose-role")
                .assumedBy(new ServicePrincipal("firehose.amazonaws.com"))
                .build();

        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "s3:AbortMultipartUpload",
                        "s3:GetBucketLocation",
                        "s3:ListBucket",
                        "s3:ListBucketMultipartUploads",
                        "s3:PutObject"))
                .resources(List.of(lakeBucket.getBucketArn(), lakeBucket.getBucketArn() + "/*"))
                .build());

        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:PutLogEvents"))
                .resources(List.of(streamLogGroup.getLogGroupArn()))
                .build());

        // GetFunctionConfiguration goes with InvokeFunction: Firehose reads the timeout off the
        // function before it invokes it, and delivery fails outright without it.
        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("lambda:InvokeFunction", "lambda:GetFunctionConfiguration"))
                .resources(List.of(this.transformLambdaConstruct.ingestLambdaAliasArn))
                .build());

        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetTable", "glue:GetTableVersion", "glue:GetTableVersions"))
                .resources(List.of(
                        "arn:aws:glue:%s:%s:catalog".formatted(stack.getRegion(), stack.getAccount()),
                        "arn:aws:glue:%s:%s:database/%s"
                                .formatted(stack.getRegion(), stack.getAccount(), props.glueDatabaseName()),
                        "arn:aws:glue:%s:%s:table/%s/%s"
                                .formatted(
                                        stack.getRegion(), stack.getAccount(), props.glueDatabaseName(), GLUE_TABLE_NAME)))
                .build());

        this.deliveryStream = CfnDeliveryStream.Builder.create(this, prefix + "-AlarmStateChangesStream")
                .deliveryStreamName(deliveryStreamName)
                .deliveryStreamType("DirectPut")
                .extendedS3DestinationConfiguration(
                        CfnDeliveryStream.ExtendedS3DestinationConfigurationProperty.builder()
                                .bucketArn(lakeBucket.getBucketArn())
                                .roleArn(firehoseRole.getRoleArn())
                                .prefix(CURATED_PREFIX + "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                                .errorOutputPrefix("errors/alarm-state-changes/!{firehose:error-output-type}/"
                                        + "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                                .bufferingHints(CfnDeliveryStream.BufferingHintsProperty.builder()
                                        .intervalInSeconds(900)
                                        .sizeInMBs(128)
                                        .build())
                                .compressionFormat("UNCOMPRESSED")
                                .cloudWatchLoggingOptions(CfnDeliveryStream.CloudWatchLoggingOptionsProperty.builder()
                                        .enabled(true)
                                        .logGroupName(sharedNames.deliveryStreamLogGroupName(deliveryStreamName))
                                        .logStreamName("S3Delivery")
                                        .build())
                                .processingConfiguration(CfnDeliveryStream.ProcessingConfigurationProperty.builder()
                                        .enabled(true)
                                        .processors(List.of(CfnDeliveryStream.ProcessorProperty.builder()
                                                .type("Lambda")
                                                .parameters(
                                                        List.of(CfnDeliveryStream.ProcessorParameterProperty.builder()
                                                                .parameterName("LambdaArn")
                                                                .parameterValue(
                                                                        this.transformLambdaConstruct
                                                                                .ingestLambdaAliasArn)
                                                                .build()))
                                                .build()))
                                        .build())
                                .dataFormatConversionConfiguration(
                                        CfnDeliveryStream.DataFormatConversionConfigurationProperty.builder()
                                                .enabled(true)
                                                .inputFormatConfiguration(
                                                        CfnDeliveryStream.InputFormatConfigurationProperty.builder()
                                                                .deserializer(
                                                                        CfnDeliveryStream.DeserializerProperty.builder()
                                                                                .openXJsonSerDe(
                                                                                        CfnDeliveryStream
                                                                                                .OpenXJsonSerDeProperty
                                                                                                .builder()
                                                                                                .convertDotsInJsonKeysToUnderscores(
                                                                                                        false)
                                                                                                .caseInsensitive(false)
                                                                                                .build())
                                                                                .build())
                                                                .build())
                                                .outputFormatConfiguration(
                                                        CfnDeliveryStream.OutputFormatConfigurationProperty.builder()
                                                                .serializer(
                                                                        CfnDeliveryStream.SerializerProperty.builder()
                                                                                .parquetSerDe(
                                                                                        CfnDeliveryStream
                                                                                                .ParquetSerDeProperty
                                                                                                .builder()
                                                                                                .compression("SNAPPY")
                                                                                                .build())
                                                                                .build())
                                                                .build())
                                                .schemaConfiguration(
                                                        CfnDeliveryStream.SchemaConfigurationProperty.builder()
                                                                .catalogId(stack.getAccount())
                                                                .databaseName(props.glueDatabaseName())
                                                                .tableName(GLUE_TABLE_NAME)
                                                                .roleArn(firehoseRole.getRoleArn())
                                                                .versionId("LATEST")
                                                                .build())
                                                .build())
                                .build())
                .build();
        this.deliveryStream.getNode().addDependency(streamLogGroup);
        this.deliveryStream.getNode().addDependency(firehoseRole);
        // Format conversion resolves the destination schema from Glue at delivery time, so the
        // table has to exist before the stream that converts against it.
        this.deliveryStream.getNode().addDependency(this.glueTable);

        // ============================================================================
        // EventBridge rule: every alarm on this environment's alarms into the lake
        // ============================================================================
        IEventBus defaultBus =
                software.amazon.awscdk.services.events.EventBus.fromEventBusName(this, "DefaultBus", "default");

        var importedStream =
                DeliveryStream.fromDeliveryStreamArn(this, "AlarmStateChangesStreamRef", this.deliveryStream.getAttrArn());

        this.rule = Rule.Builder.create(this, "AlarmToLakeRule")
                .ruleName(prefix + "-alarm-to-lake")
                .description("Deliver every alarm state change on this environment's alarms to the analytics lake")
                .eventBus(defaultBus)
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.cloudwatch"))
                        .detailType(List.of("CloudWatch Alarm State Change"))
                        .detail(Map.of("alarmName", List.of(Map.of("prefix", props.envName() + "-"))))
                        .build())
                .targets(List.of(new FirehoseDeliveryStream(importedStream)))
                .build();
        // The imported reference hides the delivery stream from CDK's dependency graph.
        this.rule.getNode().addDependency(this.deliveryStream);
    }

    /**
     * Columns match {@code alarmStateChangeTransform.js}'s flattened row exactly. Partition
     * projection over year/month/day, the same shape {@link TableChangeDelivery#buildGlueTable}
     * uses.
     */
    private CfnTable buildGlueTable(AlarmStateChangeDeliveryProps props, String prefix) {
        var location = "s3://%s/%s".formatted(props.lakeBucket().getBucketName(), CURATED_PREFIX);

        var tableParameters = new LinkedHashMap<String, String>();
        tableParameters.put("classification", "parquet");
        tableParameters.put("has_encrypted_data", "false");
        tableParameters.put("projection.enabled", "true");
        tableParameters.put("projection.year.type", "integer");
        tableParameters.put("projection.year.range", "2026,2035");
        tableParameters.put("projection.month.type", "integer");
        tableParameters.put("projection.month.range", "1,12");
        tableParameters.put("projection.month.digits", "2");
        tableParameters.put("projection.day.type", "integer");
        tableParameters.put("projection.day.range", "1,31");
        tableParameters.put("projection.day.digits", "2");
        tableParameters.put("storage.location.template", location + "year=${year}/month=${month}/day=${day}/");

        return CfnTable.Builder.create(this, prefix + "-AlarmStateChangesGlueTable")
                .catalogId(Stack.of(this).getAccount())
                .databaseName(props.glueDatabaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(GLUE_TABLE_NAME)
                        .description("CloudWatch alarm state changes for this environment's alarms")
                        .tableType("EXTERNAL_TABLE")
                        .parameters(tableParameters)
                        .partitionKeys(List.of(
                                CfnTable.ColumnProperty.builder()
                                        .name("year")
                                        .type("int")
                                        .build(),
                                CfnTable.ColumnProperty.builder()
                                        .name("month")
                                        .type("int")
                                        .build(),
                                CfnTable.ColumnProperty.builder()
                                        .name("day")
                                        .type("int")
                                        .build()))
                        .storageDescriptor(CfnTable.StorageDescriptorProperty.builder()
                                .location(location)
                                .inputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat")
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary(
                                                "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe")
                                        .build())
                                .columns(buildColumns())
                                .build())
                        .build())
                .build();
    }

    private static List<CfnTable.ColumnProperty> buildColumns() {
        return List.of(
                column("event_id", "string"),
                column("event_ts", "timestamp"),
                column("ingest_ts", "timestamp"),
                column("alarm_name", "string"),
                column("alarm_arn", "string"),
                column("family", "string"),
                column("deployment_slug", "string"),
                column("state", "string"),
                column("previous_state", "string"),
                column("reason", "string"),
                column("region", "string"),
                column("namespace", "string"),
                column("metric_name", "string"),
                column("period_seconds", "bigint"),
                column("threshold", "double"),
                column("env", "string"),
                column("detail_json", "string"));
    }

    private static CfnTable.ColumnProperty column(String name, String type) {
        return CfnTable.ColumnProperty.builder().name(name).type(type).build();
    }
}
