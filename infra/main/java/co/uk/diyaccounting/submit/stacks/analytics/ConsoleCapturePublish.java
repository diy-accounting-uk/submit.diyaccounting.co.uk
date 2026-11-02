/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.iam.AccountPrincipal;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * The Lambda behind the console captures on the operator dashboard: renders the CloudWatch
 * metric graphs, the alarms, the Bedrock invocation counts and the X-Ray services that the
 * dashboard's AWS links open, and writes them to {@code s3://<lake>/snapshots/<env>/console/}.
 * {@code operatorSnapshotGet.js} serves the index and {@code operatorConsoleImageGet.js} serves the
 * images. It has no schedule of its own: {@code NightlyIngestionWorkflow} runs it after the pass
 * figures publish, once a day in prod (the 02:15 UTC execution) and on every ci execution.
 *
 * <p>The prod Lambda reads prod and, through {@code sts:AssumeRole} with an external id, ci and
 * the spreadsheets and gateway accounts. The ci Lambda reads ci only, so ci never reads prod. In
 * ci this construct also creates {@code ci-env-console-capture-read}, the role the prod Lambda
 * assumes. The two sibling roles are created in their own repositories.
 *
 * <p>The execution role has an explicit name so the ci read role can name it in a condition.
 * Not a {@code Stack}: lives inside {@code AnalyticsStack}, modelled on {@link OperatorSnapshotPublish}.
 */
public class ConsoleCapturePublish extends Construct {

    public static final String PROD_ACCOUNT = "972912397388";
    public static final String CI_ACCOUNT = "367191799875";

    /** The condition value every cross-account read role requires on {@code sts:AssumeRole}. */
    public static final String EXTERNAL_ID = "submit-console-capture";

    /** The read roles the prod Lambda assumes, by the target key the capture catalogue uses. */
    public static final Map<String, String> READ_ROLE_ARNS = Map.of(
            "ci", "arn:aws:iam::" + CI_ACCOUNT + ":role/ci-env-console-capture-read",
            "spreadsheets", "arn:aws:iam::064390746177:role/spreadsheets-console-capture-read",
            "gateway", "arn:aws:iam::283165661847:role/gateway-console-capture-read");

    private static final int ASSUMED_SESSION_SECONDS_LIMIT = 3600;

    public final Function capturePublishLambda;
    public final Role executionRole;
    public final Alarm errorsAlarm;

    /** The role the prod Lambda assumes in ci; null outside ci. */
    public final Role ciReadRole;

    @Value.Immutable
    public interface ConsoleCapturePublishProps {

        /** Construct id prefix, unique within the parent scope, e.g. {@code envResourceNamePrefix}. */
        String idPrefix();

        String envName();

        String baseImageTag();

        String ecrRepositoryArn();

        String ecrRepositoryName();

        /** The analytics lake bucket: the images and the index are written under {@code snapshots/<env>/console/}. */
        IBucket lakeBucket();

        static ImmutableConsoleCapturePublishProps.Builder builder() {
            return ImmutableConsoleCapturePublishProps.builder();
        }
    }

    /** The execution role's name; the ci read role's trust condition names the prod one. */
    public static String executionRoleName(String idPrefix) {
        return idPrefix + "-console-capture";
    }

    public ConsoleCapturePublish(final Construct scope, final ConsoleCapturePublishProps props) {
        super(scope, props.idPrefix() + "-ConsoleCapturePublish");

        var stack = Stack.of(scope);
        var region = stack.getRegion();
        var account = stack.getAccount();
        var prefix = props.idPrefix();
        var envName = props.envName();
        var isProd = "prod".equals(envName);

        var functionName = prefix + "-console-capture-publish";

        // ============================================================================
        // Execution role (explicit name)
        // ============================================================================
        this.executionRole = Role.Builder.create(this, prefix + "-ConsoleCapturePublish-Role")
                .roleName(executionRoleName(prefix))
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")))
                .build();

        this.executionRole.addToPolicy(readPolicyStatement("cloudwatch:GetMetricWidgetImage", List.of("*")));
        this.executionRole.addToPolicy(readPolicyStatement(
                "cloudwatch:DescribeAlarms",
                List.of("arn:aws:cloudwatch:%s:%s:alarm:%s-*".formatted(region, account, envName))));
        this.executionRole.addToPolicy(readPolicyStatement(
                "logs:StartQuery",
                List.of("arn:aws:logs:%s:%s:log-group:/%s/bedrock/invocations:*".formatted(region, account, envName))));
        this.executionRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:GetQueryResults", "logs:StopQuery"))
                .resources(List.of("*"))
                .build());
        this.executionRole.addToPolicy(readPolicyStatement("xray:GetServiceGraph", List.of("*")));
        this.executionRole.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:PutObject"))
                .resources(List.of(props.lakeBucket().getBucketArn() + "/snapshots/" + envName + "/console/*"))
                .build());
        if (isProd) {
            this.executionRole.addToPolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("sts:AssumeRole"))
                    .resources(List.copyOf(READ_ROLE_ARNS.values()))
                    .build());
        }

        // ============================================================================
        // Capture Lambda
        // ============================================================================
        var environment = new java.util.LinkedHashMap<String, String>();
        environment.put("ENVIRONMENT_NAME", envName);
        environment.put("ANALYTICS_LAKE_BUCKET_NAME", props.lakeBucket().getBucketName());
        if (isProd) {
            environment.put("CONSOLE_CAPTURE_ROLE_ARNS", roleArnsJson());
            environment.put("CONSOLE_CAPTURE_EXTERNAL_ID", EXTERNAL_ID);
        }

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-ConsoleCapturePublish-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(props.ecrRepositoryArn())
                        .repositoryName(props.ecrRepositoryName())
                        .build());

        // AnalyticsStack is env-scoped, so this function name is stable forever, not
        // per-deployment - the idempotent create-if-missing path, matching the other publishers.
        var capturePublishLogGroup = ensureLogGroupWithDependency(
                stack, prefix + "-ConsoleCapturePublishLogGroup", "/aws/lambda/" + functionName);

        this.capturePublishLambda = DockerImageFunction.Builder.create(this, prefix + "-ConsoleCapturePublishFn")
                .functionName(functionName)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/analytics/consoleCapturePublish.handler"))
                                .build()))
                .role(this.executionRole)
                .timeout(Duration.minutes(5))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(capturePublishLogGroup.logGroup())
                .build();
        this.capturePublishLambda.getNode().addDependency(capturePublishLogGroup.ensureResource());

        // ============================================================================
        // Alarm: the capture records a failed item in its index and carries on, so only an
        // error that stops the run reaches this alarm.
        // ============================================================================
        this.errorsAlarm = Alarm.Builder.create(this, prefix + "-ConsoleCapturePublish-ErrorsAlarm")
                .alarmName(functionName + "-errors")
                .alarmDescription("Console capture publish errored at least once in 24 hours")
                .metric(this.capturePublishLambda.metricErrors(
                        MetricOptions.builder().period(Duration.hours(24)).build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // ci: the role the prod capture assumes
        // ============================================================================
        if ("ci".equals(envName)) {
            this.ciReadRole = buildCiReadRole(prefix, region, account);
        } else {
            this.ciReadRole = null;
        }
    }

    private Role buildCiReadRole(String prefix, String region, String account) {
        var prodExecutionRoleArn =
                "arn:aws:iam::%s:role/%s".formatted(PROD_ACCOUNT, executionRoleName("prod-env"));
        // The trust names the prod account and requires the prod execution role by condition,
        // not by principal: a role-ARN principal needs that role to exist before this deploys.
        var trust = new AccountPrincipal(PROD_ACCOUNT)
                .withConditions(Map.of(
                        "StringEquals", Map.of("sts:ExternalId", EXTERNAL_ID),
                        "ArnEquals", Map.of("aws:PrincipalArn", prodExecutionRoleArn)));
        var role = Role.Builder.create(this, prefix + "-ConsoleCaptureRead-Role")
                .roleName(prefix + "-console-capture-read")
                .assumedBy(trust)
                .maxSessionDuration(Duration.seconds(ASSUMED_SESSION_SECONDS_LIMIT))
                .build();
        role.addToPolicy(readPolicyStatement("cloudwatch:GetMetricWidgetImage", List.of("*")));
        role.addToPolicy(readPolicyStatement(
                "cloudwatch:DescribeAlarms", List.of("arn:aws:cloudwatch:%s:%s:alarm:ci-*".formatted(region, account))));
        role.addToPolicy(readPolicyStatement(
                "logs:StartQuery",
                List.of("arn:aws:logs:%s:%s:log-group:/ci/bedrock/invocations:*".formatted(region, account))));
        role.addToPolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("logs:GetQueryResults", "logs:StopQuery"))
                .resources(List.of("*"))
                .build());
        role.addToPolicy(readPolicyStatement("xray:GetServiceGraph", List.of("*")));
        return role;
    }

    private static PolicyStatement readPolicyStatement(String action, List<String> resources) {
        return PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of(action))
                .resources(resources)
                .build();
    }

    /** The target key to read role ARN map as the JSON the capture Lambda reads from its environment. */
    static String roleArnsJson() {
        var entries = new java.util.TreeMap<>(READ_ROLE_ARNS);
        var json = new StringBuilder("{");
        var first = true;
        for (var entry : entries.entrySet()) {
            if (!first) {
                json.append(",");
            }
            json.append("\"").append(entry.getKey()).append("\":\"").append(entry.getValue()).append("\"");
            first = false;
        }
        return json.append("}").toString();
    }
}
