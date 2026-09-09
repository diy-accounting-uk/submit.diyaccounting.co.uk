/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class CostBudgetsAndAnomalyMonitorTest {

    private static final String TELEGRAM_FORWARDER_ARN =
            "arn:aws:lambda:eu-west-2:972912397388:function:prod-env-activity-telegram-forwarder";

    private static Template synthTemplate(String envName, double monthlyBudgetUsd, boolean createAnomalyMonitor) {
        App app = new App();
        Stack stack = new Stack(
                app,
                "TestStack",
                StackProps.builder()
                        .env(Environment.builder()
                                .account("972912397388")
                                .region("eu-west-2")
                                .build())
                        .build());

        new CostBudgetsAndAnomalyMonitor(
                stack,
                CostBudgetsAndAnomalyMonitor.CostBudgetsAndAnomalyMonitorProps.builder()
                        .idPrefix(envName + "-env")
                        .envName(envName)
                        .monthlyBudgetUsd(monthlyBudgetUsd)
                        .telegramForwarderLambdaArn(TELEGRAM_FORWARDER_ARN)
                        .createAnomalyMonitor(createAnomalyMonitor)
                        .build());

        return Template.fromStack(stack);
    }

    @Test
    void budgetAlertsAt85PercentActualAnd100PercentForecast() {
        Template template = synthTemplate("prod", 120, true);

        template.resourceCountIs("AWS::Budgets::Budget", 1);
        template.hasResourceProperties(
                "AWS::Budgets::Budget",
                Match.objectLike(Map.of(
                        "Budget",
                        Match.objectLike(Map.of(
                                "BudgetType",
                                "COST",
                                "TimeUnit",
                                "MONTHLY",
                                "BudgetLimit",
                                Map.of("Amount", 120, "Unit", "USD"))),
                        "NotificationsWithSubscribers",
                        Match.arrayWith(List.of(
                                Match.objectLike(Map.of(
                                        "Notification",
                                        Match.objectLike(Map.of("NotificationType", "ACTUAL", "Threshold", 85)))),
                                Match.objectLike(Map.of(
                                        "Notification",
                                        Match.objectLike(
                                                Map.of("NotificationType", "FORECASTED", "Threshold", 100)))))))));
    }

    @Test
    void topicAllowsBudgetsAndAnomalyDetectionToPublishAndSubscribesTelegram() {
        Template template = synthTemplate("prod", 120, true);

        template.hasResourceProperties(
                "AWS::SNS::TopicPolicy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid",
                                                        "AllowBudgetsToPublish",
                                                        "Principal",
                                                        Map.of("Service", "budgets.amazonaws.com"))),
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid",
                                                        "AllowCostAnomalyDetectionToPublish",
                                                        "Principal",
                                                        Map.of("Service", "costalerts.amazonaws.com"))))))))));

        template.hasResourceProperties(
                "AWS::Lambda::Permission",
                Match.objectLike(Map.of(
                        "FunctionName", TELEGRAM_FORWARDER_ARN,
                        "Action", "lambda:InvokeFunction",
                        "Principal", "sns.amazonaws.com")));
    }

    @Test
    void anomalyMonitorOnlyWhenAskedFor() {
        Template withAnomaly = synthTemplate("prod", 120, true);
        withAnomaly.resourceCountIs("AWS::CE::AnomalyMonitor", 1);
        withAnomaly.resourceCountIs("AWS::CE::AnomalySubscription", 1);
        withAnomaly.hasResourceProperties(
                "AWS::CE::AnomalyMonitor",
                Match.objectLike(Map.of("MonitorType", "DIMENSIONAL", "MonitorDimension", "SERVICE")));

        Template ciTemplate = synthTemplate("ci", 30, false);
        assertEquals(0, ciTemplate.findResources("AWS::CE::AnomalyMonitor").size());
        assertEquals(0, ciTemplate.findResources("AWS::CE::AnomalySubscription").size());
    }
}
