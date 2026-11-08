/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.constructs.Lambda.CHECK_ALARM_NAME_PREFIX;

import co.uk.diyaccounting.submit.utils.IntegrationCallAccess;
import java.util.List;
import java.util.Map;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.IAlarm;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Tracing;
import software.amazon.awscdk.services.lambda.eventsources.SqsEventSource;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.sqs.DeadLetterQueue;
import software.amazon.awscdk.services.sqs.Queue;
import software.amazon.awscdk.services.sqs.QueueEncryption;
import software.constructs.Construct;

/**
 * A queue, its dead letter queue and the Lambda that consumes it, with no HTTP ingest Lambda.
 * {@link AsyncApiLambda} always adds an ingest Lambda for a route, which a queue filled by other
 * functions does not need.
 *
 * <p>Both queues use SQS-managed encryption and refuse requests that do not use TLS. The
 * consumer retries a message {@link #maxReceiveCount} times and then moves it to the dead letter
 * queue. The two queue alarms join the owning stack's health alarm through
 * {@link #addQueueChecks()}.
 */
public class QueueWorkerLambda {

    /** Receives of one message before it moves to the dead letter queue. */
    public static final int MAX_RECEIVE_COUNT = 3;

    public final Queue queue;
    public final Queue dlq;
    public final Function workerLambda;
    private final Construct scope;
    private final String idPrefix;
    private final String queueName;
    private final String deadLetterQueueName;

    public QueueWorkerLambda(
            final Construct scope,
            String idPrefix,
            String workerFunctionName,
            String workerHandler,
            String queueName,
            String deadLetterQueueName,
            String baseImageTag,
            String ecrRepositoryName,
            String ecrRepositoryArn,
            Duration workerTimeout,
            Duration queueVisibilityTimeout,
            Duration queueRetention,
            Duration deadLetterQueueRetention,
            int maxConcurrency,
            Map<String, String> environment) {
        this.scope = scope;
        this.idPrefix = idPrefix;
        this.queueName = queueName;
        this.deadLetterQueueName = deadLetterQueueName;

        this.dlq = Queue.Builder.create(scope, idPrefix + "-dlq")
                .queueName(deadLetterQueueName)
                .retentionPeriod(deadLetterQueueRetention)
                .encryption(QueueEncryption.SQS_MANAGED)
                .enforceSsl(true)
                .build();
        this.queue = Queue.Builder.create(scope, idPrefix + "-queue")
                .queueName(queueName)
                .retentionPeriod(queueRetention)
                .visibilityTimeout(queueVisibilityTimeout)
                .encryption(QueueEncryption.SQS_MANAGED)
                .enforceSsl(true)
                .deadLetterQueue(DeadLetterQueue.builder()
                        .maxReceiveCount(MAX_RECEIVE_COUNT)
                        .queue(this.dlq)
                        .build())
                .build();

        IRepository repository = Repository.fromRepositoryAttributes(
                scope,
                idPrefix + "-EcrRepo-worker",
                RepositoryAttributes.builder()
                        .repositoryArn(ecrRepositoryArn)
                        .repositoryName(ecrRepositoryName)
                        .build());
        var logGroup = LogGroup.Builder.create(scope, idPrefix + "-LogGroup")
                .logGroupName("/aws/lambda/" + workerFunctionName)
                .retention(RetentionDays.ONE_WEEK)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();
        this.workerLambda = DockerImageFunction.Builder.create(scope, idPrefix + "-worker-fn")
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(baseImageTag)
                                .cmd(List.of(workerHandler))
                                .build()))
                .environment(environment)
                .functionName(workerFunctionName)
                .timeout(workerTimeout)
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .logGroup(logGroup)
                .tracing(Tracing.ACTIVE)
                .build();
        IntegrationCallAccess.grantWhenRecording(this.workerLambda, environment);

        this.workerLambda.addEventSource(SqsEventSource.Builder.create(this.queue)
                .batchSize(1)
                .maxConcurrency(maxConcurrency)
                .build());
    }

    /**
     * The queue checks for the owning stack's health alarm: the dead letter queue holds a message,
     * and the oldest message in the queue is 30 minutes old. Named like the checks of an
     * {@link AsyncApiLambda}, so the composite alarm raises one alert for the stack.
     */
    public List<IAlarm> addQueueChecks() {
        Alarm dlqNotEmpty = AlarmChain.chained(Alarm.Builder.create(this.scope, this.idPrefix + "-DlqAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.deadLetterQueueName + "-not-empty")
                .metric(this.dlq.metricApproximateNumberOfMessagesVisible())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(
                        "SQS DLQ " + this.deadLetterQueueName + " has items: HMRC's validator gave no verdict")
                .build());
        Alarm messageAge = AlarmChain.chained(Alarm.Builder.create(this.scope, this.idPrefix + "-QueueMessageAgeAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.queueName + "-message-age")
                .metric(this.queue.metricApproximateAgeOfOldestMessage())
                .threshold(Duration.minutes(30).toSeconds())
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("SQS message age >= 30 minutes for queue " + this.queueName + " (worker stalled)")
                .build());
        return List.of(dlqNotEmpty, messageAge);
    }
}
