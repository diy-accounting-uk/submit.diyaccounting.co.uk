/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.TimeZone;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.scheduler.CronOptionsWithTimezone;
import software.amazon.awscdk.services.scheduler.Schedule;
import software.amazon.awscdk.services.scheduler.ScheduleExpression;
import software.amazon.awscdk.services.scheduler.ScheduleProps;
import software.amazon.awscdk.services.scheduler.TimeWindow;
import software.amazon.awscdk.services.scheduler.targets.LambdaInvoke;
import software.constructs.Construct;

/**
 * The nightly copy of the FOCUS 1.2 export from the management account's cost bucket into this
 * account's own analytics lake, at {@code curated/cost/focus/dt=<date>/}.
 *
 * <p>A standalone zip Lambda and its own EventBridge Scheduler schedule, not a branch on {@code
 * IngestionStack}'s {@code NightlyIngestionWorkflow} state machine: that machine has no {@code
 * Catch}, so a failed cost copy would stop the metrics publish for every other panel. The cost
 * export is also on its own cadence (AWS refreshes it several times a day, not on this account's
 * schedule), so nothing is lost by running independently.
 *
 * <p>The Lambda's execution role is given a fixed physical name so {@code CostExportStack}'s
 * bucket policy, in the separate {@code cdk-cost} app deployed into the management account, can
 * name it by ARN in its {@code readerRoleArns} context value. That is the only link between the
 * two apps: neither reads the other's CloudFormation outputs.
 *
 * <p>Not a {@link Construct} subclass itself, matching {@link WorkflowRunTables} and {@link
 * NightlyIngestionWorkflow}: a plain class that takes the parent scope and builds its children
 * against it, exposing the created resources as public fields.
 */
public class CostFocusIngestion {

    /**
     * The FOCUS 1.2-with-AWS-columns column names, in the same order {@link CostFocusTables}'
     * Glue table declares them. The Data Exports API rejects {@code SELECT *}, so {@link
     * co.uk.diyaccounting.submit.stacks.CostExportStack} selects this explicit list by name; both
     * lists must change together, or the export's Parquet columns drift from the Glue table reading
     * them.
     */
    public static final List<String> FOCUS_1_2_COLUMNS = List.of(
            "billing_account_id",
            "billing_account_name",
            "billing_currency",
            "billing_period_start",
            "billing_period_end",
            "charge_category",
            "charge_class",
            "charge_description",
            "charge_frequency",
            "charge_period_start",
            "charge_period_end",
            "billed_cost",
            "contracted_cost",
            "effective_cost",
            "list_cost",
            "list_unit_price",
            "contracted_unit_price",
            "pricing_quantity",
            "pricing_unit",
            "consumed_quantity",
            "consumed_unit",
            "commitment_discount_category",
            "commitment_discount_id",
            "commitment_discount_status",
            "commitment_discount_type",
            "invoice_id",
            "invoice_issuer_name",
            "provider_name",
            "publisher_name",
            "region_id",
            "region_name",
            "resource_id",
            "resource_name",
            "resource_type",
            "service_category",
            "service_name",
            "sku_id",
            "sku_price_id",
            "sub_account_id",
            "sub_account_name",
            "tags",
            "x_discounts",
            "x_operation",
            "x_service_code");

    public final Role copyRole;
    public final Function copyLambda;
    public final Schedule schedule;
    public final Alarm errorsAlarm;

    @Value.Immutable
    public interface CostFocusIngestionProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        /** The management-account bucket the FOCUS export writes into. */
        String focusExportBucketName();

        /** The prefix the export writes under inside that bucket, e.g. {@code focus}. */
        String focusExportS3Prefix();

        /** This account's own analytics lake, which the copy job writes into. */
        IBucket lakeBucket();

        /** The curated prefix the copy writes under, e.g. {@code curated/cost/focus}. */
        String curatedPrefix();

        static ImmutableCostFocusIngestionProps.Builder builder() {
            return ImmutableCostFocusIngestionProps.builder();
        }
    }

    public CostFocusIngestion(final Construct scope, final CostFocusIngestionProps props) {
        var prefix = props.idPrefix();
        var functionName = prefix + "-cost-focus-copy";
        var assetDir = resolveAssetDir();

        this.copyRole = Role.Builder.create(scope, prefix + "-CostFocusCopyRole")
                .roleName(prefix + "-cost-focus-copy-role")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .build();
        this.copyRole.addManagedPolicy(software.amazon.awscdk.services.iam.ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AWSLambdaBasicExecutionRole"));

        var logGroup = LogGroup.Builder.create(scope, prefix + "-CostFocusCopyLogGroup")
                .logGroupName("/aws/lambda/" + functionName)
                .retention(RetentionDays.ONE_MONTH)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        this.copyLambda = Function.Builder.create(scope, prefix + "-CostFocusCopyFn")
                .functionName(functionName)
                .role(this.copyRole)
                .runtime(Runtime.NODEJS_24_X)
                .architecture(Architecture.ARM_64)
                .handler("index.handler")
                .code(Code.fromAsset(assetDir.toString()))
                .timeout(Duration.minutes(2))
                .memorySize(256)
                .logGroup(logGroup)
                .environment(Map.of(
                        "FOCUS_EXPORT_BUCKET_NAME", props.focusExportBucketName(),
                        "FOCUS_EXPORT_S3_PREFIX", props.focusExportS3Prefix(),
                        "ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName(),
                        "COST_FOCUS_CURATED_PREFIX", props.curatedPrefix()))
                .build();
        this.copyLambda.getNode().addDependency(logGroup);

        // Write access to this account's own lake. Read access to the export bucket in the
        // management account comes from that bucket's own policy naming this role's ARN, not
        // from anything granted here: this account has no permission to modify a bucket policy
        // it does not own.
        props.lakeBucket().grantWrite(this.copyLambda, props.curatedPrefix() + "/*");

        this.schedule = new Schedule(
                scope,
                prefix + "-CostFocusCopySchedule",
                ScheduleProps.builder()
                        .scheduleName(functionName + "-schedule")
                        .description("Copy new FOCUS 1.2 export objects into the analytics lake")
                        .schedule(ScheduleExpression.cron(CronOptionsWithTimezone.builder()
                                .minute("45")
                                .hour("2")
                                .timeZone(TimeZone.ETC_UTC)
                                .build()))
                        .timeWindow(TimeWindow.off())
                        .target(new LambdaInvoke(this.copyLambda))
                        .build());

        this.errorsAlarm = Alarm.Builder.create(scope, prefix + "-CostFocusCopyErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("The nightly FOCUS export copy failed at least once in 24 hours")
                .metric(this.copyLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).statistic("Sum").build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
    }

    private static Path resolveAssetDir() {
        var relativePath = "app/functions/analytics/costFocusCopy";
        var assetDir = Paths.get(relativePath).toAbsolutePath().normalize();
        if (!assetDir.toFile().isDirectory()) {
            assetDir = Paths.get("../" + relativePath).toAbsolutePath().normalize();
        }
        return assetDir;
    }
}
