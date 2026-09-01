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
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.glue.CfnDatabase;
import software.amazon.awscdk.services.glue.CfnTable;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

/**
 * CloudFront access-log resources shared by every deployment in one environment.
 *
 * <p>Holds the Glue table and lake-bucket policy that let Athena query the Parquet objects
 * CloudWatch Logs delivery (v2) writes at {@code raw/cloudfront/distributionid=<id>/year=
 * .../month=.../day=.../}. Environment-scoped rather than tied to one deployment, because a
 * deployment's app stacks (EdgeStack included, along with its CloudFront distribution) are
 * destroyed and recreated on every release.
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



    public final CfnTable table;

    @Value.Immutable
    public interface CloudFrontAccessLogsProps {

        /** {@code sharedNames.envResourceNamePrefix}, e.g. {@code ci-env}. Used for logical ids. */
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
        // CloudFront delivery sources and deliveries always live in us-east-1, whatever region
        // this stack deploys to, so the bucket policy has to trust that region's ARNs.
        var prefix = props.envResourceNamePrefix();

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
                                "ArnLike", Map.of("aws:SourceArn", "arn:aws:logs:us-east-1:%s:*".formatted(account))))
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
                                "ArnLike", Map.of("aws:SourceArn", "arn:aws:logs:us-east-1:%s:*".formatted(account))))
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
                "storage.location.template",
                location + "distributionid=${distribution_id}/year=${year}/month=${month}/day=${day}/");

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

        infof("CloudFrontAccessLogs created for %s: table %s", prefix, TABLE_NAME);
    }

    // The delivery writes every field as a Parquet string, whatever the log reference says
    // about numbers, and Athena refuses a file whose physical type disagrees with the table.
    // Views cast the few fields they do arithmetic on.
    private static List<CfnTable.ColumnProperty> buildColumns() {
        var columns = new ArrayList<CfnTable.ColumnProperty>();
        for (String name : FIELD_ORDER) {
            columns.add(CfnTable.ColumnProperty.builder().name(name).type("string").build());
        }
        return columns;
    }
}
