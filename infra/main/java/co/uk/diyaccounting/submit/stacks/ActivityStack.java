/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.events.EventBus;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.constructs.Construct;

public class ActivityStack extends Stack {

    public final EventBus activityBus;
    public final Lambda telegramForwarderLambda;

    @Value.Immutable
    public interface ActivityStackProps extends StackProps, SubmitStackProps {

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

        // Telegram configuration
        @Value.Default
        default String telegramBotTokenArn() {
            return "";
        }

        @Value.Default
        default String telegramTestChatId() {
            return "";
        }

        @Value.Default
        default String telegramLiveChatId() {
            return "";
        }

        @Value.Default
        default String telegramOpsChatId() {
            return "";
        }

        static ImmutableActivityStackProps.Builder builder() {
            return ImmutableActivityStackProps.builder();
        }
    }

    public ActivityStack(final Construct scope, final String id, final ActivityStackProps props) {
        super(scope, id, props);

        // ============================================================================
        // EventBridge Custom Activity Bus
        // ============================================================================
        this.activityBus = EventBus.Builder.create(this, props.resourceNamePrefix() + "-ActivityBus")
                .eventBusName(props.sharedNames().activityBusName)
                .build();

        cfnOutput(this, "ActivityBusName", this.activityBus.getEventBusName());
        cfnOutput(this, "ActivityBusArn", this.activityBus.getEventBusArn());

        // ============================================================================
        // Telegram Forwarder Lambda + EventBridge Rule
        // ============================================================================
        // One instance per environment, not per deployment: every deployment's OpsStack targets
        // this same Lambda from its own alarm-state-change and stack-status rules, but the
        // bus-wide catch-all on ActivityEvent lives only here, on the bus this stack owns, so an
        // event fired to the bus reaches Telegram once regardless of how many deployments (e.g.
        // two live prod sets during a rollover) are running against this environment.
        var telegramForwarderEnv = new PopulatedMap<String, String>().with("ENVIRONMENT_NAME", props.envName());
        if (props.telegramBotTokenArn() != null && !props.telegramBotTokenArn().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_BOT_TOKEN_ARN", props.telegramBotTokenArn());
        }
        if (props.telegramTestChatId() != null && !props.telegramTestChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_TEST_CHAT_ID", props.telegramTestChatId());
        }
        if (props.telegramLiveChatId() != null && !props.telegramLiveChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_LIVE_CHAT_ID", props.telegramLiveChatId());
        }
        if (props.telegramOpsChatId() != null && !props.telegramOpsChatId().isBlank()) {
            telegramForwarderEnv.with("TELEGRAM_OPS_CHAT_ID", props.telegramOpsChatId());
        }
        this.telegramForwarderLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(props.sharedNames().activityTelegramForwarderLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().activityTelegramForwarderLambdaFunctionName)
                        .ingestHandler(props.sharedNames().activityTelegramForwarderLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().activityTelegramForwarderLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(10))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(telegramForwarderEnv)
                        // Every deployment's OpsStack still fires its own alarm-state-change rule at
                        // this same Lambda (see OpsStack.AlarmStateChangeRule), so a deploy's burst of
                        // alarm-state events can still cold-start it. Same rationale and issue
                        // reference as OpsStack carried before this Lambda moved here: GitHub issues
                        // #77-82.
                        .errorsAlarmEvaluationPeriods(3)
                        .errorsAlarmDatapointsToAlarm(2)
                        .build());

        // Single catch-all rule: the Lambda handles routing to the correct chat IDs
        // based on (actor, flow, env) in the event detail.
        Rule.Builder.create(this, "ActivityTelegramRule")
                .ruleName(props.resourceNamePrefix() + "-activity-telegram")
                .eventBus(this.activityBus)
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("ActivityEvent"))
                        .build())
                .targets(List.of(LambdaFunction.Builder.create(this.telegramForwarderLambda.ingestLambda)
                        .build()))
                .build();

        if (props.telegramBotTokenArn() != null && !props.telegramBotTokenArn().isBlank()) {
            var telegramSecretArnWithWildcard = props.telegramBotTokenArn().endsWith("*")
                    ? props.telegramBotTokenArn()
                    : props.telegramBotTokenArn() + "-*";
            this.telegramForwarderLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("secretsmanager:GetSecretValue"))
                    .resources(List.of(telegramSecretArnWithWildcard))
                    .build());
            infof(
                    "Granted Secrets Manager access to %s for Telegram bot token secret %s",
                    this.telegramForwarderLambda.ingestLambda.getFunctionName(), props.telegramBotTokenArn());
        }

        cfnOutput(this, "TelegramForwarderLambdaArn", this.telegramForwarderLambda.ingestLambda.getFunctionArn());

        Lambda.stackHealthAlarm(this, props.resourceNamePrefix(), "activity", List.of(this.telegramForwarderLambda));

        infof("ActivityStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
