/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.List;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.AlarmRule;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.CompositeAlarm;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
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
import software.amazon.awscdk.services.logs.FilterPattern;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.LogGroupProps;
import software.amazon.awscdk.services.logs.MetricFilter;
import software.constructs.Construct;

public class Lambda {

    /** Alarm names starting with this are terms of a composite and are not routed to Telegram or GitHub. */
    public static final String CHECK_ALARM_NAME_PREFIX = "check-";

    public static final String HEALTH_ALARM_NAME_SUFFIX = "-health";

    public final DockerImageCode dockerImage;
    public final Function ingestLambda;
    public final Version ingestLambdaVersion;
    public final Alias ingestLambdaAlias;
    public final String ingestLambdaAliasArn;
    public final ILogGroup logGroup;
    public final AbstractLambdaProps props;

    public Lambda(final Construct scope, AbstractLambdaProps props) {
        this.props = props;

        // Create the lambda function
        var imageCodeProps = EcrImageCodeProps.builder()
                .tagOrDigest(props.baseImageTag()) // e.g. "latest" or specific digest for immutability
                .cmd(List.of(props.ingestHandler()))
                .build();
        var repositoryAttributes = RepositoryAttributes.builder()
                .repositoryArn(props.ecrRepositoryArn())
                .repositoryName(props.ecrRepositoryName())
                .build();
        IRepository repository =
                Repository.fromRepositoryAttributes(scope, props.idPrefix() + "-EcrRepo", repositoryAttributes);
        this.dockerImage = DockerImageCode.fromEcr(repository, imageCodeProps);

        // Create log group for the lambda
        if (props.logGroup().isPresent()) {
            this.logGroup = props.logGroup().get();
            infof(
                    "Using custom log group name %s for Lambda %s",
                    this.logGroup.getNode().getId(), props.ingestFunctionName());
        } else {
            this.logGroup = new LogGroup(
                    scope,
                    props.idPrefix() + "LogGroup",
                    LogGroupProps.builder()
                            .logGroupName("/aws/lambda/" + props.ingestFunctionName())
                            .retention(props.logGroupRetention())
                            .removalPolicy(props.logGroupRemovalPolicy())
                            .build());
            infof(
                    "Created log group %s with retention %s for Lambda %s",
                    this.logGroup.getNode().getId(), props.logGroupRetention(), props.ingestFunctionName());
        }

        // Add X-Ray environment variables if enabled
        var environment = new java.util.HashMap<>(props.environment());
        environment.put("AWS_XRAY_TRACING_NAME", props.ingestFunctionName());
        var dockerFunctionBuilder = DockerImageFunction.Builder.create(scope, props.idPrefix() + "-fn")
                .code(this.dockerImage)
                .environment(environment)
                .functionName(props.ingestFunctionName())
                .timeout(props.ingestLambdaTimeout())
                .memorySize(props.ingestMemorySize())
                .architecture(props.ingestArchitecture())
                .logGroup(this.logGroup)
                .tracing(Tracing.ACTIVE);
        if (props.role().isPresent()) {
            dockerFunctionBuilder.role(props.role().get());
        }
        this.ingestLambda = dockerFunctionBuilder.build();
        infof("Created Lambda %s with function %s", this.ingestLambda.getNode().getId(), this.ingestLambda.toString());

        this.ingestLambdaVersion = Version.Builder.create(scope, props.idPrefix() + "-ingest-version")
                .lambda(this.ingestLambda)
                .description("Image: " + props.baseImageTag())
                .removalPolicy(RemovalPolicy.RETAIN)
                .build();
        // Lambda Version resources with: RemovalPolicy.RETAIN
        //   Versions are immutable and cheap
        //   Leaving an orphaned version is safe
        //   Prevents stack delete deadlocks
        //   AWS themselves recommend this for PC-heavy setups (quietly)
        this.ingestLambdaAlias = Alias.Builder.create(scope, props.idPrefix() + "-ingest-alias")
                .aliasName(props.provisionedConcurrencyAliasName())
                .version(this.ingestLambdaVersion)
                .provisionedConcurrentExecutions(props.ingestProvisionedConcurrency())
                .build();
        this.ingestLambdaAliasArn =
                "%s:%s".formatted(this.ingestLambda.getFunctionArn(), this.ingestLambdaAlias.getAliasName());
        infof(
                "Created ingest Lambda alias %s for version %s with arn %s",
                this.ingestLambdaAlias.getAliasName(),
                this.ingestLambdaVersion.getVersion(),
                props.ingestProvisionedConcurrencyAliasArn());

        // Alarms: a small set of useful, actionable Lambda alarms
        // 1) Errors >= 1 in a 5-minute period
        Alarm errorsAlarm = Alarm.Builder.create(scope, props.idPrefix() + "-ErrorsAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + props.ingestFunctionName() + "-errors")
                .metric(this.ingestLambda
                        .metricErrors()
                        .with(MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(1)
                .evaluationPeriods(props.errorsAlarmEvaluationPeriods())
                .datapointsToAlarm(props.errorsAlarmDatapointsToAlarm())
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda errors >= 1 for function " + this.ingestLambda.getFunctionName())
                .build();

        // 2) Throttles >= 1 in a 5-minute period
        Alarm throttlesAlarm = Alarm.Builder.create(scope, props.idPrefix() + "-ThrottlesAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + props.ingestFunctionName() + "-throttles")
                .metric(this.ingestLambda
                        .metricThrottles()
                        .with(MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda throttles >= 1 for function " + this.ingestLambda.getFunctionName())
                .build();

        // 3) High duration (p95) approaching timeout (>= 80% of configured timeout)
        // Lambda Duration metric unit is milliseconds. Convert timeout to ms and apply 80% threshold.
        double timeoutMs = props.ingestLambdaTimeout().toSeconds().doubleValue() * 1000.0;
        double highDurationThresholdMs = timeoutMs * 0.8;
        Alarm highDurationP95Alarm = Alarm.Builder.create(scope, props.idPrefix() + "-HighDurationP95Alarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + props.ingestFunctionName() + "-high-duration-p95")
                .metric(this.ingestLambda
                        .metricDuration()
                        .with(MetricOptions.builder()
                                .statistic("p95")
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(highDurationThresholdMs)
                .evaluationPeriods(props.highDurationP95AlarmEvaluationPeriods())
                .datapointsToAlarm(props.highDurationP95AlarmDatapointsToAlarm())
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(
                        "Lambda p95 duration >= 80% of timeout for function " + this.ingestLambda.getFunctionName())
                .build();

        // 4) Log-based error detection using a CloudWatch Logs Metric Filter
        // This avoids external scanners: we scan for common error terms in logs and emit a custom metric.
        String logErrorMetricNamespace = "Submit/LambdaLogs";
        String logErrorMetricName = this.ingestLambda.getFunctionName() + "-log-errors";
        MetricFilter.Builder.create(scope, props.idPrefix() + "-LogErrorsMetricFilter")
                .logGroup(this.logGroup)
                .filterPattern(FilterPattern.anyTerm(
                        "ERROR", "Error", "Exception", "Unhandled", "Task timed out", "SEVERE", "FATAL"))
                .metricNamespace(logErrorMetricNamespace)
                .metricName(logErrorMetricName)
                .metricValue("1")
                .defaultValue(0)
                .build();

        Metric logErrorMetric = Metric.Builder.create()
                .namespace(logErrorMetricNamespace)
                .metricName(logErrorMetricName)
                .statistic("Sum")
                .period(Duration.minutes(5))
                .build();

        Alarm logErrorsAlarm = Alarm.Builder.create(scope, props.idPrefix() + "-LogErrorsAlarm")
                // props.ingestFunctionName(), not this.ingestLambda.getFunctionName(): the latter
                // renders as an unresolved Fn::Join/Ref token in the synthesized template (same
                // physical value, but the composite alarm and its EventBridge routing both need a
                // synth-time literal to match the name-prefix contract against).
                .alarmName(CHECK_ALARM_NAME_PREFIX + props.ingestFunctionName() + "-log-errors")
                .metric(logErrorMetric)
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Detected >= 1 error-like log line in the last 5 minutes for function "
                        + this.ingestLambda.getFunctionName())
                .build();

        // Composite health alarm: fans in the four checks above into one notification so a
        // broken function raises one Telegram message and one GitHub issue instead of four.
        // The children above keep the "check-" prefix and stay out of OpsStack's routing rule;
        // only this composite carries the deployment/environment prefix that rule matches on.
        CompositeAlarm.Builder.create(scope, props.idPrefix() + "-HealthAlarm")
                .compositeAlarmName(props.ingestFunctionName() + HEALTH_ALARM_NAME_SUFFIX)
                .alarmRule(AlarmRule.anyOf(errorsAlarm, throttlesAlarm, highDurationP95Alarm, logErrorsAlarm))
                .alarmDescription("Health check failed for function " + this.ingestLambda.getFunctionName()
                        + ": errors, throttles, p95 duration near timeout, or error-like log lines")
                .build();
    }
}
