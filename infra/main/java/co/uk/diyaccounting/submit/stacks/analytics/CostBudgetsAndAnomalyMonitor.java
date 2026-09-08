/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.services.budgets.CfnBudget;
import software.amazon.awscdk.services.ce.CfnAnomalyMonitor;
import software.amazon.awscdk.services.ce.CfnAnomalySubscription;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.LambdaSubscription;
import software.constructs.Construct;

/**
 * A monthly cost budget for this account, and, in prod only, a Cost Anomaly Detection monitor:
 * the account-level half of the cost plan, sitting beside the FOCUS export ({@code
 * CostExportStack}, which lives in the management account instead).
 *
 * <p>Reaches Telegram the only way AWS Budgets and Cost Anomaly Detection can: both speak SNS or
 * email, never EventBridge, unlike every other alarm in this repository, which reaches Telegram
 * through {@code OpsStack}'s {@code AlarmStateChangeRule} watching real CloudWatch Alarm State
 * Change events on the default bus. This topic subscribes the same environment-level Telegram
 * forwarder Lambda {@code ActivityStack} already owns, and {@code activityTelegramForwarder.js}
 * gained an SNS branch (`synthesizeFromSns`) to read a Budget or Anomaly notification's subject
 * and first line the same way it reads a CloudWatch alarm's state transition.
 *
 * <p>Not a {@link Construct} subclass itself, matching {@link WorkflowRunTables} and {@link
 * CostFocusIngestion}: a plain class that takes the parent scope and builds its children against
 * it, exposing the created resources as public fields.
 */
public class CostBudgetsAndAnomalyMonitor {

    public final Topic alertTopic;
    public final CfnBudget budget;
    public final CfnAnomalyMonitor anomalyMonitor;
    public final CfnAnomalySubscription anomalySubscription;

    @Value.Immutable
    public interface CostBudgetsAndAnomalyMonitorProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        /** Monthly budget limit in USD, e.g. 30 for ci or 120 for prod. */
        double monthlyBudgetUsd();

        /** The environment-level Telegram forwarder Lambda's ARN, imported by name. */
        String telegramForwarderLambdaArn();

        /**
         * Fires an org-wide anomaly monitor only when true (prod). ci's spend is too small and
         * too spiky between ephemeral deployments for a per-service anomaly signal to be useful.
         */
        boolean createAnomalyMonitor();

        static ImmutableCostBudgetsAndAnomalyMonitorProps.Builder builder() {
            return ImmutableCostBudgetsAndAnomalyMonitorProps.builder();
        }
    }

    public CostBudgetsAndAnomalyMonitor(final Construct scope, final CostBudgetsAndAnomalyMonitorProps props) {
        var prefix = props.idPrefix();

        // ============================================================================
        // SNS topic reaching Telegram via the imported forwarder Lambda
        // ============================================================================
        this.alertTopic = Topic.Builder.create(scope, prefix + "-CostAlertsTopic")
                .topicName(prefix + "-cost-alerts")
                .displayName("DIY Accounting Submit - Cost Alerts")
                .build();

        this.alertTopic.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowBudgetsToPublish")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("budgets.amazonaws.com")))
                .actions(List.of("sns:Publish"))
                .resources(List.of(this.alertTopic.getTopicArn()))
                .build());
        this.alertTopic.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCostAnomalyDetectionToPublish")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("costalerts.amazonaws.com")))
                .actions(List.of("sns:Publish"))
                .resources(List.of(this.alertTopic.getTopicArn()))
                .build());

        IFunction telegramForwarderLambda = software.amazon.awscdk.services.lambda.Function.fromFunctionAttributes(
                scope,
                prefix + "-CostAlertsImportedTelegramForwarder",
                FunctionAttributes.builder()
                        .functionArn(props.telegramForwarderLambdaArn())
                        .sameEnvironment(true)
                        .build());
        this.alertTopic.addSubscription(new LambdaSubscription(telegramForwarderLambda));

        // ============================================================================
        // Budget: 85% actual, 100% forecast, both to the topic above
        // ============================================================================
        this.budget = CfnBudget.Builder.create(scope, prefix + "-CostBudget")
                .budget(CfnBudget.BudgetDataProperty.builder()
                        .budgetName(prefix + "-monthly-cost")
                        .budgetType("COST")
                        .timeUnit("MONTHLY")
                        .budgetLimit(CfnBudget.SpendProperty.builder()
                                .amount(props.monthlyBudgetUsd())
                                .unit("USD")
                                .build())
                        .build())
                .notificationsWithSubscribers(List.of(
                        CfnBudget.NotificationWithSubscribersProperty.builder()
                                .notification(CfnBudget.NotificationProperty.builder()
                                        .notificationType("ACTUAL")
                                        .comparisonOperator("GREATER_THAN")
                                        .threshold(85)
                                        .thresholdType("PERCENTAGE")
                                        .build())
                                .subscribers(List.of(CfnBudget.SubscriberProperty.builder()
                                        .subscriptionType("SNS")
                                        .address(this.alertTopic.getTopicArn())
                                        .build()))
                                .build(),
                        CfnBudget.NotificationWithSubscribersProperty.builder()
                                .notification(CfnBudget.NotificationProperty.builder()
                                        .notificationType("FORECASTED")
                                        .comparisonOperator("GREATER_THAN")
                                        .threshold(100)
                                        .thresholdType("PERCENTAGE")
                                        .build())
                                .subscribers(List.of(CfnBudget.SubscriberProperty.builder()
                                        .subscriptionType("SNS")
                                        .address(this.alertTopic.getTopicArn())
                                        .build()))
                                .build()))
                .build();

        // ============================================================================
        // Cost Anomaly Detection: prod only
        // ============================================================================
        if (props.createAnomalyMonitor()) {
            this.anomalyMonitor = CfnAnomalyMonitor.Builder.create(scope, prefix + "-CostAnomalyMonitor")
                    .monitorName(prefix + "-cost-anomaly-monitor")
                    .monitorType("DIMENSIONAL")
                    .monitorDimension("SERVICE")
                    .build();

            this.anomalySubscription = CfnAnomalySubscription.Builder.create(
                            scope, prefix + "-CostAnomalySubscription")
                    .subscriptionName(prefix + "-cost-anomaly-subscription")
                    .frequency("DAILY")
                    .monitorArnList(List.of(this.anomalyMonitor.getAttrMonitorArn()))
                    .subscribers(List.of(CfnAnomalySubscription.SubscriberProperty.builder()
                            .type("SNS")
                            .address(this.alertTopic.getTopicArn())
                            .build()))
                    .thresholdExpression("{\"Dimensions\":{\"Key\":\"ANOMALY_TOTAL_IMPACT_ABSOLUTE\","
                            + "\"MatchOptions\":[\"GREATER_THAN_OR_EQUAL\"],\"Values\":[\"15\"]}}")
                    .build();
            this.anomalySubscription.getNode().addDependency(this.anomalyMonitor);
        } else {
            this.anomalyMonitor = null;
            this.anomalySubscription = null;
        }
    }
}
