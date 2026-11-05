/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability OPS-182 Provision the customer email sender
// - **Use when:** the SES identity, the DNS records for mail, the customer email queue or its workers need a change.
// - **Does:** EmailStack.java is an environment stack. It creates the SES domain identity with DKIM and a custom MAIL FROM domain, and the Route53 records through the root role. It also creates the request queue, the send worker and the bounce and complaint handler.
// - **Run:** no command; deploy-environment.yml runs its deploy-email job
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/EmailStack.java:EmailStack`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/EmailStack.java, infra/main/java/co/uk/diyaccounting/submit/names/EmailNames.java, infra/test/java/co/uk/diyaccounting/submit/stacks/EmailStackTest.java
// - **Keywords:** ses, email identity, dkim, mail from, configuration set, customer email queue, route53 mail records
// - **Related:** SITE-27, OPS-127
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
import co.uk.diyaccounting.submit.names.EmailNames;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.Route53AliasUpsert;
import co.uk.diyaccounting.submit.utils.Route53AliasUpsert.DnsRecordSet;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.events.EventBus;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.IEventBus;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.RuleTargetInput;
import software.amazon.awscdk.services.events.targets.SqsQueue;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.eventsources.SqsEventSource;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.ses.ConfigurationSet;
import software.amazon.awscdk.services.ses.ConfigurationSetEventDestinationOptions;
import software.amazon.awscdk.services.ses.DkimIdentity;
import software.amazon.awscdk.services.ses.EasyDkimSigningKeyLength;
import software.amazon.awscdk.services.ses.EmailIdentity;
import software.amazon.awscdk.services.ses.EmailSendingEvent;
import software.amazon.awscdk.services.ses.EventDestination;
import software.amazon.awscdk.services.ses.Identity;
import software.amazon.awscdk.services.ses.MailFromBehaviorOnMxFailure;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.sns.subscriptions.LambdaSubscription;
import software.amazon.awscdk.services.sqs.DeadLetterQueue;
import software.amazon.awscdk.services.sqs.Queue;
import software.amazon.awscdk.services.sqs.QueueEncryption;
import software.amazon.awscdk.services.ssm.StringParameter;
import software.constructs.Construct;

/**
 * Sends the customer's email after a key event. One sender serves every deployment of an
 * environment: an SES domain identity with a custom MAIL FROM domain, a queue the activity bus
 * feeds, the worker that sends, and the Lambda that reads bounce and complaint events.
 */
public class EmailStack extends Stack {

    public final EmailIdentity identity;
    public final ConfigurationSet configurationSet;
    public final Topic eventsTopic;
    public final Queue queue;
    public final Queue deadLetterQueue;
    public final Lambda sendLambda;
    public final Lambda eventLambda;

    @Value.Immutable
    public interface EmailStackProps extends StackProps, SubmitStackProps {

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

        String hostedZoneName();

        String hostedZoneId();

        /** Address that receives a copy of selected emails. Blank sends no copy. */
        @Value.Default
        default String operatorNotifyEmail() {
            return "";
        }

        static ImmutableEmailStackProps.Builder builder() {
            return ImmutableEmailStackProps.builder();
        }
    }

    public EmailStack(final Construct scope, final String id, final EmailStackProps props) {
        super(scope, id, props);

        var names = props.sharedNames().email;
        var prefix = props.resourceNamePrefix();
        String domain = props.hostedZoneName();
        String senderAddress = EmailNames.SENDER_LOCAL_PART + "@" + domain;
        String mailFromDomain = EmailNames.MAIL_FROM_SUBDOMAIN + "." + domain;
        String senderDisplay = "DIY Accounting <" + senderAddress + ">";

        // ============================================================================
        // SES identity: domain, DKIM, custom MAIL FROM, configuration set
        // ============================================================================
        this.eventsTopic = Topic.Builder.create(this, prefix + "-CustomerEmailEventsTopic")
                .topicName(names.eventsTopicName)
                .enforceSsl(true)
                .build();

        this.configurationSet = ConfigurationSet.Builder.create(this, prefix + "-CustomerEmailConfigurationSet")
                .configurationSetName(names.configurationSetName)
                .reputationMetrics(true)
                .sendingEnabled(true)
                .build();
        this.configurationSet.addEventDestination(
                prefix + "-CustomerEmailEventDestination",
                ConfigurationSetEventDestinationOptions.builder()
                        .destination(EventDestination.snsTopic(this.eventsTopic))
                        .events(List.of(
                                EmailSendingEvent.BOUNCE,
                                EmailSendingEvent.COMPLAINT,
                                EmailSendingEvent.REJECT,
                                EmailSendingEvent.RENDERING_FAILURE,
                                EmailSendingEvent.DELIVERY_DELAY))
                        .build());

        this.identity = EmailIdentity.Builder.create(this, prefix + "-CustomerEmailIdentity")
                .identity(Identity.domain(domain))
                .dkimIdentity(DkimIdentity.easyDkim(EasyDkimSigningKeyLength.RSA_2048_BIT))
                .mailFromDomain(mailFromDomain)
                .mailFromBehaviorOnMxFailure(MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE)
                .configurationSet(this.configurationSet)
                .build();

        // ============================================================================
        // DNS: the zone is in the management account; the root Route53 role writes to it
        // ============================================================================
        IHostedZone hostedZone = HostedZone.fromHostedZoneAttributes(
                this,
                prefix + "-HostedZone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());
        var records = new ArrayList<DnsRecordSet>();
        this.identity
                .getDkimRecords()
                .forEach(record ->
                        records.add(new DnsRecordSet(record.getName(), "CNAME", 300L, List.of(record.getValue()))));
        records.add(new DnsRecordSet(
                mailFromDomain, "MX", 300L, List.of("10 feedback-smtp." + this.getRegion() + ".amazonses.com")));
        records.add(new DnsRecordSet(mailFromDomain, "TXT", 300L, List.of("\"v=spf1 include:amazonses.com ~all\"")));
        Route53AliasUpsert.upsertRecords(this, "CustomerEmail", hostedZone, records);

        // ============================================================================
        // Queue between the activity bus and the worker
        // ============================================================================
        this.deadLetterQueue = Queue.Builder.create(this, prefix + "-CustomerEmailDeadLetterQueue")
                .queueName(names.deadLetterQueueName)
                .encryption(QueueEncryption.SQS_MANAGED)
                .enforceSsl(true)
                .retentionPeriod(Duration.days(14))
                .build();
        this.queue = Queue.Builder.create(this, prefix + "-CustomerEmailQueue")
                .queueName(names.queueName)
                .encryption(QueueEncryption.SQS_MANAGED)
                .enforceSsl(true)
                .visibilityTimeout(Duration.seconds(180))
                .retentionPeriod(Duration.days(4))
                .deadLetterQueue(DeadLetterQueue.builder()
                        .queue(this.deadLetterQueue)
                        .maxReceiveCount(5)
                        .build())
                .build();

        IEventBus activityBus =
                EventBus.fromEventBusName(this, "ActivityBus", props.sharedNames().activity.activityBusName);
        Rule.Builder.create(this, "CustomerEmailRequestRule")
                .ruleName(prefix + "-customer-email-request")
                .eventBus(activityBus)
                .eventPattern(EventPattern.builder()
                        .detailType(List.of("CustomerEmailRequest"))
                        .build())
                .targets(List.of(SqsQueue.Builder.create(this.queue)
                        .message(RuleTargetInput.fromEventPath("$.detail"))
                        .deadLetterQueue(this.deadLetterQueue)
                        .build()))
                .build();

        // ============================================================================
        // Worker Lambda: reads the queue and sends
        // ============================================================================
        String userPoolId = StringParameter.valueForStringParameter(this, names.userPoolIdParameterName);
        var sendRequiredEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName)
                .with("RECEIPTS_DYNAMODB_TABLE_NAME", props.sharedNames().data.receiptsTableName)
                .with("COGNITO_USER_POOL_ID", userPoolId)
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("CUSTOMER_EMAIL_FROM", senderDisplay)
                .with("CUSTOMER_EMAIL_CONFIGURATION_SET", names.configurationSetName);
        // Blank is a value the worker reads: no operator copy, and no test sink, so test traffic
        // sends nothing.
        var sendEnv = new HashMap<String, String>(sendRequiredEnv);
        sendEnv.put("CUSTOMER_EMAIL_OPERATOR_COPY_TO", props.operatorNotifyEmail());
        sendEnv.put("CUSTOMER_EMAIL_TEST_SINK", "ci".equals(props.envName()) ? "success@simulator.amazonses.com" : "");
        this.sendLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(names.sendLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(names.sendLambdaFunctionName)
                        .ingestHandler(names.sendLambdaHandler)
                        .ingestLambdaArn(names.sendLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(names.sendProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(30))
                        .ingestMemorySize(512)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(sendEnv)
                        .errorsAlarmEvaluationPeriods(3)
                        .errorsAlarmDatapointsToAlarm(2)
                        .build());
        this.sendLambda.ingestLambdaAlias.addEventSource(SqsEventSource.Builder.create(this.queue)
                .batchSize(1)
                .maxConcurrency(2)
                .build());

        // The domain identity would let the role send as any address at the domain, so the
        // condition pins the sender.
        this.sendLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("SendFromSupportAddress")
                .effect(Effect.ALLOW)
                .actions(List.of("ses:SendEmail"))
                .resources(List.of(
                        this.identity.getEmailIdentityArn(),
                        "arn:aws:ses:%s:%s:configuration-set/%s"
                                .formatted(this.getRegion(), this.getAccount(), names.configurationSetName)))
                .conditions(Map.of("StringEquals", Map.of("ses:FromAddress", senderAddress)))
                .build());
        // ses:GetAccount has no resource type.
        this.sendLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("ReadSesAccount")
                .effect(Effect.ALLOW)
                .actions(List.of("ses:GetAccount"))
                .resources(List.of("*"))
                .build());
        this.sendLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("LookUpUserInPool")
                .effect(Effect.ALLOW)
                .actions(List.of("cognito-idp:ListUsers"))
                .resources(List.of("arn:aws:cognito-idp:%s:%s:userpool/%s"
                        .formatted(this.getRegion(), this.getAccount(), userPoolId)))
                .build());
        ITable receiptsTable =
                Table.fromTableName(this, "ImportedReceiptsTable", props.sharedNames().data.receiptsTableName);
        receiptsTable.grant(this.sendLambda.ingestLambda, "dynamodb:GetItem");
        this.sendLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("PutActivityEvents")
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBus.getEventBusArn()))
                .build());
        SubHashSaltHelper.grantSaltAccess(
                this.sendLambda.ingestLambda, this.getRegion(), this.getAccount(), props.envName());

        // ============================================================================
        // Event Lambda: bounces and complaints from the configuration set
        // ============================================================================
        var eventEnv = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activity.activityBusName);
        this.eventLambda = new Lambda(
                this,
                LambdaProps.builder()
                        .idPrefix(names.eventLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(names.eventLambdaFunctionName)
                        .ingestHandler(names.eventLambdaHandler)
                        .ingestLambdaArn(names.eventLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(names.eventProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .ingestLambdaTimeout(Duration.seconds(10))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .environment(eventEnv)
                        .errorsAlarmEvaluationPeriods(3)
                        .errorsAlarmDatapointsToAlarm(2)
                        .build());
        this.eventLambda.ingestLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("PutActivityEvents")
                .effect(Effect.ALLOW)
                .actions(List.of("events:PutEvents"))
                .resources(List.of(activityBus.getEventBusArn()))
                .build());
        SubHashSaltHelper.grantSaltAccess(
                this.eventLambda.ingestLambda, this.getRegion(), this.getAccount(), props.envName());
        this.eventsTopic.addSubscription(new LambdaSubscription(this.eventLambda.ingestLambda));

        // ============================================================================
        // Health: a message in the dead letter queue is a request that failed five times
        // ============================================================================
        // Named like the per-function checks in Lambda: a term of this stack's composite health
        // alarm, outside OpsStack's routing rule.
        Alarm deadLetterAlarm = Alarm.Builder.create(this, prefix + "-CustomerEmailDeadLetterAlarm")
                .alarmName("check-" + prefix + "-customer-email-dlq-not-empty")
                .alarmDescription("A customer email request failed five times and sits in the dead letter queue")
                .metric(this.deadLetterQueue.metricApproximateNumberOfMessagesVisible(
                        software.amazon.awscdk.services.cloudwatch.MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .statistic("Maximum")
                                .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();
        this.sendLambda.healthChecks.add(deadLetterAlarm);
        Lambda.stackHealthAlarm(this, prefix, "email", List.of(this.sendLambda, this.eventLambda));

        cfnOutput(this, "CustomerEmailQueueUrl", this.queue.getQueueUrl());
        cfnOutput(this, "CustomerEmailIdentityArn", this.identity.getEmailIdentityArn());
        cfnOutput(this, "CustomerEmailSendLambdaArn", this.sendLambda.ingestLambda.getFunctionArn());

        infof("EmailStack %s created successfully for %s", this.getNode().getId(), prefix);
    }
}
