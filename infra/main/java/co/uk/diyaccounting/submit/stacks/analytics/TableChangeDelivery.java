/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.glue.CfnTable;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.kinesisfirehose.CfnDeliveryStream;
import software.amazon.awscdk.services.lambda.CfnEventSourceMapping;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;
import software.constructs.IDependable;

/**
 * DynamoDB table changes into the lake: one consumer Lambda on the receipts, bundles,
 * subscriptions and passes streams, one delivery stream and one Glue table per table.
 *
 * <p>The consumer Lambda does the redaction: only a per-table whitelist of fields ever leaves
 * DynamoDB (see {@code app/functions/analytics/dynamoStreamToFirehose.js}), so Firehose here
 * needs no processing Lambda of its own, unlike the activity-events stream.
 *
 * <p>Streams already exist on all four tables (enabled by {@code DataStack} via {@code
 * KindCdk.ensureStream}). This construct resolves each stream's ARN at deploy time with its own
 * read-only {@code dynamodb:DescribeTable} call, because the ARN carries a timestamp suffix that
 * cannot be built from the table name alone and the event source mapping needs it as a synth-time
 * value.
 */
public class TableChangeDelivery extends Construct {

    private static final List<String> STREAMED_TABLE_KINDS = List.of("receipts", "bundles", "subscriptions", "passes");

    public final Function consumerLambda;
    public final List<CfnDeliveryStream> deliveryStreams = new ArrayList<>();
    public final List<CfnTable> glueTables = new ArrayList<>();
    public final List<CfnEventSourceMapping> eventSourceMappings = new ArrayList<>();

    @Value.Immutable
    public interface TableChangeDeliveryProps {

        IBucket lakeBucket();

        String glueDatabaseName();

        /**
         * The Glue database resource, so this construct's tables can carry an explicit
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

        static ImmutableTableChangeDeliveryProps.Builder builder() {
            return ImmutableTableChangeDeliveryProps.builder();
        }
    }

    public TableChangeDelivery(final Construct scope, final String id, final TableChangeDeliveryProps props) {
        super(scope, id);

        var stack = Stack.of(this);
        var sharedNames = props.sharedNames();
        var prefix = props.resourceNamePrefix();

        Map<String, String> tableNameByKind = new LinkedHashMap<>();
        tableNameByKind.put("receipts", sharedNames.receiptsTableName);
        tableNameByKind.put("bundles", sharedNames.bundlesTableName);
        tableNameByKind.put("subscriptions", sharedNames.subscriptionsTableName);
        tableNameByKind.put("passes", sharedNames.passesTableName);

        Map<String, String> deliveryStreamNameByTable = new LinkedHashMap<>();
        for (String kind : STREAMED_TABLE_KINDS) {
            deliveryStreamNameByTable.put(tableNameByKind.get(kind), sharedNames.tableStreamDeliveryStreamName(kind));
        }

        // ============================================================================
        // Consumer Lambda: one function, four event source mappings
        // ============================================================================
        var consumerLambdaConstruct = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(sharedNames.dynamoStreamToFirehoseLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.ecrRepositoryName())
                        .ecrRepositoryArn(props.ecrRepositoryArn())
                        .ingestFunctionName(sharedNames.dynamoStreamToFirehoseLambdaFunctionName)
                        .ingestHandler(sharedNames.dynamoStreamToFirehoseLambdaHandler)
                        .ingestLambdaArn(sharedNames.dynamoStreamToFirehoseLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.dynamoStreamToFirehoseProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(60))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .environment(new PopulatedMap<String, String>()
                                .with("ENVIRONMENT_NAME", props.envName())
                                .with("STREAM_TARGETS", buildStreamTargetsJson(deliveryStreamNameByTable)))
                        .build());
        this.consumerLambda = consumerLambdaConstruct.ingestLambda;

        // Redacting the passes table's redemption code uses the same salted HMAC helper the app
        // uses for subs, so the Lambda needs the same secret-read grant every other consumer of
        // subHasher.js gets.
        SubHashSaltHelper.grantSaltAccess(this.consumerLambda, stack.getRegion(), stack.getAccount(), props.envName());

        this.consumerLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:DescribeStream", "dynamodb:ListStreams"))
                .resources(tableNameByKind.values().stream()
                        .map(tableName -> "arn:aws:dynamodb:%s:%s:table/%s/stream/*"
                                .formatted(stack.getRegion(), stack.getAccount(), tableName))
                        .toList())
                .build());

        this.consumerLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("firehose:PutRecordBatch"))
                .resources(deliveryStreamNameByTable.values().stream()
                        .map(streamName -> "arn:aws:firehose:%s:%s:deliverystream/%s"
                                .formatted(stack.getRegion(), stack.getAccount(), streamName))
                        .toList())
                .build());

        // ============================================================================
        // Per-table delivery stream and Glue table
        // ============================================================================
        for (String kind : STREAMED_TABLE_KINDS) {
            String tableName = tableNameByKind.get(kind);
            String deliveryStreamName = sharedNames.tableStreamDeliveryStreamName(kind);
            String glueTableName = "dynamo_" + kind;
            String curatedPrefix = "curated/tables/%s/".formatted(kind);

            var glueTable = buildGlueTable(props, prefix, kind, glueTableName, curatedPrefix);
            props.glueDatabaseDependency().ifPresent(dependency -> glueTable.getNode().addDependency(dependency));
            this.glueTables.add(glueTable);

            var deliveryStream = buildDeliveryStream(
                    props, prefix, kind, deliveryStreamName, glueTableName, curatedPrefix, glueTable);
            this.deliveryStreams.add(deliveryStream);

            String streamArn = describeTableStreamArn(tableName);
            var mapping = CfnEventSourceMapping.Builder.create(this, prefix + "-" + kind + "-StreamMapping")
                    .eventSourceArn(streamArn)
                    .functionName(this.consumerLambda.getFunctionName())
                    .startingPosition("LATEST")
                    .batchSize(100.0)
                    .maximumBatchingWindowInSeconds(60.0)
                    .bisectBatchOnFunctionError(true)
                    .maximumRetryAttempts(3.0)
                    .functionResponseTypes(List.of("ReportBatchItemFailures"))
                    .build();
            this.eventSourceMappings.add(mapping);
        }
    }

    /**
     * Resolves one table's latest DynamoDB Streams ARN with a read-only {@code DescribeTable}
     * call. The stream is already enabled by {@code DataStack}; this never enables one itself,
     * so its policy needs only {@code dynamodb:DescribeTable}.
     */
    private String describeTableStreamArn(String tableName) {
        var stack = Stack.of(this);
        var describeTableCall = AwsSdkCall.builder()
                .service("DynamoDB")
                .action("describeTable")
                .parameters(Map.of("TableName", tableName))
                .physicalResourceId(PhysicalResourceId.of(tableName + "-stream-arn-lookup"))
                .build();

        var resource = AwsCustomResource.Builder.create(this, tableName + "-DescribeTableStreamArn")
                .onCreate(describeTableCall)
                .onUpdate(describeTableCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("dynamodb:DescribeTable"))
                                .resources(List.of("arn:aws:dynamodb:%s:%s:table/%s"
                                        .formatted(stack.getRegion(), stack.getAccount(), tableName)))
                                .build())))
                .build();

        return resource.getResponseField("Table.LatestStreamArn");
    }

    private CfnTable buildGlueTable(
            TableChangeDeliveryProps props,
            String prefix,
            String kind,
            String glueTableName,
            String curatedPrefix) {
        var location = "s3://%s/%s".formatted(props.lakeBucket().getBucketName(), curatedPrefix);

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

        var table = CfnTable.Builder.create(this, prefix + "-" + kind + "-GlueTable")
                .catalogId(Stack.of(this).getAccount())
                .databaseName(props.glueDatabaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(glueTableName)
                        .description("DynamoDB change records for the " + kind + " table")
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
                                .columns(buildColumns(kind))
                                .build())
                        .build())
                .build();
        return table;
    }

    /**
     * Columns match {@code dynamoStreamToFirehose.js}'s per-table projector output exactly, plus
     * the four columns every table shares: change_ts, change_type, source_table, env.
     */
    private static List<CfnTable.ColumnProperty> buildColumns(String kind) {
        var columns = new ArrayList<CfnTable.ColumnProperty>();
        columns.add(column("change_ts", "timestamp"));
        columns.add(column("change_type", "string"));
        columns.add(column("source_table", "string"));
        columns.add(column("env", "string"));

        switch (kind) {
            case "receipts" -> {
                columns.add(column("hashed_sub", "string"));
                columns.add(column("receipt_id", "string"));
                columns.add(column("created_at", "string"));
                columns.add(column("actor", "string"));
                columns.add(column("form_bundle_number", "string"));
                columns.add(column("processing_date", "string"));
                columns.add(column("charge_ref_number", "string"));
            }
            case "bundles" -> {
                columns.add(column("hashed_sub", "string"));
                columns.add(column("bundle_id", "string"));
                columns.add(column("granted_at", "string"));
                columns.add(column("expires_at", "string"));
                columns.add(column("ttl", "bigint"));
            }
            case "subscriptions" -> {
                columns.add(column("hashed_sub", "string"));
                columns.add(column("bundle_id", "string"));
                columns.add(column("subscription_id", "string"));
                columns.add(column("status", "string"));
                columns.add(column("current_period_end", "string"));
                columns.add(column("cancel_at_period_end", "boolean"));
            }
            case "passes" -> {
                columns.add(column("pass_id", "string"));
                columns.add(column("pass_type_id", "string"));
                columns.add(column("bundle_id", "string"));
                columns.add(column("issued_by", "string"));
                columns.add(column("created_at", "string"));
                columns.add(column("updated_at", "string"));
                columns.add(column("use_count", "bigint"));
                columns.add(column("revoked_at", "string"));
            }
            default -> throw new IllegalArgumentException("No Glue columns declared for table kind: " + kind);
        }
        return columns;
    }

    private static CfnTable.ColumnProperty column(String name, String type) {
        return CfnTable.ColumnProperty.builder().name(name).type(type).build();
    }

    private CfnDeliveryStream buildDeliveryStream(
            TableChangeDeliveryProps props,
            String prefix,
            String kind,
            String deliveryStreamName,
            String glueTableName,
            String curatedPrefix,
            CfnTable glueTable) {
        var lakeBucket = props.lakeBucket();

        var streamLogGroup = LogGroup.Builder.create(this, prefix + "-" + kind + "-StreamLogGroup")
                .logGroupName(props.sharedNames().deliveryStreamLogGroupName(deliveryStreamName))
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var firehoseRole = Role.Builder.create(this, prefix + "-" + kind + "-FirehoseRole")
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

        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetTable", "glue:GetTableVersion", "glue:GetTableVersions"))
                .resources(List.of("arn:aws:glue:%s:%s:table/%s/%s"
                        .formatted(
                                Stack.of(this).getRegion(),
                                Stack.of(this).getAccount(),
                                props.glueDatabaseName(),
                                glueTableName)))
                .build());

        var stream = CfnDeliveryStream.Builder.create(this, prefix + "-" + kind + "-Stream")
                .deliveryStreamName(deliveryStreamName)
                .deliveryStreamType("DirectPut")
                .extendedS3DestinationConfiguration(CfnDeliveryStream.ExtendedS3DestinationConfigurationProperty
                        .builder()
                        .bucketArn(lakeBucket.getBucketArn())
                        .roleArn(firehoseRole.getRoleArn())
                        .prefix(curatedPrefix + "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                        .errorOutputPrefix("errors/" + kind
                                + "/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                        .bufferingHints(CfnDeliveryStream.BufferingHintsProperty.builder()
                                .intervalInSeconds(900)
                                .sizeInMBs(128)
                                .build())
                        .compressionFormat("UNCOMPRESSED")
                        .cloudWatchLoggingOptions(CfnDeliveryStream.CloudWatchLoggingOptionsProperty.builder()
                                .enabled(true)
                                .logGroupName(props.sharedNames().deliveryStreamLogGroupName(deliveryStreamName))
                                .logStreamName("S3Delivery")
                                .build())
                        .dataFormatConversionConfiguration(CfnDeliveryStream.DataFormatConversionConfigurationProperty
                                .builder()
                                .enabled(true)
                                .inputFormatConfiguration(CfnDeliveryStream.InputFormatConfigurationProperty.builder()
                                        .deserializer(CfnDeliveryStream.DeserializerProperty.builder()
                                                .openXJsonSerDe(CfnDeliveryStream.OpenXJsonSerDeProperty.builder()
                                                        .convertDotsInJsonKeysToUnderscores(false)
                                                        .caseInsensitive(false)
                                                        .build())
                                                .build())
                                        .build())
                                .outputFormatConfiguration(CfnDeliveryStream.OutputFormatConfigurationProperty.builder()
                                        .serializer(CfnDeliveryStream.SerializerProperty.builder()
                                                .parquetSerDe(CfnDeliveryStream.ParquetSerDeProperty.builder()
                                                        .compression("SNAPPY")
                                                        .build())
                                                .build())
                                        .build())
                                .schemaConfiguration(CfnDeliveryStream.SchemaConfigurationProperty.builder()
                                        .catalogId(Stack.of(this).getAccount())
                                        .databaseName(props.glueDatabaseName())
                                        .tableName(glueTableName)
                                        .roleArn(firehoseRole.getRoleArn())
                                        .versionId("LATEST")
                                        .build())
                                .build())
                        .build())
                .build();
        stream.getNode().addDependency(streamLogGroup);
        stream.getNode().addDependency(firehoseRole);
        // Format conversion resolves the destination schema from Glue at delivery time, so the
        // table has to exist before the stream that converts against it.
        stream.getNode().addDependency(glueTable);

        return stream;
    }

    private static String buildStreamTargetsJson(Map<String, String> deliveryStreamNameByTable) {
        var builder = new StringBuilder("{");
        boolean first = true;
        for (var entry : deliveryStreamNameByTable.entrySet()) {
            if (!first) {
                builder.append(",");
            }
            first = false;
            builder.append('"')
                    .append(escapeJson(entry.getKey()))
                    .append("\":\"")
                    .append(escapeJson(entry.getValue()))
                    .append('"');
        }
        builder.append("}");
        return builder.toString();
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
