/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability OPS-124 Define shared Lambda CDK constructs
// - **Use when:** a new Lambda-backed stack needs the common function, alias and health-alarm wiring instead of rebuilding it.
// - **Does:** Lambda and LambdaProps, with their AbstractLambdaProps and AbstractApiLambdaProps base, wrap the common CDK wiring every Lambda-backed stack reuses: function, alias and health alarm. ApiLambda and AsyncApiLambda specialize it for synchronous and async API integrations, and EdgeLambdaConstruct specializes it for CloudFront@Edge functions.
// - **Run:** no command; see Does and Entry
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java`; `infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambda.java`; `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaConstruct.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaConstruct.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/LambdaProps.java
// - **Keywords:** cdk lambda construct, health alarm, api lambda, edge lambda, shared construct
// - **Related:** OPS-123
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Token;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.AlarmRule;
import software.amazon.awscdk.services.cloudwatch.AlarmState;
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

    /** Deployment sets in this environment carry no per-function checks. */
    public static final String CI_ENV_NAME = "ci";

    /** The namespace of the metrics the Lambda log metric filters publish. */
    public static final String LOG_METRIC_NAMESPACE = "Submit/LambdaLogs";

    /** A deployment set's shared invocation-errors metric and alarm are named {@code <prefix>-lambda-errors}. */
    public static final String DEPLOYMENT_ERRORS_SUFFIX = "-lambda-errors";

    /** The lines the Node.js runtime writes for an invocation that Lambda counts as an error. */
    static final String[] INVOCATION_ERROR_LOG_TERMS = {
        "Invoke Error", "Uncaught Exception", "Unhandled Promise Rejection", "Task timed out", "Runtime exited"
    };

    private static final String REST_PATH_PREFIX = "/api/v1/";

    /** How many checks a Lambda construct carries under {@link #stackHealthAlarm}. */
    public static final int HEALTH_CHECK_COUNT = 2;

    /** CloudWatch accepts at most this many operands in one composite alarm rule. */
    private static final int ALARM_RULE_MAX_OPERANDS = 100;

    /** CloudWatch accepts alarm rules no longer than this (10240 chars). */
    private static final int ALARM_RULE_MAX_CHARS = 10240;

    /**
     * Cap estimated chunk size at this many characters to stay well under the 10240 limit and
     * account for CloudFormation's Fn::Join rendering overhead.
     */
    private static final int ALARM_RULE_CHUNK_TARGET_CHARS = 9000;

    public final DockerImageCode dockerImage;
    public final Function ingestLambda;
    public final Version ingestLambdaVersion;
    public final Alias ingestLambdaAlias;
    public final String ingestLambdaAliasArn;
    public final ILogGroup logGroup;
    public final AbstractLambdaProps props;

    /** The scope the function was built in; its checks are created there too. */
    protected final Construct scope;

    /** The checks on this function, for the owning stack to fan into its health alarm. */
    public final List<IAlarm> healthChecks = new ArrayList<>();

    public Lambda(final Construct scope, AbstractLambdaProps props) {
        this.props = props;
        this.scope = scope;

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
        if (props.ingestReservedConcurrentExecutions().isPresent()) {
            dockerFunctionBuilder.reservedConcurrentExecutions(
                    props.ingestReservedConcurrentExecutions().get());
        }
        this.ingestLambda = dockerFunctionBuilder.build();
        OperatorEmailsHelper.grantWhenPublishingActivity(this.ingestLambda, environment);
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
    }

    /**
     * Creates this function's own checks, in the scope the function was built in so their logical
     * ids do not depend on which stack method asks for them.
     */
    protected void addFunctionChecks() {
        // Two checks per function, one per way a function can be broken: the invocation failed
        // (Errors), or it returned a response while logging something that went wrong (log
        // errors, which the handlers' caught-and-returned 500s produce without an Errors
        // datapoint).
        // 1) Errors >= 1 in a 5-minute period
        Alarm errorsAlarm = Alarm.Builder.create(this.scope, this.props.idPrefix() + "-ErrorsAlarm")
                .alarmName(CHECK_ALARM_NAME_PREFIX + this.props.ingestFunctionName() + "-errors")
                .metric(this.ingestLambda
                        .metricErrors()
                        .with(MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(1)
                .evaluationPeriods(this.props.errorsAlarmEvaluationPeriods())
                .datapointsToAlarm(this.props.errorsAlarmDatapointsToAlarm())
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("Lambda errors >= 1 for function " + this.ingestLambda.getFunctionName())
                .build();

        // 2) Log-based error detection using a CloudWatch Logs Metric Filter
        // This avoids external scanners: we scan for common error terms in logs and emit a custom metric.
        String logErrorMetricName = this.ingestLambda.getFunctionName() + "-log-errors";
        addLogErrorsMetricFilter(logErrorMetricName);
        // props.ingestFunctionName(), not this.ingestLambda.getFunctionName(): the latter
        // renders as an unresolved Fn::Join/Ref token in the synthesized template (same
        // physical value, but the composite alarm and its EventBridge routing both need a
        // synth-time literal to match the name-prefix contract against).
        Alarm logErrorsAlarm = logErrorsAlarm(
                this.scope,
                this.props.idPrefix() + "-LogErrorsAlarm",
                CHECK_ALARM_NAME_PREFIX + this.props.ingestFunctionName() + "-log-errors",
                logErrorMetricName,
                "Detected >= 1 error-like log line in the last 5 minutes for function "
                        + this.ingestLambda.getFunctionName());

        this.healthChecks.addAll(List.of(errorsAlarm, logErrorsAlarm));
    }

    /** Counts this function's error-like log lines into the named metric. */
    private void addLogErrorsMetricFilter(String metricName) {
        MetricFilter.Builder.create(this.scope, this.props.idPrefix() + "-LogErrorsMetricFilter")
                .logGroup(this.logGroup)
                .filterPattern(FilterPattern.anyTerm(
                        "ERROR", "Error", "Exception", "Unhandled", "Task timed out", "SEVERE", "FATAL"))
                .metricNamespace(LOG_METRIC_NAMESPACE)
                .metricName(metricName)
                .metricValue("1")
                .defaultValue(0)
                .build();
    }

    /**
     * Counts this function's failed invocations into the deployment set's shared metric. The
     * Node.js runtime writes one of these lines for every invocation that Lambda counts in its
     * own Errors metric: an unhandled error, a crash or a timeout.
     */
    private void addInvocationErrorsMetricFilter(String resourceNamePrefix) {
        MetricFilter.Builder.create(this.scope, this.props.idPrefix() + "-InvocationErrorsMetricFilter")
                .logGroup(this.logGroup)
                .filterPattern(FilterPattern.anyTerm(INVOCATION_ERROR_LOG_TERMS))
                .metricNamespace(LOG_METRIC_NAMESPACE)
                .metricName(resourceNamePrefix + DEPLOYMENT_ERRORS_SUFFIX)
                .metricValue("1")
                .defaultValue(0)
                .build();
    }

    /** The checks on this function's queues; a plain function has none. */
    protected List<IAlarm> addQueueChecks() {
        return List.of();
    }

    private static Alarm logErrorsAlarm(
            Construct scope, String id, String alarmName, String metricName, String description) {
        return Alarm.Builder.create(scope, id)
                .alarmName(alarmName)
                .metric(Metric.Builder.create()
                        .namespace(LOG_METRIC_NAMESPACE)
                        .metricName(metricName)
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription(description)
                .build();
    }

    /**
     * The one invocation-errors alarm of a deployment set. Every function the set's stacks pass to
     * {@link #appStackHealthAlarm} counts its failed invocations into one metric, so one alarm on
     * one metric covers them all. Lambda's own per-function Errors metric cannot do this: an alarm
     * sums at most 10 metrics, and an alarm over a Metrics Insights query is billed per metric it
     * reads. A ci set has no such alarm. The name carries the deployment prefix, so OpsStack's
     * rule routes it directly.
     */
    public static Optional<Alarm> deploymentErrorsAlarm(
            final Construct scope, String envName, String resourceNamePrefix) {
        if (CI_ENV_NAME.equals(envName)) {
            return Optional.empty();
        }
        String name = resourceNamePrefix + DEPLOYMENT_ERRORS_SUFFIX;
        return Optional.of(Alarm.Builder.create(scope, "DeploymentLambdaErrorsAlarm")
                .alarmName(name)
                .metric(Metric.Builder.create()
                        .namespace(LOG_METRIC_NAMESPACE)
                        .metricName(name)
                        .statistic("Sum")
                        .period(Duration.minutes(5))
                        .build())
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("A Lambda function of " + resourceNamePrefix
                        + " failed an invocation (unhandled error, crash or timeout) in the last 5 minutes."
                        + " The per-function Errors graphs on the dashboard name the function.")
                .build());
    }

    /**
     * The health alarm of a deployment-set stack. A ci set is short-lived and proved by its own
     * behaviour tests, so its functions carry no checks, metric filters or composite at all.
     *
     * <p>Any other environment gets three kinds of check, fanned into the stack's composite:
     *
     * <ul>
     *   <li>invocation errors: each function feeds the set's shared metric, which {@link
     *       #deploymentErrorsAlarm} watches;
     *   <li>error-like log lines: one alarm per REST resource ({@code /api/v1/<resource>}) for the
     *       functions under it, and one alarm of its own for every function that calls an external
     *       API ({@link AbstractLambdaProps#callsExternalApi()}) or serves no REST resource;
     *   <li>queue checks: the DLQ and message-age alarms of every async pair that calls an external
     *       API; the other pairs share one DLQ alarm and one message-age alarm per group of up to
     *       10.
     * </ul>
     *
     * <p>A shared alarm is named after the longest name prefix its functions have in common, so
     * the name read out of the composite's rule is also a log group prefix that holds them all.
     */
    public static Optional<CompositeAlarm> appStackHealthAlarm(
            final Construct scope,
            String envName,
            String resourceNamePrefix,
            String stackShortName,
            List<Lambda> functions) {
        if (CI_ENV_NAME.equals(envName)) {
            return Optional.empty();
        }
        var logErrorsGroups = new LinkedHashMap<String, List<Lambda>>();
        for (Lambda function : functions) {
            function.addInvocationErrorsMetricFilter(resourceNamePrefix);
            logErrorsGroups
                    .computeIfAbsent(function.logErrorsGroupKey(), key -> new ArrayList<>())
                    .add(function);
        }
        var checks = new ArrayList<IAlarm>();
        for (List<Lambda> members : logErrorsGroups.values()) {
            if (members.size() == 1) {
                Lambda function = members.get(0);
                String metricName = function.props.ingestFunctionName() + "-log-errors";
                function.addLogErrorsMetricFilter(metricName);
                checks.add(logErrorsAlarm(
                        function.scope,
                        function.props.idPrefix() + "-LogErrorsAlarm",
                        CHECK_ALARM_NAME_PREFIX + metricName,
                        metricName,
                        "Detected >= 1 error-like log line in the last 5 minutes for function "
                                + function.props.ingestFunctionName()));
                continue;
            }
            String label = commonNameLabel(resourceNamePrefix, members);
            String metricName = resourceNamePrefix + "-" + label + "-log-errors";
            var memberNames = new ArrayList<String>();
            for (Lambda member : members) {
                member.addLogErrorsMetricFilter(metricName);
                memberNames.add(member.props.ingestFunctionName());
            }
            checks.add(logErrorsAlarm(
                    scope,
                    "LogErrorsAlarm-" + label,
                    CHECK_ALARM_NAME_PREFIX + metricName,
                    metricName,
                    "Detected >= 1 error-like log line in the last 5 minutes in one of the functions "
                            + String.join(", ", memberNames)));
        }
        var groupedAsync = new ArrayList<AsyncApiLambda>();
        for (Lambda function : functions) {
            checks.addAll(function.addQueueChecks());
            if (function instanceof AsyncApiLambda async && !async.props.callsExternalApi()) {
                groupedAsync.add(async);
            }
        }
        if (!groupedAsync.isEmpty()) {
            checks.addAll(AsyncApiLambda.groupedQueueChecks(scope, resourceNamePrefix, stackShortName, groupedAsync));
        }
        return Optional.of(compositeHealthAlarm(scope, resourceNamePrefix, stackShortName, checks));
    }

    /**
     * The functions under one REST resource share a log-errors alarm. A function that calls an
     * external API, or serves no REST resource, is a group of its own.
     */
    private String logErrorsGroupKey() {
        String own = "function:" + this.props.ingestFunctionName();
        if (this.props.callsExternalApi() || !(this.props instanceof AbstractApiLambdaProps apiProps)) {
            return own;
        }
        String path = apiProps.urlPath();
        if (!path.startsWith(REST_PATH_PREFIX)) {
            return own;
        }
        return "resource:" + path.substring(REST_PATH_PREFIX.length()).split("/")[0];
    }

    /**
     * The longest whole-word prefix the functions' names share after the deployment prefix, e.g.
     * {@code pass} for {@code pass-get} and {@code pass-admin-post}.
     */
    private static String commonNameLabel(String resourceNamePrefix, List<Lambda> members) {
        List<String> common = null;
        for (Lambda member : members) {
            String name = member.props.ingestFunctionName();
            if (!name.startsWith(resourceNamePrefix + "-")) {
                throw new IllegalStateException("Function " + name + " does not start with " + resourceNamePrefix);
            }
            List<String> words =
                    List.of(name.substring(resourceNamePrefix.length() + 1).split("-"));
            if (common == null) {
                common = words;
                continue;
            }
            int shared = 0;
            while (shared < common.size()
                    && shared < words.size()
                    && common.get(shared).equals(words.get(shared))) {
                shared++;
            }
            common = common.subList(0, shared);
        }
        if (common == null || common.isEmpty()) {
            var names = new ArrayList<String>();
            members.forEach(member -> names.add(member.props.ingestFunctionName()));
            throw new IllegalStateException("The functions under one REST resource share no name prefix, so their"
                    + " log-errors alarm has no log group prefix to name: " + names
                    + ". Rename them to share one, or mark the odd one callsExternalApi.");
        }
        return String.join("-", common);
    }

    /**
     * Holds an alarm with its estimated operand length in the rule.
     */
    private static class AlarmInfo {
        final IAlarm alarm;
        final int estimatedOperandLength;

        AlarmInfo(IAlarm alarm, String alarmName) {
            this.alarm = alarm;
            this.estimatedOperandLength = estimateAlarmOperandLength(alarmName);
        }
    }

    /**
     * Fans every check of every Lambda in one stack into a single composite alarm, including the
     * queue, DLQ and worker checks an {@link AsyncApiLambda} adds. The children
     * keep the "check-" prefix and stay outside OpsStack's routing rule; only this composite
     * carries the deployment or environment prefix that rule matches on, so a stack full of broken
     * functions raises one Telegram message and one GitHub issue. The composite's state reason
     * names the check that tripped, which names the function.
     *
     * When the fan-in rule would exceed CloudWatch's 10240 character limit, creates intermediate
     * group composites (`StackHealthAlarmGroup1`, `Group2`, etc.) and has the top-level alarm
     * reference those groups.
     */
    public static CompositeAlarm stackHealthAlarm(
            final Construct scope, String resourceNamePrefix, String stackShortName, List<Lambda> functions) {
        var checks = new ArrayList<IAlarm>();
        for (Lambda function : functions) {
            function.addFunctionChecks();
            checks.addAll(function.healthChecks);
        }
        return compositeHealthAlarm(scope, resourceNamePrefix, stackShortName, checks);
    }

    private static CompositeAlarm compositeHealthAlarm(
            final Construct scope, String resourceNamePrefix, String stackShortName, List<IAlarm> checks) {
        // Build list of alarms with their estimated lengths
        var alarmInfos = new ArrayList<AlarmInfo>();
        for (IAlarm alarm : checks) {
            alarmInfos.add(new AlarmInfo(alarm, alarm.getAlarmName()));
        }

        // Calculate estimated total rule length if all alarms were in one composite
        int totalEstimatedLength = 0;
        for (int i = 0; i < alarmInfos.size(); i++) {
            totalEstimatedLength += alarmInfos.get(i).estimatedOperandLength;
            if (i < alarmInfos.size() - 1) {
                totalEstimatedLength += 4; // " OR "
            }
        }

        if (totalEstimatedLength <= ALARM_RULE_CHUNK_TARGET_CHARS) {
            // Rule fits in a single composite
            var rules = new ArrayList<IAlarmRule>();
            for (AlarmInfo info : alarmInfos) {
                rules.add(info.alarm);
            }
            return CompositeAlarm.Builder.create(scope, "StackHealthAlarm")
                    .compositeAlarmName(resourceNamePrefix + "-" + stackShortName + HEALTH_ALARM_NAME_SUFFIX)
                    .alarmRule(anyOf(rules))
                    .alarmDescription("A health check failed in " + stackShortName + ": one of its Lambda functions "
                            + "reported errors or error-like log lines, or one of its async pairs has a stuck queue "
                            + "or a failing worker. The alarm state reason names the check that tripped.")
                    .build();
        }

        // Rule is too long; create group composites and reference them
        var groupAlarms = new ArrayList<IAlarm>();
        int groupIndex = 1;
        for (int start = 0; start < alarmInfos.size(); ) {
            // Accumulate alarms for this group until we approach the char limit
            var groupChecks = new ArrayList<IAlarmRule>();
            int currentGroupLength = 0;
            while (start < alarmInfos.size()) {
                AlarmInfo nextInfo = alarmInfos.get(start);
                int nextCheckLength = nextInfo.estimatedOperandLength;
                if (!groupChecks.isEmpty()
                        && currentGroupLength + 4 + nextCheckLength > ALARM_RULE_CHUNK_TARGET_CHARS) {
                    // Adding this check would exceed the limit, so finish this group
                    break;
                }
                groupChecks.add(nextInfo.alarm);
                currentGroupLength += (groupChecks.size() == 1 ? 0 : 4) + nextCheckLength; // " OR "
                start++;
            }

            // Create a group composite for this chunk
            String groupId = "StackHealthAlarmGroup" + groupIndex;
            String groupAlarmName =
                    resourceNamePrefix + "-" + stackShortName + "-group" + groupIndex + HEALTH_ALARM_NAME_SUFFIX;
            CompositeAlarm groupAlarm = CompositeAlarm.Builder.create(scope, groupId)
                    .compositeAlarmName(groupAlarmName)
                    .alarmRule(anyOf(groupChecks))
                    .alarmDescription("A health check failed in " + stackShortName + ": one of its Lambda functions "
                            + "reported errors or error-like log lines, or one of its async pairs has a stuck queue "
                            + "or a failing worker. The alarm state reason names the check that tripped.")
                    .build();
            groupAlarms.add(groupAlarm);
            groupIndex++;
        }

        // Create the top-level alarm that references all group alarms
        var groupRules = new ArrayList<IAlarmRule>();
        for (IAlarm groupAlarm : groupAlarms) {
            groupRules.add(AlarmRule.fromAlarm(groupAlarm, AlarmState.ALARM));
        }
        return CompositeAlarm.Builder.create(scope, "StackHealthAlarm")
                .compositeAlarmName(resourceNamePrefix + "-" + stackShortName + HEALTH_ALARM_NAME_SUFFIX)
                .alarmRule(anyOf(groupRules))
                .alarmDescription("A health check failed in " + stackShortName + ": one of its Lambda functions "
                        + "reported errors or error-like log lines, or one of its async pairs has a stuck queue "
                        + "or a failing worker. The alarm state reason names the check that tripped.")
                .build();
    }

    /**
     * Estimates the character length of an alarm rule operand: ALARM("arn:..."). The pattern is
     * ALARM("arn:aws:cloudwatch:REGION:ACCOUNT:alarm:NAME") = 9 + 53 + name.length(), where 9 is
     * for ALARM("") and 53 is for the ARN prefix arn:aws:cloudwatch:<14-char region>:<12-digit
     * account>:alarm:. If the name is a CDK token (unresolved), count it as 120 characters.
     */
    private static int estimateAlarmOperandLength(String alarmName) {
        if (Token.isUnresolved(alarmName)) {
            return 120;
        }
        return 9 + 53 + alarmName.length();
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
