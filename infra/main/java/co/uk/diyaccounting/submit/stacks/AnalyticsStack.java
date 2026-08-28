/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.getContextValueString;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.stacks.analytics.CloudFrontAccessLogs;
import co.uk.diyaccounting.submit.stacks.analytics.DataQuality;
import co.uk.diyaccounting.submit.stacks.analytics.StripeReconciliationTables;
import co.uk.diyaccounting.submit.stacks.analytics.TableChangeDelivery;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsCustomResourcePolicy;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.athena.CfnNamedQuery;
import software.amazon.awscdk.services.athena.CfnWorkGroup;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.IEventBus;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.FirehoseDeliveryStream;
import software.amazon.awscdk.services.glue.CfnDatabase;
import software.amazon.awscdk.services.glue.CfnTable;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.kinesisfirehose.CfnDeliveryStream;
import software.amazon.awscdk.services.kinesisfirehose.DeliveryStream;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.StorageClass;
import software.amazon.awscdk.services.s3.Transition;
import software.constructs.Construct;

/**
 * Environment-scoped analytics lake: the activity-event delivery stream, the S3 buckets behind
 * it, the Glue catalog over the delivered objects and the Athena workgroup that queries them.
 *
 * <p>These resources are env-scoped rather than app-scoped because the data has to outlive any
 * one deployment. A per-deployment lake would fragment history at every release.
 */
public class AnalyticsStack extends Stack {

    private static final String ACTIVITY_EVENTS_RAW_PREFIX = "raw/activity-events/";
    private static final String ACTIVITY_EVENTS_TABLE_NAME = "activity_events_raw";
    private static final String ACTIVITY_EVENTS_CURATED_PREFIX = "curated/activity-events/";
    private static final String ACTIVITY_EVENTS_CURATED_TABLE_NAME = "activity_events";
    private static final String ACTIVITY_EVENTS_UNION_VIEW_NAME = "activity_events_all";

    public final Bucket lakeBucket;
    public final Bucket resultsBucket;
    public final CfnDeliveryStream activityEventsStream;
    public final CfnDatabase glueDatabase;
    public final CfnWorkGroup workGroup;

    @Value.Immutable
    public interface AnalyticsStackProps extends StackProps, SubmitStackProps {

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

        static ImmutableAnalyticsStackProps.Builder builder() {
            return ImmutableAnalyticsStackProps.builder();
        }
    }

    public AnalyticsStack(final Construct scope, final String id, final AnalyticsStackProps props) {
        super(scope, id, props);

        var sharedNames = props.sharedNames();
        var prefix = props.resourceNamePrefix();
        var isProd = "prod".equals(props.envName());

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("CostCenter", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "AnalyticsStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");
        Tags.of(this).add("DataClassification", "internal");
        Tags.of(this).add("BackupRequired", "false");

        // ============================================================================
        // Buckets
        // ============================================================================
        // The lake holds derived data only. Activity events stay on the EventBridge bus,
        // receipts and bundles stay in DynamoDB with PITR, so nothing here is a system of
        // record and everything can be destroyed with the stack.
        this.lakeBucket = Bucket.Builder.create(this, prefix + "-AnalyticsLake")
                .bucketName(sharedNames.analyticsLakeBucketName)
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(buildLakeLifecycleRules(isProd))
                .build();

        this.resultsBucket = Bucket.Builder.create(this, prefix + "-AnalyticsResults")
                .bucketName(sharedNames.analyticsResultsBucketName)
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .id("expire-query-results")
                        .expiration(Duration.days(14))
                        .build()))
                .build();

        // ============================================================================
        // Firehose transform Lambda
        // ============================================================================
        var transformLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(sharedNames.activityEventTransformLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(sharedNames.ecrRepositoryName)
                        .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                        .ingestFunctionName(sharedNames.activityEventTransformLambdaFunctionName)
                        .ingestHandler(sharedNames.activityEventTransformLambdaHandler)
                        .ingestLambdaArn(sharedNames.activityEventTransformLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                sharedNames.activityEventTransformProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(60))
                        .provisionedConcurrencyAliasName(sharedNames.provisionedConcurrencyAliasName)
                        .environment(new PopulatedMap<String, String>().with("ENVIRONMENT_NAME", props.envName()))
                        .build());

        // ============================================================================
        // Activity event delivery stream
        // ============================================================================
        // Created explicitly so the Firehose role's logs grant can name one log group rather
        // than the whole account.
        var streamLogGroup = LogGroup.Builder.create(this, prefix + "-ActivityEventsStreamLogGroup")
                .logGroupName(sharedNames.activityEventsDeliveryStreamLogGroupName)
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var firehoseRole = Role.Builder.create(this, prefix + "-ActivityEventsFirehoseRole")
                .roleName(sharedNames.activityEventsDeliveryStreamName + "-firehose-role")
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
                .resources(List.of(this.lakeBucket.getBucketArn(), this.lakeBucket.getBucketArn() + "/*"))
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
                .resources(List.of(transformLambda.ingestLambdaAliasArn))
                .build());

        // Format conversion resolves the destination schema from Glue at delivery time, so the
        // role needs read access to the one table it converts against.
        firehoseRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("glue:GetTable", "glue:GetTableVersion", "glue:GetTableVersions"))
                .resources(List.of(glueTableArn(sharedNames.glueDatabaseName, ACTIVITY_EVENTS_CURATED_TABLE_NAME)))
                .build());

        // Buffering at 900s and 128 MiB: Parquet's per-file overhead makes many small files
        // actively bad, and fifteen-minute latency is irrelevant to a daily dashboard. The spike's
        // JSON stays in place at raw/activity-events/ and stays queryable; this stream now writes
        // only the curated Parquet copy going forward.
        this.activityEventsStream = CfnDeliveryStream.Builder.create(this, prefix + "-ActivityEventsStream")
                .deliveryStreamName(sharedNames.activityEventsDeliveryStreamName)
                .deliveryStreamType("DirectPut")
                .extendedS3DestinationConfiguration(
                        CfnDeliveryStream.ExtendedS3DestinationConfigurationProperty.builder()
                                .bucketArn(this.lakeBucket.getBucketArn())
                                .roleArn(firehoseRole.getRoleArn())
                                .prefix(ACTIVITY_EVENTS_CURATED_PREFIX
                                        + "year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                                .errorOutputPrefix(
                                        "errors/activity-events/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/")
                                .bufferingHints(CfnDeliveryStream.BufferingHintsProperty.builder()
                                        .intervalInSeconds(900)
                                        .sizeInMBs(128)
                                        .build())
                                // Parquet carries its own Snappy compression. Gzipping on top would produce
                                // gzipped Parquet that Athena can read but cannot predicate-push-down into.
                                .compressionFormat("UNCOMPRESSED")
                                .cloudWatchLoggingOptions(CfnDeliveryStream.CloudWatchLoggingOptionsProperty.builder()
                                        .enabled(true)
                                        .logGroupName(sharedNames.activityEventsDeliveryStreamLogGroupName)
                                        .logStreamName("S3Delivery")
                                        .build())
                                .processingConfiguration(CfnDeliveryStream.ProcessingConfigurationProperty.builder()
                                        .enabled(true)
                                        .processors(List.of(CfnDeliveryStream.ProcessorProperty.builder()
                                                .type("Lambda")
                                                .parameters(
                                                        List.of(CfnDeliveryStream.ProcessorParameterProperty.builder()
                                                                .parameterName("LambdaArn")
                                                                .parameterValue(transformLambda.ingestLambdaAliasArn)
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
                                                                .catalogId(this.getAccount())
                                                                .databaseName(sharedNames.glueDatabaseName)
                                                                .tableName(ACTIVITY_EVENTS_CURATED_TABLE_NAME)
                                                                .roleArn(firehoseRole.getRoleArn())
                                                                .versionId("LATEST")
                                                                .build())
                                                .build())
                                .build())
                .build();
        this.activityEventsStream.getNode().addDependency(streamLogGroup);
        this.activityEventsStream.getNode().addDependency(firehoseRole);

        // ============================================================================
        // EventBridge rule: activity bus to the lake
        // ============================================================================
        IEventBus activityBus = software.amazon.awscdk.services.events.EventBus.fromEventBusName(
                this, "ActivityBus", sharedNames.activityBusName);

        var importedStream = DeliveryStream.fromDeliveryStreamArn(
                this, "ActivityEventsStreamRef", this.activityEventsStream.getAttrArn());

        var activityToLakeRule = Rule.Builder.create(this, "ActivityToLakeRule")
                .ruleName(prefix + "-activity-to-lake")
                .description("Deliver every ActivityEvent to the analytics lake")
                .eventBus(activityBus)
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("ActivityEvent"))
                        .build())
                .targets(List.of(new FirehoseDeliveryStream(importedStream)))
                .build();
        // The imported reference hides the delivery stream from CDK's dependency graph.
        activityToLakeRule.getNode().addDependency(this.activityEventsStream);

        // ============================================================================
        // Glue catalog
        // ============================================================================
        this.glueDatabase = CfnDatabase.Builder.create(this, prefix + "-GlueDatabase")
                .catalogId(this.getAccount())
                .databaseInput(CfnDatabase.DatabaseInputProperty.builder()
                        .name(sharedNames.glueDatabaseName)
                        .description("Usage analytics for " + props.envName())
                        .build())
                .build();

        new CloudFrontAccessLogs(
                this,
                CloudFrontAccessLogs.CloudFrontAccessLogsProps.builder()
                        .envResourceNamePrefix(prefix)
                        .lakeBucketName(sharedNames.analyticsLakeBucketName)
                        .lakeBucket(this.lakeBucket)
                        .glueDatabaseName(sharedNames.glueDatabaseName)
                        .glueDatabase(this.glueDatabase)
                        .build());

        new TableChangeDelivery(
                this,
                prefix + "-TableChangeDelivery",
                TableChangeDelivery.TableChangeDeliveryProps.builder()
                        .lakeBucket(this.lakeBucket)
                        .glueDatabaseName(sharedNames.glueDatabaseName)
                        .glueDatabaseDependency(Optional.of(this.glueDatabase))
                        .sharedNames(sharedNames)
                        .envName(props.envName())
                        .resourceNamePrefix(prefix)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                        .ecrRepositoryName(sharedNames.ecrRepositoryName)
                        .build());

        var stripeTables = new StripeReconciliationTables(
                this,
                StripeReconciliationTables.StripeReconciliationTablesProps.builder()
                        .idPrefix(prefix)
                        .databaseName(sharedNames.glueDatabaseName)
                        .lakeBucketName(sharedNames.analyticsLakeBucketName)
                        .build());
        stripeTables.balanceTransactionsTable.addResourceDependency(this.glueDatabase);
        stripeTables.chargesTable.addResourceDependency(this.glueDatabase);
        stripeTables.subscriptionsTable.addResourceDependency(this.glueDatabase);

        var rawLocation = "s3://%s/%s".formatted(sharedNames.analyticsLakeBucketName, ACTIVITY_EVENTS_RAW_PREFIX);

        // Partition projection replaces a crawler: no MSCK REPAIR, no partition-registration
        // job and no crawler on the bill.
        var tableParameters = new java.util.LinkedHashMap<String, String>();
        tableParameters.put("classification", "json");
        tableParameters.put("compressionType", "gzip");
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
        tableParameters.put("storage.location.template", rawLocation + "year=${year}/month=${month}/day=${day}/");

        var activityEventsTable = CfnTable.Builder.create(this, prefix + "-ActivityEventsTable")
                .catalogId(this.getAccount())
                .databaseName(sharedNames.glueDatabaseName)
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(ACTIVITY_EVENTS_TABLE_NAME)
                        .description("Activity events as delivered by Firehose, one JSON object per line")
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
                                .location(rawLocation)
                                .inputFormat("org.apache.hadoop.mapred.TextInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat")
                                .compressed(true)
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary("org.openx.data.jsonserde.JsonSerDe")
                                        .parameters(Map.of("ignore.malformed.json", "true"))
                                        .build())
                                .columns(buildActivityEventColumns())
                                .build())
                        .build())
                .build();
        activityEventsTable.addResourceDependency(this.glueDatabase);

        var curatedLocation =
                "s3://%s/%s".formatted(sharedNames.analyticsLakeBucketName, ACTIVITY_EVENTS_CURATED_PREFIX);

        var curatedTableParameters = new LinkedHashMap<String, String>();
        curatedTableParameters.put("classification", "parquet");
        curatedTableParameters.put("has_encrypted_data", "false");
        curatedTableParameters.put("projection.enabled", "true");
        curatedTableParameters.put("projection.year.type", "integer");
        curatedTableParameters.put("projection.year.range", "2026,2035");
        curatedTableParameters.put("projection.month.type", "integer");
        curatedTableParameters.put("projection.month.range", "1,12");
        curatedTableParameters.put("projection.month.digits", "2");
        curatedTableParameters.put("projection.day.type", "integer");
        curatedTableParameters.put("projection.day.range", "1,31");
        curatedTableParameters.put("projection.day.digits", "2");
        curatedTableParameters.put(
                "storage.location.template", curatedLocation + "year=${year}/month=${month}/day=${day}/");

        var curatedActivityEventsTable = CfnTable.Builder.create(this, prefix + "-ActivityEventsCuratedTable")
                .catalogId(this.getAccount())
                .databaseName(sharedNames.glueDatabaseName)
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(ACTIVITY_EVENTS_CURATED_TABLE_NAME)
                        .description("Activity events converted to Parquet by Firehose, typed columns")
                        .tableType("EXTERNAL_TABLE")
                        .parameters(curatedTableParameters)
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
                                .location(curatedLocation)
                                .inputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat")
                                .outputFormat("org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat")
                                .serdeInfo(CfnTable.SerdeInfoProperty.builder()
                                        .serializationLibrary(
                                                "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe")
                                        .build())
                                .columns(buildCuratedActivityEventColumns())
                                .build())
                        .build())
                .build();
        curatedActivityEventsTable.addResourceDependency(this.glueDatabase);
        // The delivery stream's schema configuration names this table by string, which hides the
        // dependency from CDK's graph. Format conversion needs the table to exist first.
        this.activityEventsStream.getNode().addDependency(curatedActivityEventsTable);

        new DataQuality(
                this,
                prefix + "-DataQuality",
                DataQuality.DataQualityProps.builder()
                        .envName(props.envName())
                        .resourceNamePrefix(prefix)
                        .glueDatabaseName(sharedNames.glueDatabaseName)
                        .glueDatabaseDependency(Optional.of(this.glueDatabase))
                        .targetTableDependency(Optional.of(curatedActivityEventsTable))
                        .lakeBucket(this.lakeBucket)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                        .ecrRepositoryName(sharedNames.ecrRepositoryName)
                        .build());

        // ============================================================================
        // Athena workgroup and saved query
        // ============================================================================
        // recursiveDeleteOption matters for teardown: deleting a workgroup that still holds
        // named queries fails without it.
        this.workGroup = CfnWorkGroup.Builder.create(this, prefix + "-AnalyticsWorkGroup")
                .name(sharedNames.athenaWorkGroupName)
                .description("Usage analytics queries for " + props.envName())
                .state("ENABLED")
                .recursiveDeleteOption(true)
                .workGroupConfiguration(CfnWorkGroup.WorkGroupConfigurationProperty.builder()
                        .enforceWorkGroupConfiguration(true)
                        .publishCloudWatchMetricsEnabled(true)
                        .bytesScannedCutoffPerQuery(isProd ? 10_000_000_000L : 1_000_000_000L)
                        .resultConfiguration(CfnWorkGroup.ResultConfigurationProperty.builder()
                                .outputLocation("s3://%s/athena/".formatted(sharedNames.analyticsResultsBucketName))
                                .encryptionConfiguration(CfnWorkGroup.EncryptionConfigurationProperty.builder()
                                        .encryptionOption("SSE_S3")
                                        .build())
                                .build())
                        .engineVersion(CfnWorkGroup.EngineVersionProperty.builder()
                                .selectedEngineVersion("Athena engine version 3")
                                .build())
                        .build())
                .build();
        this.workGroup.getNode().addDependency(this.resultsBucket);

        var eventsPerDayQuery = CfnNamedQuery.Builder.create(this, prefix + "-ActivityEventsPerDayQuery")
                .name("activity-events-per-day")
                .description("Activity event counts per day, event name and actor")
                .database(sharedNames.glueDatabaseName)
                .workGroup(sharedNames.athenaWorkGroupName)
                .queryString(
                        """
                        SELECT date(from_iso8601_timestamp(event_ts)) AS day,
                               event,
                               actor,
                               count(*) AS events
                        FROM   %s.%s
                        WHERE  year >= 2026
                        GROUP  BY 1, 2, 3
                        ORDER  BY 1 DESC, 4 DESC
                        """
                                .formatted(sharedNames.glueDatabaseName, ACTIVITY_EVENTS_TABLE_NAME))
                .build();
        eventsPerDayQuery.addResourceDependency(this.workGroup);
        eventsPerDayQuery.addResourceDependency(this.glueDatabase);

        // ============================================================================
        // Union view: activity_events_all reads both eras so WP-6 queries never change
        // ============================================================================
        // Presto views are Glue tables of type VIRTUAL_VIEW with a fiddly base64 payload to
        // hand-build. A one-shot AwsCustomResource running the CREATE OR REPLACE VIEW statement
        // keeps the SQL readable in the repo and is idempotent on every redeploy.
        var defaultCutoverDate = LocalDate.now(ZoneOffset.UTC).format(DateTimeFormatter.BASIC_ISO_DATE);
        var cutoverDate = getContextValueString(this, "analyticsParquetCutoverDate", defaultCutoverDate);
        var unionViewSql =
                loadResourceText("analytics/views/activity_events_all.sql").replace("__CUTOVER_DATE__", cutoverDate);

        var unionViewDefinitionQuery = CfnNamedQuery.Builder.create(this, prefix + "-ActivityEventsAllViewQuery")
                .name("activity-events-all-view-definition")
                .description("Definition of the " + ACTIVITY_EVENTS_UNION_VIEW_NAME
                        + " view, kept here for reference; the custom resource below is what actually runs it")
                .database(sharedNames.glueDatabaseName)
                .workGroup(sharedNames.athenaWorkGroupName)
                .queryString(unionViewSql)
                .build();
        unionViewDefinitionQuery.addResourceDependency(this.workGroup);
        unionViewDefinitionQuery.addResourceDependency(activityEventsTable);
        unionViewDefinitionQuery.addResourceDependency(curatedActivityEventsTable);

        var createUnionViewCall = AwsSdkCall.builder()
                .service("Athena")
                .action("startQueryExecution")
                .parameters(Map.of(
                        "QueryString",
                        unionViewSql,
                        "QueryExecutionContext",
                        Map.of("Database", sharedNames.glueDatabaseName),
                        "WorkGroup",
                        sharedNames.athenaWorkGroupName))
                .physicalResourceId(PhysicalResourceId.of(ACTIVITY_EVENTS_UNION_VIEW_NAME + "-view"))
                .build();

        var createUnionViewResource = AwsCustomResource.Builder.create(this, prefix + "-CreateActivityEventsAllView")
                .onCreate(createUnionViewCall)
                .onUpdate(createUnionViewCall)
                .policy(AwsCustomResourcePolicy.fromStatements(List.of(
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("athena:StartQueryExecution"))
                                .resources(List.of(athenaWorkGroupArn(sharedNames.athenaWorkGroupName)))
                                .build(),
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of(
                                        "glue:GetDatabase",
                                        "glue:GetTable",
                                        "glue:GetTables",
                                        "glue:CreateTable",
                                        "glue:UpdateTable"))
                                .resources(List.of(
                                        glueCatalogArn(),
                                        glueDatabaseArn(sharedNames.glueDatabaseName),
                                        glueTableArn(sharedNames.glueDatabaseName, ACTIVITY_EVENTS_TABLE_NAME),
                                        glueTableArn(sharedNames.glueDatabaseName, ACTIVITY_EVENTS_CURATED_TABLE_NAME),
                                        glueTableArn(sharedNames.glueDatabaseName, ACTIVITY_EVENTS_UNION_VIEW_NAME)))
                                .build(),
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("s3:PutObject", "s3:GetBucketLocation"))
                                .resources(List.of(
                                        this.resultsBucket.getBucketArn(), this.resultsBucket.getBucketArn() + "/*"))
                                .build())))
                .build();
        createUnionViewResource.getNode().addDependency(this.workGroup);
        createUnionViewResource.getNode().addDependency(activityEventsTable);
        createUnionViewResource.getNode().addDependency(curatedActivityEventsTable);

        // ============================================================================
        // Alarms
        // ============================================================================
        // No SnsAction: the alarm-state-change rule in OpsStack routes every alarm in the
        // account to Telegram, which keeps the app-scoped alert topic out of an env stack.
        Alarm.Builder.create(this, prefix + "-FirehoseDeliveryFailedAlarm")
                .alarmName(prefix + "-firehose-delivery-failed")
                .alarmDescription("Activity events have not reached S3 for over an hour")
                .metric(Metric.Builder.create()
                        .namespace("AWS/Firehose")
                        .metricName("DeliveryToS3.DataFreshness")
                        .dimensionsMap(Map.of("DeliveryStreamName", sharedNames.activityEventsDeliveryStreamName))
                        .statistic("Maximum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(3600)
                .evaluationPeriods(2)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        Alarm.Builder.create(this, prefix + "-FirehosePutFailedAlarm")
                .alarmName(prefix + "-firehose-put-failed")
                .alarmDescription("Activity event records are being throttled by Firehose")
                .metric(Metric.Builder.create()
                        .namespace("AWS/Firehose")
                        .metricName("ThrottledRecords")
                        .dimensionsMap(Map.of("DeliveryStreamName", sharedNames.activityEventsDeliveryStreamName))
                        .statistic("Sum")
                        .period(Duration.minutes(15))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // Outputs
        // ============================================================================
        cfnOutput(this, "AnalyticsLakeBucketName", this.lakeBucket.getBucketName());
        cfnOutput(this, "AnalyticsResultsBucketName", this.resultsBucket.getBucketName());
        cfnOutput(this, "ActivityEventsDeliveryStreamName", sharedNames.activityEventsDeliveryStreamName);
        cfnOutput(this, "GlueDatabaseName", sharedNames.glueDatabaseName);
        cfnOutput(this, "AthenaWorkGroupName", sharedNames.athenaWorkGroupName);

        infof("AnalyticsStack %s created successfully for %s", this.getNode().getId(), prefix);
    }

    private static List<LifecycleRule> buildLakeLifecycleRules(boolean isProd) {
        var rules = new ArrayList<LifecycleRule>();

        rules.add(LifecycleRule.builder()
                .id("expire-raw-activity-events")
                .prefix(ACTIVITY_EVENTS_RAW_PREFIX)
                .expiration(Duration.days(isProd ? 90 : 14))
                .build());

        rules.add(LifecycleRule.builder()
                .id("expire-errors")
                .prefix("errors/")
                .expiration(Duration.days(isProd ? 30 : 14))
                .build());

        if (isProd) {
            rules.add(LifecycleRule.builder()
                    .id("age-curated")
                    .prefix("curated/")
                    .transitions(List.of(Transition.builder()
                            .storageClass(StorageClass.INFREQUENT_ACCESS)
                            .transitionAfter(Duration.days(30))
                            .build()))
                    .expiration(Duration.days(800))
                    .build());
            rules.add(LifecycleRule.builder()
                    .id("age-raw-cloudfront")
                    .prefix("raw/cloudfront/")
                    .transitions(List.of(Transition.builder()
                            .storageClass(StorageClass.INFREQUENT_ACCESS)
                            .transitionAfter(Duration.days(30))
                            .build()))
                    .expiration(Duration.days(400))
                    .build());
        } else {
            rules.add(LifecycleRule.builder()
                    .id("expire-curated")
                    .prefix("curated/")
                    .expiration(Duration.days(30))
                    .build());
            rules.add(LifecycleRule.builder()
                    .id("expire-raw-cloudfront")
                    .prefix("raw/cloudfront/")
                    .expiration(Duration.days(30))
                    .build());
        }

        return rules;
    }

    private static List<CfnTable.ColumnProperty> buildActivityEventColumns() {
        return List.of(
                        "event_id",
                        "event_ts",
                        "ingest_ts",
                        "event",
                        "site",
                        "summary",
                        "actor",
                        "flow",
                        "outcome",
                        "failure",
                        "request_id",
                        "hashed_sub",
                        "bundle_id",
                        "pass_type_id",
                        "subscription_id",
                        "visitor_type",
                        "country",
                        "page",
                        "hmrc_status",
                        "env",
                        "detail_json")
                .stream()
                .map(name -> CfnTable.ColumnProperty.builder()
                        .name(name)
                        .type("string")
                        .build())
                .toList();
    }

    /**
     * Same columns as {@link #buildActivityEventColumns()}, typed for Parquet: event_ts and
     * ingest_ts become timestamp columns, everything else stays string.
     */
    private static List<CfnTable.ColumnProperty> buildCuratedActivityEventColumns() {
        var columns = new ArrayList<CfnTable.ColumnProperty>();
        columns.add(CfnTable.ColumnProperty.builder()
                .name("event_id")
                .type("string")
                .build());
        columns.add(CfnTable.ColumnProperty.builder()
                .name("event_ts")
                .type("timestamp")
                .build());
        columns.add(CfnTable.ColumnProperty.builder()
                .name("ingest_ts")
                .type("timestamp")
                .build());
        List.of(
                        "event",
                        "site",
                        "summary",
                        "actor",
                        "flow",
                        "outcome",
                        "failure",
                        "request_id",
                        "hashed_sub",
                        "bundle_id",
                        "pass_type_id",
                        "subscription_id",
                        "visitor_type",
                        "country",
                        "page",
                        "hmrc_status",
                        "env",
                        "detail_json")
                .forEach(name -> columns.add(CfnTable.ColumnProperty.builder()
                        .name(name)
                        .type("string")
                        .build()));
        return columns;
    }

    private String glueTableArn(String databaseName, String tableName) {
        return "arn:aws:glue:%s:%s:table/%s/%s".formatted(this.getRegion(), this.getAccount(), databaseName, tableName);
    }

    private String glueDatabaseArn(String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(this.getRegion(), this.getAccount(), databaseName);
    }

    private String glueCatalogArn() {
        return "arn:aws:glue:%s:%s:catalog".formatted(this.getRegion(), this.getAccount());
    }

    private String athenaWorkGroupArn(String workGroupName) {
        return "arn:aws:athena:%s:%s:workgroup/%s".formatted(this.getRegion(), this.getAccount(), workGroupName);
    }

    private static String loadResourceText(String resourcePath) {
        try (InputStream in = AnalyticsStack.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException("Missing analytics resource: " + resourcePath);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load analytics resource: " + resourcePath, e);
        }
    }
}
