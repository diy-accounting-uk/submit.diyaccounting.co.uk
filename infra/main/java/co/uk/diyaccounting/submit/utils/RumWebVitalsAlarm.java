/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.Map;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MathExpression;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.constructs.Construct;

/**
 * A web vitals alarm on an AWS/RUM metric. A site records a handful of samples a day, so a p75
 * over a short period is the p75 of one or two page loads. The alarm reads the p75 of a whole
 * day, and reads 0 on a day with fewer than {@link #MINIMUM_SAMPLES} samples.
 */
public final class RumWebVitalsAlarm {

    public static final int MINIMUM_SAMPLES = 10;
    public static final Duration PERIOD = Duration.days(1);
    public static final int EVALUATION_PERIODS = 1;

    private RumWebVitalsAlarm() {}

    /** An alarm on the metric in the stack's own account. */
    public static Alarm create(
            Construct scope,
            String id,
            String alarmName,
            String metricName,
            String applicationName,
            double threshold,
            String description) {
        return create(scope, id, alarmName, metricName, applicationName, null, null, threshold, description);
    }

    /** An alarm on the metric in a source account and region that has linked to this account's sink. */
    public static Alarm create(
            Construct scope,
            String id,
            String alarmName,
            String metricName,
            String applicationName,
            String sourceAccount,
            String sourceRegion,
            double threshold,
            String description) {
        MathExpression flooredP75 = MathExpression.Builder.create()
                .expression("IF(samples >= " + MINIMUM_SAMPLES + ", p75, 0)")
                .usingMetrics(Map.of(
                        "samples",
                        vitalsMetric(metricName, applicationName, sourceAccount, sourceRegion, "SampleCount"),
                        "p75",
                        vitalsMetric(metricName, applicationName, sourceAccount, sourceRegion, "p75")))
                .period(PERIOD)
                .build();
        return Alarm.Builder.create(scope, id)
                .alarmName(alarmName)
                .metric(flooredP75)
                .threshold(threshold)
                .evaluationPeriods(EVALUATION_PERIODS)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(description + " over one day. Reads 0 on a day with fewer than " + MINIMUM_SAMPLES
                        + " samples.")
                .build();
    }

    private static Metric vitalsMetric(
            String metricName, String applicationName, String sourceAccount, String sourceRegion, String statistic) {
        Metric.Builder builder = Metric.Builder.create()
                .namespace("AWS/RUM")
                .metricName(metricName)
                .dimensionsMap(Map.of("application_name", applicationName))
                .statistic(statistic)
                .period(PERIOD);
        if (sourceAccount != null) {
            builder.account(sourceAccount).region(sourceRegion);
        }
        return builder.build();
    }
}
