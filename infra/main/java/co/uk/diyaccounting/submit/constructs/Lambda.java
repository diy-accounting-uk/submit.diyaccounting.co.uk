/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import java.util.ArrayList;
import java.util.List;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.AlarmRule;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.CompositeAlarm;
import software.amazon.awscdk.services.cloudwatch.IAlarm;
import software.amazon.awscdk.services.cloudwatch.IAlarmRule;
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

    public static final String HEALTH_ALARM_NAME_SUFFIX = "-stack-health";

    /** How many checks every Lambda construct carries. */
    public static final int HEALTH_CHECK_COUNT = 2;

    /** CloudWatch accepts at most this many operands in one composite alarm rule. */
    private static final int ALARM_RULE_MAX_OPERANDS = 100;

    public final DockerImageCode dockerImage;
    public final Function ingestLambda;
    public final Version ingestLambdaVersion;
    public final Alias ingestLambdaAlias;
    public final String ingestLambdaAliasArn;
    public final ILogGroup logGroup;
    public final AbstractLambdaProps props;

    /** The checks on this function, for the owning stack to fan into its health alarm. */
    public final List<IAlarm> healthChecks = new ArrayList<>();

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

        // Two checks per function, one per way a function can be broken: the invocation failed
        // (Errors), or it returned a response while logging something that went wrong (log
        // errors, which the handlers' caught-and-returned 500s produce without an Errors
        // datapoint).
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

        // 2) Log-based error detection using a CloudWatch Logs Metric Filter
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

        this.healthChecks.addAll(List.of(errorsAlarm, logErrorsAlarm));
    }

    /**
     * Fans every check of every Lambda in one stack into a single composite alarm, including the
     * queue, DLQ and worker checks an {@link AsyncApiLambda} adds. The children
     * keep the "check-" prefix and stay outside OpsStack's routing rule; only this composite
     * carries the deployment or environment prefix that rule matches on, so a stack full of broken
     * functions raises one Telegram message and one GitHub issue. The composite's state reason
     * names the check that tripped, which names the function.
     */
    public static CompositeAlarm stackHealthAlarm(
            final Construct scope, String resourceNamePrefix, String stackShortName, List<Lambda> functions) {
        var checks = new ArrayList<IAlarmRule>();
        for (Lambda function : functions) {
            checks.addAll(function.healthChecks);
        }
        return CompositeAlarm.Builder.create(scope, "StackHealthAlarm")
                .compositeAlarmName(resourceNamePrefix + "-" + stackShortName + HEALTH_ALARM_NAME_SUFFIX)
                .alarmRule(anyOf(checks))
                .alarmDescription("A health check failed in " + stackShortName + ": one of its Lambda functions "
                        + "reported errors or error-like log lines, or one of its async pairs has a stuck queue "
                        + "or a failing worker. The alarm state reason names the check that tripped.")
                .build();
    }

    private static IAlarmRule anyOf(List<IAlarmRule> rules) {
        if (rules.size() <= ALARM_RULE_MAX_OPERANDS) {
            return AlarmRule.anyOf(rules.toArray(new IAlarmRule[0]));
        }
        var groups = new ArrayList<IAlarmRule>();
        for (int start = 0; start < rules.size(); start += ALARM_RULE_MAX_OPERANDS) {
            groups.add(anyOf(rules.subList(start, Math.min(start + ALARM_RULE_MAX_OPERANDS, rules.size()))));
        }
        return anyOf(groups);
    }
}
