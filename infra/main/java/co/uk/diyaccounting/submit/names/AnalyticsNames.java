/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class AnalyticsNames {

    // Analytics lake, catalog and query resources
    public String analyticsLakeBucketName;
    public String analyticsResultsBucketName;
    public String glueDatabaseName;
    public String athenaWorkGroupName;
    public String stateMachineName;
    public String activityEventsDeliveryStreamName;
    public String activityEventsDeliveryStreamLogGroupName;
    public String activityEventTransformLambdaFunctionName;
    public String activityEventTransformLambdaHandler;
    public String activityEventTransformLambdaArn;
    public String activityEventTransformProvisionedConcurrencyLambdaAliasArn;
    public String dynamoStreamToFirehoseLambdaFunctionName;
    public String dynamoStreamToFirehoseLambdaHandler;
    public String dynamoStreamToFirehoseLambdaArn;
    public String dynamoStreamToFirehoseProvisionedConcurrencyLambdaAliasArn;
    public String alarmStateChangeDeliveryStreamName;
    public String alarmStateChangeTransformLambdaFunctionName;
    public String alarmStateChangeTransformLambdaHandler;
    public String alarmStateChangeTransformLambdaArn;
    public String alarmStateChangeTransformProvisionedConcurrencyLambdaAliasArn;

    private final String envResourceNamePrefix;

    public AnalyticsNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {
        this.envResourceNamePrefix = root.envResourceNamePrefix;
        this.analyticsLakeBucketName = "%s-analytics-lake-%s".formatted(root.envResourceNamePrefix, props.awsAccount);
        this.analyticsResultsBucketName =
                "%s-analytics-results-%s".formatted(root.envResourceNamePrefix, props.awsAccount);
        this.glueDatabaseName = "%s_env_analytics".formatted(props.envName);
        this.athenaWorkGroupName = "%s-analytics".formatted(root.envResourceNamePrefix);
        this.stateMachineName = "%s-analytics-nightly".formatted(root.envResourceNamePrefix);
        this.activityEventsDeliveryStreamName = "%s-activity-events".formatted(root.envResourceNamePrefix);
        this.activityEventsDeliveryStreamLogGroupName =
                "/aws/kinesisfirehose/%s".formatted(this.activityEventsDeliveryStreamName);
        this.activityEventTransformLambdaFunctionName =
                "%s-activity-event-transform".formatted(root.envResourceNamePrefix);
        this.activityEventTransformLambdaHandler = "app/functions/analytics/activityEventTransform.handler";
        this.activityEventTransformLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.activityEventTransformLambdaFunctionName);
        this.activityEventTransformProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.activityEventTransformLambdaArn, root.provisionedConcurrencyAliasName);
        this.dynamoStreamToFirehoseLambdaFunctionName =
                "%s-dynamo-stream-to-firehose".formatted(root.envResourceNamePrefix);
        this.dynamoStreamToFirehoseLambdaHandler = "app/functions/analytics/dynamoStreamToFirehose.handler";
        this.dynamoStreamToFirehoseLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.dynamoStreamToFirehoseLambdaFunctionName);
        this.dynamoStreamToFirehoseProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.dynamoStreamToFirehoseLambdaArn, root.provisionedConcurrencyAliasName);
        this.alarmStateChangeDeliveryStreamName = "%s-alarm-state-changes".formatted(root.envResourceNamePrefix);
        this.alarmStateChangeTransformLambdaFunctionName =
                "%s-alarm-state-change-transform".formatted(root.envResourceNamePrefix);
        this.alarmStateChangeTransformLambdaHandler = "app/functions/analytics/alarmStateChangeTransform.handler";
        this.alarmStateChangeTransformLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.alarmStateChangeTransformLambdaFunctionName);
        this.alarmStateChangeTransformProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.alarmStateChangeTransformLambdaArn, root.provisionedConcurrencyAliasName);
    }

    /**
     * Firehose delivery stream name for one DynamoDB table's change records, e.g.
     * {@code ci-env-stream-receipts}. Parameterized rather than a fixed field because it is
     * needed once per streamed table (receipts, bundles, subscriptions, passes).
     *
     * @param table the table's short name, e.g. "receipts"
     * @return the delivery stream name
     */
    public String tableStreamDeliveryStreamName(String table) {
        return "%s-stream-%s".formatted(this.envResourceNamePrefix, table);
    }

    /**
     * CloudWatch log group name for a Firehose delivery stream, matching the naming this repo
     * already uses for the activity-events stream's log group.
     *
     * @param deliveryStreamName the delivery stream's name
     * @return the log group name
     */
    public String deliveryStreamLogGroupName(String deliveryStreamName) {
        return "/aws/kinesisfirehose/%s".formatted(deliveryStreamName);
    }
}
