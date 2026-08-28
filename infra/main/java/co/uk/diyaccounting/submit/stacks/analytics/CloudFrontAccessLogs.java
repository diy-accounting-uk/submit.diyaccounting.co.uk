/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnDatabase;
import software.amazon.awscdk.services.glue.CfnTable;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.ObjectOwnership;
import software.constructs.Construct;

/**
 * CloudFront access-log resources shared by every deployment in one environment.
 *
 * <p>Two independent things land here, both environment-scoped rather than tied to one
 * deployment, because a deployment's app stacks (EdgeStack included, along with its CloudFront
 * distribution) are destroyed and recreated on every release:
 *
 * <ol>
 *   <li>The classic ACL-based standard-logging bucket. Every deployment's {@code EdgeStack}
 *       imports it by name (see {@link #bucketName}) and writes flat log files into its own
 *       {@code cf-standard-logs/<deployment>/} prefix, so history survives a redeploy instead of
 *       being destroyed with the bucket that used to live inside {@code EdgeStack}.
 *   <li>The Glue table and lake-bucket policy that let Athena query the Parquet objects
 *       CloudWatch Logs delivery (v2) writes at {@code raw/cloudfront/<distribution-id>/year=
 *       .../month=.../day=.../}.
 * </ol>
 *
 * <p>The delivery source/destination/delivery resources that subscribe one specific distribution
 * to that v2 delivery are deliberately NOT created here. This construct is instantiated from
 * {@code AnalyticsStack}, which is environment-scoped and synthesised without knowledge of any
 * deployment's distribution ID. Each deployment's {@code EdgeStack} creates its own delivery,
 * pointed at the lake bucket this construct authorises to receive it; the Glue table's injected
 * {@code distribution_id} partition is what lets every deployment's logs land in one catalog.
 */
public class CloudFrontAccessLogs {

    private static final String RAW_PREFIX = "raw/cloudfront/";
    private static final String TABLE_NAME = "cloudfront_requests";

    // Standard CloudFront access-log (v2) field set. c_ip is personal data under UK GDPR; the
    // table description below says so and no view built on this table may select it.
    private static final List<String> FIELD_ORDER = List.of(
            "date",
            "time",
            "x_edge_location",
            "sc_bytes",
            "c_ip",
            "cs_method",
            "cs_host",
            "cs_uri_stem",
            "sc_status",
            "cs_referer",
            "cs_user_agent",
            "cs_uri_query",
            "cs_cookie",
            "x_edge_result_type",
            "x_edge_request_id",
            "x_host_header",
            "cs_protocol",
            "cs_bytes",
            "time_taken",
            "x_forwarded_for",
            "ssl_protocol",
            "ssl_cipher",
            "x_edge_response_result_type",
            "cs_protocol_version",
            "fle_status",
            "fle_encrypted_fields",
            "c_port",
            "time_to_first_byte",
            "x_edge_detailed_result_type",
            "sc_content_type",
            "sc_content_len",
            "sc_range_start",
            "sc_range_end");

    private static final Set<String> BIGINT_FIELDS =
            Set.of("sc_bytes", "cs_bytes", "sc_status", "c_port", "sc_content_len", "sc_range_start", "sc_range_end");

    private static final Set<String> DOUBLE_FIELDS = Set.of("time_taken", "time_to_first_byte");

    public final Bucket logBucket;
    public final CfnTable table;

    @Value.Immutable
    public interface CloudFrontAccessLogsProps {

        /** {@code sharedNames.envResourceNamePrefix}, e.g. {@code ci-env}. Used for logical ids and the
         * classic log bucket's physical name; callers outside this environment scope (an EdgeStack
         * importing the bucket by name) must derive the same value from their own sharedNames rather
         * than any deployment-scoped prefix. */
        String envResourceNamePrefix();

        /** The lake bucket's literal physical name, e.g. {@code sharedNames.analyticsLakeBucketName}. */
        String lakeBucketName();

        /** The real lake bucket construct, so a resource-policy statement can be attached to it. */
        Bucket lakeBucket();

        String glueDatabaseName();

        /** The lake's Glue database, for dependency wiring only. */
        CfnDatabase glueDatabase();

        static ImmutableCloudFrontAccessLogsProps.Builder builder() {
            return ImmutableCloudFrontAccessLogsProps.builder();
        }
    }

    public CloudFrontAccessLogs(final Construct scope, final CloudFrontAccessLogsProps props) {
        var account = Stack.of(scope).getAccount();
        var region = Stack.of(scope).getRegion();
        var prefix = props.envResourceNamePrefix();

        // ============================================================================
        // Classic standard-logging bucket, migrated from EdgeStack
        // ============================================================================
        // Env-scoped so log history outlives a deployment's app stacks. ObjectOwnership.OBJECT_WRITER
        // keeps ACLs enabled: CloudFront's classic standard logging writes objects via an ACL grant
        // to the AWS log-delivery account, which needs ACLs on.
        this.logBucket = Bucket.Builder.create(scope, prefix + "-CfLogsBucket")
                .bucketName(bucketName(prefix, account))
                .encryption(BucketEncryption.S3_MANAGED)
                .objectOwnership(ObjectOwnership.OBJECT_WRITER)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(
                        LifecycleRule.builder().expiration(Duration.days(90)).build()))
                .build();

        // ============================================================================
        // Lake bucket policy: authorise CloudWatch Logs delivery (v2) to write under raw/cloudfront/
        // ============================================================================
        // Every deployment's EdgeStack creates its own delivery source/destination pointed at the
        // lake bucket; the delivery service needs this resource policy on the target bucket before
        // any of those deliveries can write to it. Scoped to the raw/cloudfront/ prefix, not the
        // whole bucket, and to this account's CloudWatch Logs delivery sources.
        props.lakeBucket()
                .addToResourcePolicy(PolicyStatement.Builder.create()
                        .sid("AllowCloudFrontAccessLogDeliveryWrite")
                        .effect(Effect.ALLOW)
                        .principals(List.of(new ServicePrincipal("delivery.logs.amazonaws.com")))
                        .actions(List.of("s3:PutObject"))
                        .resources(List.of(props.lakeBucket().getBucketArn() + "/" + RAW_PREFIX + "*"))
                        .conditions(Map.of(
                                "StringEquals",
                                        Map.of(
                                                "aws:SourceAccount",
                                                account,
                                                "s3:x-amz-acl",
                                                "bucket-owner-full-control"),
                                "ArnLike", Map.of("aws:SourceArn", "arn:aws:logs:%s:%s:*".formatted(region, account))))
                        .build());
        props.lakeBucket()
                .addToResourcePolicy(PolicyStatement.Builder.create()
                        .sid("AllowCloudFrontAccessLogDeliveryAclCheck")
                        .effect(Effect.ALLOW)
                        .principals(List.of(new ServicePrincipal("delivery.logs.amazonaws.com")))
                        .actions(List.of("s3:GetBucketAcl"))
                        .resources(List.of(props.lakeBucket().getBucketArn()))
                        .conditions(Map.of(
                                "StringEquals", Map.of("aws:SourceAccount", account),
                                "ArnLike", Map.of("aws:SourceArn", "arn:aws:logs:%s:%s:*".formatted(region, account))))
                        .build());

        // ============================================================================
        // Glue catalog: cloudfront_requests over raw/cloudfront/, partition projection
        // ============================================================================
        // No crawler: projection computes year/month/day partitions, and distribution_id is
        // "injected" so a query names the distribution it wants rather than the table listing
        // every distribution that has ever written to it.
        var location = "s3://%s/%s".formatted(props.lakeBucketName(), RAW_PREFIX);

        var tableParameters = new LinkedHashMap<String, String>();
        tableParameters.put("classification", "parquet");
        tableParameters.put("has_encrypted_data", "false");
        tableParameters.put("projection.enabled", "true");
        tableParameters.put("projection.distribution_id.type", "injected");
        tableParameters.put("projection.year.type", "integer");
        tableParameters.put("projection.year.range", "2026,2035");
        tableParameters.put("projection.month.type", "integer");
        tableParameters.put("projection.month.range", "1,12");
        tableParameters.put("projection.month.digits", "2");
        tableParameters.put("projection.day.type", "integer");
        tableParameters.put("projection.day.range", "1,31");
        tableParameters.put("projection.day.digits", "2");
        tableParameters.put(
                "storage.location.template", location + "${distribution_id}/year=${year}/month=${month}/day=${day}/");

        this.table = CfnTable.Builder.create(scope, prefix + "-CloudFrontRequestsTable")
                .catalogId(account)
                .databaseName(props.glueDatabaseName())
                .tableInput(CfnTable.TableInputProperty.builder()
                        .name(TABLE_NAME)
                        .description("CloudFront standard access logs delivered as Parquet (CloudWatch Logs "
                                + "delivery v2). Operational data only: c_ip is personal data under UK GDPR "
                                + "and must be excluded from every view built on this table.")
                        .tableType("EXTERNAL_TABLE")
                        .parameters(tableParameters)
                        .partitionKeys(List.of(
                                CfnTable.ColumnProperty.builder()
                                        .name("distribution_id")
                                        .type("string")
                                        .build(),
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
        this.table.addResourceDependency(props.glueDatabase());

        infof(
                "CloudFrontAccessLogs created for %s: log bucket %s, table %s",
                prefix, this.logBucket.getBucketName(), TABLE_NAME);
    }

    /**
     * The env-scoped classic standard-logging bucket name. Every deployment's {@code EdgeStack}
     * imports it by this name via {@code Bucket.fromBucketName}; pass the environment's
     * {@code sharedNames.envResourceNamePrefix}, never a deployment-scoped prefix.
     */
    public static String bucketName(String envResourceNamePrefix, String account) {
        return "%s-cloudfront-logs-%s".formatted(envResourceNamePrefix, account);
    }

    private static List<CfnTable.ColumnProperty> buildColumns() {
        var columns = new ArrayList<CfnTable.ColumnProperty>();
        for (String name : FIELD_ORDER) {
            String type = BIGINT_FIELDS.contains(name) ? "bigint" : DOUBLE_FIELDS.contains(name) ? "double" : "string";
            columns.add(CfnTable.ColumnProperty.builder().name(name).type(type).build());
        }
        return columns;
    }
}
