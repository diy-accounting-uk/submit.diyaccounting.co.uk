/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
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
        // Alarm triage: the daily Bedrock budget and its deny action
        // ============================================================================
        // Bedrock spend is charged to the account, so the budget lives here (us-east-1, where every
        // other account-wide, region-agnostic resource in this environment's observability lives),
        // not alongside the triage role in the eu-west-2 stack.

        // Attached to nothing at deploy time - the budget action attaches it to the triage role by
        // name once the account crosses the daily threshold.
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

        // The budget action's SNS subscriber is required by CfnBudgetsAction, but the plan this
        // stack follows left alertTopicArn undefined; nothing subscribes today, so this is purely a
        // sink the operator can subscribe to later.
        Topic bedrockBudgetAlertsTopic = Topic.Builder.create(
                        this, props.resourceNamePrefix() + "-BedrockBudgetAlertsTopic")
                .topicName(props.resourceNamePrefix() + "-bedrock-budget-alerts")
                .displayName("DIY Accounting Submit - Bedrock daily budget")
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
                        .costFilters(Map.of("Service", List.of("Amazon Bedrock")))
                        .build())
                .build();

        CfnBudgetsAction.Builder.create(this, props.resourceNamePrefix() + "-BedrockDenyAction")
                .budgetName(bedrockDailyBudgetName)
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

        cfnOutput(this, "BedrockBudgetAlertsTopicArn", bedrockBudgetAlertsTopic.getTopicArn());
    }
}
