/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.List;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.IAlarm;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.Alias;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.lambda.Version;
import software.amazon.awscdk.services.lambda.eventsources.SqsEventSource;
import software.amazon.awscdk.services.sqs.DeadLetterQueue;
import software.amazon.awscdk.services.sqs.Queue;
import software.constructs.Construct;

public class AsyncApiLambda extends ApiLambda {

    /** How many checks this construct adds under {@link Lambda#stackHealthAlarm}. */
    public static final int ASYNC_HEALTH_CHECK_COUNT = 3;

    public final Function workerLambda;
    public final Version workerLambdaVersion;
    public final Alias workerLambdaAlias;
    public final String workerLambdaAliasArn;
    public final Queue queue;
    public final Queue dlq;
    private final AsyncApiLambdaProps asyncProps;

    public AsyncApiLambda(final Construct scope, AsyncApiLambdaProps props) {
        super(scope, props);
        this.asyncProps = props;

        // 1. Create DLQ
        this.dlq = Queue.Builder.create(scope, props.idPrefix() + "-dlq")
                .queueName(props.workerDeadLetterQueueName())
                .build();

        // 2. Create Main Queue
        this.queue = Queue.Builder.create(scope, props.idPrefix() + "-queue")
                .queueName(props.workerQueueName())
                .visibilityTimeout(props.queueVisibilityTimeout())
                .deadLetterQueue(DeadLetterQueue.builder()
                        .maxReceiveCount(props.workerMaxReceiveCount())
                        .queue(this.dlq)
                        .build())
                .build();

        // 3. Create Worker Lambda
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag())
                .cmd(List.of(props.workerHandler()))
                .build();

        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn())
                .repositoryName(props.ecrRepositoryName())
                .build();
        IRepository repository =
                Repository.fromRepositoryAttributes(scope, props.idPrefix() + "-EcrRepo-worker", repositoryAttributes);

        this.workerLambda = DockerImageFunction.Builder.create(scope, props.idPrefix() + "-worker-fn")
                .code(DockerImageCode.fromEcr(repository, imageCodeProps))
                .environment(props.environment())
                .functionName(props.workerFunctionName())
                .timeout(props.workerLambdaTimeout())
                .memorySize(props.workerMemorySize())
                .architecture(props.workerArchitecture())
                .logGroup(this.logGroup)
                .tracing(Tracing.ACTIVE)
                .build();

        this.workerLambdaVersion = Version.Builder.create(scope, props.idPrefix() + "-worker-version")
                .lambda(this.workerLambda)
                .description("Image: " + props.baseImageTag())
                .removalPolicy(RemovalPolicy.RETAIN)
                .build();
        this.workerLambdaAlias = Alias.Builder.create(scope, props.idPrefix() + "-worker-zero-alias")
                .aliasName("zero")
                .version(this.workerLambdaVersion)
                .provisionedConcurrentExecutions(props.workerProvisionedConcurrency())
                .build();
        this.workerLambdaAliasArn =
                "%s:%s".formatted(this.workerLambda.getFunctionArn(), this.workerLambdaAlias.getAliasName());
        infof(
                "Created worker Lambda alias %s for version %s with arn %s",
                this.workerLambdaAlias.getAliasName(),
                this.workerLambdaVersion.getVersion(),
                props.workerProvisionedConcurrencyAliasArn());

        // 4. Set up SQS trigger
        this.workerLambdaAlias.addEventSource(
                SqsEventSource.Builder.create(this.queue).batchSize(1).build());

        // Grant API Lambda permission to send messages to the queue
        this.queue.grantSendMessages(this.ingestLambda);

        // Pass queue URL to both lambdas
        this.ingestLambda.addEnvironment("SQS_QUEUE_URL", this.queue.getQueueUrl());
        this.workerLambda.addEnvironment("SQS_QUEUE_URL", this.queue.getQueueUrl());
    }

    @Override
    protected void addFunctionChecks() {
        super.addFunctionChecks();
        // The queue, DLQ and worker checks below are named like the per-function checks in
        // Lambda, and for the same reason: they are terms of the owning stack's composite health
        // alarm, so they carry the "check-" prefix that keeps them out of OpsStack's routing rule
        // and the composite raises one alert for the pair. The alarm names take their queue and
        // function names from props, not from the L2 getters, because the getters render as
        // unresolved tokens and the name prefix has to be a synth-time literal.
        Alarm dlqNotEmptyAlarm = dlqNotEmptyAlarm();
        Alarm workerErrorsAlarm = Alarm.Builder.create(this.scope, this.asyncProps.idPrefix() + "-WorkerErrorsAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.asyncProps.workerFunctionName() + "-errors")
                .metric(this.workerLambda.metricErrors())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Worker Lambda errors for " + this.workerLambda.getFunctionName())
                .build();
        Alarm queueMessageAgeAlarm = queueMessageAgeAlarm();
        this.healthChecks.addAll(List.of(dlqNotEmptyAlarm, workerErrorsAlarm, queueMessageAgeAlarm));
    }

    /** The worker logs to the ingest function's log group, so its errors need no check of their own here. */
    @Override
    protected List<IAlarm> addQueueChecks() {
        return List.of(dlqNotEmptyAlarm(), queueMessageAgeAlarm());
    }

    private Alarm dlqNotEmptyAlarm() {
        return Alarm.Builder.create(this.scope, this.asyncProps.idPrefix() + "-DlqAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.asyncProps.workerDeadLetterQueueName() + "-not-empty")
                .metric(this.dlq.metricApproximateNumberOfMessagesVisible())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("SQS DLQ for " + this.asyncProps.ingestFunctionName() + " has items")
                .build();
    }

    // A message stuck in the queue for >= 30 minutes indicates the worker is stalled or backed up.
    private Alarm queueMessageAgeAlarm() {
        return Alarm.Builder.create(this.scope, this.asyncProps.idPrefix() + "-QueueMessageAgeAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.asyncProps.workerQueueName() + "-message-age")
                .metric(this.queue.metricApproximateAgeOfOldestMessage())
                .threshold(Duration.minutes(30).toSeconds())
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(
                        "SQS message age >= 30 minutes for queue " + this.queue.getQueueName() + " (worker stalled)")
                .build();
    }
}
