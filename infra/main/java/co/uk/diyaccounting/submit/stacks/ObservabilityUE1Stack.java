/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.budgets.CfnBudget;
import software.amazon.awscdk.services.budgets.CfnBudgetsAction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.LambdaSubscription;
import software.constructs.Construct;

public class ObservabilityUE1Stack extends Stack {

    public final ILogGroup selfDestructLogGroup;
    public final ILogGroup distributionAccessLogGroup;

    @Value.Immutable
    public interface ObservabilityUE1StackProps extends StackProps, SubmitStackProps {

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

        int logGroupRetentionPeriodDays();

        String baseImageTag();

        static ImmutableObservabilityUE1StackProps.Builder builder() {
            return ImmutableObservabilityUE1StackProps.builder();
        }
    }

    public ObservabilityUE1Stack(Construct scope, String id, ObservabilityUE1StackProps props) {
        this(scope, id, null, props);
    }

    public ObservabilityUE1Stack(Construct scope, String id, StackProps stackProps, ObservabilityUE1StackProps props) {
        super(
                scope,
                id,
                StackProps.builder()
                        .env(props.getEnv()) // enforce region from props
                        .description(stackProps != null ? stackProps.getDescription() : null)
                        .stackName(stackProps != null ? stackProps.getStackName() : null)
                        .terminationProtection(stackProps != null ? stackProps.getTerminationProtection() : null)
                        .analyticsReporting(stackProps != null ? stackProps.getAnalyticsReporting() : null)
                        .synthesizer(stackProps != null ? stackProps.getSynthesizer() : null)
                        .crossRegionReferences(stackProps != null ? stackProps.getCrossRegionReferences() : null)
                        .build());

        // Log Group for CloudFront access logs (idempotent creation)
        this.distributionAccessLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-DistributionAccessLogGroup",
                        props.sharedNames().distributionAccessLogGroupName)
                .logGroup();

        // Log group for self-destruct operations (idempotent creation)
        this.selfDestructLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-SelfDestructLogGroup",
                        props.sharedNames().ue1SelfDestructLogGroupName)
                .logGroup();
        infof(
                "ObservabilityStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);

        // Outputs for Observability resources
        // cfnOutput(this, "WebDeploymentLogGroupArn", this.webDeploymentLogGroup.getLogGroupArn());
        cfnOutput(this, "SelfDestructLogGroupArn", this.selfDestructLogGroup.getLogGroupArn());

        // ============================================================================
        // Alarm triage: the Bedrock budgets and the deny action
        // ============================================================================
        // Bedrock spend is charged to the account, so the budgets live here (us-east-1, where every
        // other account-wide, region-agnostic resource in this environment's observability lives),
        // not alongside the triage role in the eu-west-2 stack.

        // Attached to nothing at deploy time - the budget action attaches it to the triage role by
        // name once the account crosses the monthly threshold.
        ManagedPolicy bedrockDenyPolicy = ManagedPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-AlarmTriageBedrockDenyPolicy")
                .managedPolicyName(props.resourceNamePrefix() + "-alarm-triage-bedrock-deny")
                .statements(List.of(PolicyStatement.Builder.create()
                        .effect(Effect.DENY)
                        .actions(List.of("bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"))
                        .resources(List.of("*"))
                        .build()))
                .build();

        // The role name is a plain string, not a CDK reference: the triage role lives in the other
        // region's stack, and SubmitSharedNames.alarmTriageRoleName is how both stacks agree on it
        // (asserted in SubmitEnvironmentCdkResourceTest and its us-east-1 equivalent).
        String alarmTriageRoleArn =
                "arn:aws:iam::%s:role/%s".formatted(this.getAccount(), props.sharedNames().alarmTriageRoleName);

        Role budgetsActionRole = Role.Builder.create(this, props.resourceNamePrefix() + "-BudgetsActionRole")
                .roleName(props.resourceNamePrefix() + "-budgets-action-role")
                .assumedBy(new ServicePrincipal("budgets.amazonaws.com"))
                .build();

        budgetsActionRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("AttachDenyPolicyToTriageRole")
                .actions(List.of("iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:GetRole"))
                .resources(List.of(alarmTriageRoleArn))
                .build());

        budgetsActionRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadDenyPolicy")
                .actions(List.of("iam:GetPolicy"))
                .resources(List.of(bedrockDenyPolicy.getManagedPolicyArn()))
                .build());

        // The budget action's SNS subscriber is required by CfnBudgetsAction. AWS Budgets
        // notifications are plain SNS text with no EventBridge equivalent, and Budgets offers no
        // other subscriber type, so a Lambda bridges this topic to the shared activity bus below
        // rather than the CloudWatch-alarm routing OpsStack owns per deployment.
        Topic bedrockBudgetAlertsTopic = Topic.Builder.create(
                        this, props.resourceNamePrefix() + "-BedrockBudgetAlertsTopic")
                .topicName(props.resourceNamePrefix() + "-bedrock-budget-alerts")
                .displayName("DIY Accounting Submit - Bedrock daily budget")
                .build();

        // Two budgets, not one: AWS Budgets Actions reject a DAILY budget ("AWS Budgets Actions
        // don't support daily granularity budget for now"), so the deny action has to sit on a
        // MONTHLY budget. USD 150 is 30 days of the operator's USD 5/day figure, keeping the same
        // spend rate the action enforces at. The DAILY budget carries no action, only a
        // notification to the same topic, so the operator still hears about a bad day before the
        // month-level enforcement would trip.
        //
        // Both budgets filter on the BillingEntity dimension, not Service. AWS bills the Bedrock
        // models the triage role invokes through AWS Marketplace, each under its own product name
        // ("Claude Sonnet 4.5 (Amazon Bedrock Edition)", "Claude Haiku 4.5 (Amazon Bedrock
        // Edition)", read from Cost Explorer on 2026-09-10). A Service filter naming today's
        // models would go blind the next time a model is pinned, the same failure this replaces:
        // both live budgets read $0.00 actual against a "Service": ["Amazon Bedrock"] filter while
        // Cost Explorer showed $0.199 of real model spend that day, because none of it bills under
        // the plain "Amazon Bedrock" service. BillingEntity: ["AWS Marketplace"] catches every
        // Marketplace-billed model without listing one, and this account carries no other
        // Marketplace purchase to dilute it.
        String bedrockMonthlyBudgetName = props.envName() + "-env-bedrock-monthly";

        CfnBudget.Builder.create(this, props.resourceNamePrefix() + "-BedrockMonthlyBudget")
                .budget(CfnBudget.BudgetDataProperty.builder()
                        .budgetName(bedrockMonthlyBudgetName)
                        .budgetType("COST")
                        .timeUnit("MONTHLY")
                        .budgetLimit(CfnBudget.SpendProperty.builder()
                                .amount(150)
                                .unit("USD")
                                .build())
                        .costFilters(Map.of("BillingEntity", List.of("AWS Marketplace")))
                        .build())
                .build();

        CfnBudgetsAction.Builder.create(this, props.resourceNamePrefix() + "-BedrockDenyAction")
                .budgetName(bedrockMonthlyBudgetName)
                .actionType("APPLY_IAM_POLICY")
                .approvalModel("AUTOMATIC")
                .notificationType("ACTUAL")
                .actionThreshold(CfnBudgetsAction.ActionThresholdProperty.builder()
                        .value(100)
                        .type("PERCENTAGE")
                        .build())
                .executionRoleArn(budgetsActionRole.getRoleArn())
                .definition(CfnBudgetsAction.DefinitionProperty.builder()
                        .iamActionDefinition(CfnBudgetsAction.IamActionDefinitionProperty.builder()
                                .policyArn(bedrockDenyPolicy.getManagedPolicyArn())
                                .roles(List.of(props.sharedNames().alarmTriageRoleName))
                                .build())
                        .build())
                .subscribers(List.of(CfnBudgetsAction.SubscriberProperty.builder()
                        .type("SNS")
                        .address(bedrockBudgetAlertsTopic.getTopicArn())
                        .build()))
                .build();

        String bedrockDailyBudgetName = props.envName() + "-env-bedrock-daily";

        CfnBudget.Builder.create(this, props.resourceNamePrefix() + "-BedrockDailyBudget")
                .budget(CfnBudget.BudgetDataProperty.builder()
                        .budgetName(bedrockDailyBudgetName)
                        .budgetType("COST")
                        .timeUnit("DAILY")
                        .budgetLimit(CfnBudget.SpendProperty.builder()
                                .amount(5)
                                .unit("USD")
                                .build())
                        .costFilters(Map.of("BillingEntity", List.of("AWS Marketplace")))
                        .build())
                .notificationsWithSubscribers(List.of(CfnBudget.NotificationWithSubscribersProperty.builder()
                        .notification(CfnBudget.NotificationProperty.builder()
                                .notificationType("ACTUAL")
                                .comparisonOperator("GREATER_THAN")
                                .threshold(99)
                                .thresholdType("PERCENTAGE")
                                .build())
                        .subscribers(List.of(CfnBudget.SubscriberProperty.builder()
                                .subscriptionType("SNS")
                                .address(bedrockBudgetAlertsTopic.getTopicArn())
                                .build()))
                        .build()))
                .build();

        cfnOutput(this, "BedrockBudgetAlertsTopicArn", bedrockBudgetAlertsTopic.getTopicArn());

        // ============================================================================
        // Bedrock budget alerts reaching Telegram
        // ============================================================================
        // The WAF and certificate alarms in EdgeStack reach Telegram by forwarding their
        // us-east-1 "CloudWatch Alarm State Change" events cross-region to OpsStack's
        // AlarmStateChangeRule, but that rule (like the rest of OpsStack) is created once per
        // app deployment - there is no persistent env-level equivalent to forward a CloudWatch
        // alarm into, and a budget threshold breach has no CloudWatch alarm to raise in the first
        // place (Budgets does not publish a per-budget metric). The env-level path that already
        // survives every deployment is the shared activity bus ActivityStack creates: OpsStack's
        // ActivityTelegramRule reads it in every live deployment and needs no alarm-name prefix
        // match, only detail-type "ActivityEvent". This Lambda is the bridge from the budget
        // topic's plain SNS text to that contract, the same role wafScanDetect.js plays for a WAF
        // finding raised in this same region (see EdgeStack).
        var budgetAlertForwardFunctionName = props.resourceNamePrefix() + "-bedrock-budget-alert-forward";
        var budgetAlertForwardEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ACTIVITY_BUS_REGION", "eu-west-2");

        var budgetAlertForwardLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(budgetAlertForwardFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ue1EcrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ue1EcrRepositoryArn)
                        .ingestFunctionName(budgetAlertForwardFunctionName)
                        .ingestHandler("app/functions/ops/bedrockBudgetAlertForward.handler")
                        .ingestLambdaArn("arn:aws:lambda:us-east-1:" + this.getAccount() + ":function:"
                                + budgetAlertForwardFunctionName)
                        .ingestProvisionedConcurrencyAliasArn("arn:aws:lambda:us-east-1:" + this.getAccount()
                                + ":function:" + budgetAlertForwardFunctionName + ":"
                                + props.sharedNames().provisionedConcurrencyAliasName)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(10))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(budgetAlertForwardEnv)
                        .build());

        // Cross-region PutEvents: the activity bus lives in eu-west-2, this Lambda runs in
        // us-east-1 (the budget itself is account-wide, but Bedrock spend and the deny action's
        // execution role live where this stack does). Scoped to this environment's own activity
        // bus, not every bus in the account.
        String activityBusArn =
                "arn:aws:events:eu-west-2:" + this.getAccount() + ":event-bus/" + props.sharedNames().activityBusName;
        budgetAlertForwardLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBusArn))
                .build());

        bedrockBudgetAlertsTopic.addSubscription(new LambdaSubscription(budgetAlertForwardLambda.ingestLambda));

        Lambda.stackHealthAlarm(this, props.resourceNamePrefix(), "obs-ue1", List.of(budgetAlertForwardLambda));

        cfnOutput(this, "BedrockBudgetAlertForwardLambdaArn", budgetAlertForwardLambda.ingestLambda.getFunctionArn());
        infof(
                "Subscribed Bedrock budget alert forward Lambda %s to %s",
                budgetAlertForwardLambda.ingestLambda.getNode().getId(), bedrockBudgetAlertsTopic.getTopicName());
    }
}
