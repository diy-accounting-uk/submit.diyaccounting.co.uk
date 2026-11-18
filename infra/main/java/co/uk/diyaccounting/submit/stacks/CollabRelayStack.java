/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.aws_apigatewayv2_integrations.WebSocketLambdaIntegration;
import software.amazon.awscdk.services.apigatewayv2.HttpApi;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.apigatewayv2.HttpStage;
import software.amazon.awscdk.services.apigatewayv2.ThrottleSettings;
import software.amazon.awscdk.services.apigatewayv2.WebSocketApi;
import software.amazon.awscdk.services.apigatewayv2.WebSocketRouteOptions;
import software.amazon.awscdk.services.apigatewayv2.WebSocketStage;
import software.amazon.awscdk.services.dynamodb.Attribute;
import software.amazon.awscdk.services.dynamodb.AttributeType;
import software.amazon.awscdk.services.dynamodb.BillingMode;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.RepositoryAttributes;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.DockerImageCode;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.EcrImageCodeProps;
import software.amazon.awscdk.services.lambda.Function;
import software.constructs.Construct;

/**
 * The relay that wakes the coordinator the moment a cloud worker reports (NEXT.md CW2, ci only).
 *
 * <p>A WebSocket API carries the coordinator's open connection; an HTTP API takes POST /send,
 * /ack and /register from either end; one Lambda serves both, and one table holds the party keys,
 * the stored messages and the open connections. Every request is authenticated inside the Lambda
 * by an ed25519 SSH signature, so neither API has an authorizer. A rule every 9 minutes sends a
 * ping frame, because API Gateway closes a WebSocket connection after 10 idle minutes.
 */
public class CollabRelayStack extends Stack {

    public static final String WEBSOCKET_STAGE_NAME = "relay";

    public final Table table;
    public final Function relayFunction;
    public final WebSocketApi webSocketApi;
    public final HttpApi httpApi;
    public final Rule pingSchedule;

    @Value.Immutable
    public interface CollabRelayStackProps extends StackProps, SubmitStackProps {

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

        /** The OpenSSH public key line of the coordinator, from .collab/coordinator.pub; empty refuses registration. */
        String coordinatorPublicKey();

        static ImmutableCollabRelayStackProps.Builder builder() {
            return ImmutableCollabRelayStackProps.builder();
        }
    }

    public CollabRelayStack(final Construct scope, final String id, final CollabRelayStackProps props) {
        super(scope, id, props);

        var prefix = props.resourceNamePrefix();
        var sharedNames = props.sharedNames();
        var region = this.getRegion();
        var account = this.getAccount();
        var name = prefix + "-collab-relay";

        Tags.of(this).add("DataClassification", "internal");
        Tags.of(this).add("BackupRequired", "false");

        // Messages are ciphertext that lives seven days at most and connections two hours, so the
        // table is created and destroyed with the stack and has no backup.
        this.table = Table.Builder.create(this, prefix + "-CollabRelayTable")
                .tableName(name)
                .partitionKey(Attribute.builder()
                        .name("pk")
                        .type(AttributeType.STRING)
                        .build())
                .sortKey(Attribute.builder()
                        .name("sk")
                        .type(AttributeType.STRING)
                        .build())
                .billingMode(BillingMode.PAY_PER_REQUEST)
                .timeToLiveAttribute("expiresAt")
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // The WebSocket API is created before the Lambda, so the Lambda's callback URL and its
        // @connections grant refer to the API alone and not to the routes that refer to the Lambda.
        this.webSocketApi = WebSocketApi.Builder.create(this, prefix + "-CollabRelayWebSocketApi")
                .apiName(name + "-ws")
                .description("Pushes relay messages to the coordinator's open connection (" + props.envName() + ")")
                .build();
        var callbackUrl = "https://%s.execute-api.%s.amazonaws.com/%s"
                .formatted(webSocketApi.getApiId(), region, WEBSOCKET_STAGE_NAME);

        IRepository repository = Repository.fromRepositoryAttributes(
                this,
                prefix + "-CollabRelay-EcrRepo",
                RepositoryAttributes.builder()
                        .repositoryArn(sharedNames.ecr.ecrRepositoryArn)
                        .repositoryName(sharedNames.ecr.ecrRepositoryName)
                        .build());

        // Env-scoped, so the function name is stable and its log group is created if missing,
        // as for every job Lambda in an env-scoped stack (ScanDetectionStack, IngestionStack).
        var logGroup = ensureLogGroupWithDependency(this, prefix + "-CollabRelayLogGroup", "/aws/lambda/" + name);

        var environment = new PopulatedMap<String, String>()
                .with("ENVIRONMENT_NAME", props.envName())
                .with("COLLAB_RELAY_DYNAMODB_TABLE_NAME", name)
                .with("COLLAB_RELAY_CALLBACK_URL", callbackUrl);
        // No coordinator key yet (.collab/coordinator.pub not committed): the variable is absent
        // and the Lambda refuses registrations and coordinator requests.
        if (!props.coordinatorPublicKey().isBlank()) {
            environment.with("COLLAB_COORDINATOR_PUBLIC_KEY", props.coordinatorPublicKey());
        }

        this.relayFunction = DockerImageFunction.Builder.create(this, prefix + "-CollabRelayFn")
                .functionName(name)
                .code(DockerImageCode.fromEcr(
                        repository,
                        EcrImageCodeProps.builder()
                                .tagOrDigest(props.baseImageTag())
                                .cmd(List.of("app/functions/collab/collabRelay.handler"))
                                .build()))
                .timeout(Duration.seconds(29))
                .memorySize(256)
                .architecture(Architecture.ARM_64)
                .environment(environment)
                .logGroup(logGroup.logGroup())
                .build();
        this.relayFunction.getNode().addDependency(logGroup.ensureResource());

        this.table.grant(
                this.relayFunction,
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query");

        // Post to the connections of this API's one stage only.
        this.relayFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("execute-api:ManageConnections"))
                .resources(List.of("arn:aws:execute-api:%s:%s:%s/%s/POST/@connections/*"
                        .formatted(region, account, webSocketApi.getApiId(), WEBSOCKET_STAGE_NAME)))
                .build());

        // The $connect handler starts the replay as an asynchronous invocation of this function.
        // The ARN is built from the name, because a reference to the function from its own role
        // policy is a circular dependency.
        this.relayFunction.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("lambda:InvokeFunction"))
                .resources(List.of("arn:aws:lambda:%s:%s:function:%s".formatted(region, account, name)))
                .build());

        // ============================================================================
        // WebSocket routes and stage
        // ============================================================================
        webSocketApi.addRoute(
                "$connect",
                WebSocketRouteOptions.builder()
                        .integration(new WebSocketLambdaIntegration(prefix + "-CollabRelayConnect", this.relayFunction))
                        .build());
        webSocketApi.addRoute(
                "$disconnect",
                WebSocketRouteOptions.builder()
                        .integration(
                                new WebSocketLambdaIntegration(prefix + "-CollabRelayDisconnect", this.relayFunction))
                        .build());
        var webSocketStage = WebSocketStage.Builder.create(this, prefix + "-CollabRelayWebSocketStage")
                .webSocketApi(webSocketApi)
                .stageName(WEBSOCKET_STAGE_NAME)
                .autoDeploy(true)
                .throttle(ThrottleSettings.builder().rateLimit(5).burstLimit(10).build())
                .build();

        // ============================================================================
        // HTTP routes and stage
        // ============================================================================
        this.httpApi = HttpApi.Builder.create(this, prefix + "-CollabRelayHttpApi")
                .apiName(name + "-http")
                .description(
                        "Takes signed relay messages from cloud workers and the coordinator (" + props.envName() + ")")
                .createDefaultStage(false)
                .build();
        HttpStage.Builder.create(this, prefix + "-CollabRelayHttpStage")
                .httpApi(httpApi)
                .stageName("$default")
                .autoDeploy(true)
                .throttle(ThrottleSettings.builder().rateLimit(5).burstLimit(10).build())
                .build();
        var httpIntegration = HttpLambdaIntegration.Builder.create(prefix + "-CollabRelayHttp", this.relayFunction)
                .timeout(Duration.seconds(29))
                .build();
        for (var path : List.of("/send", "/ack", "/register")) {
            HttpRoute.Builder.create(this, prefix + "-CollabRelayRoute" + path.replace("/", "-"))
                    .httpApi(httpApi)
                    .routeKey(HttpRouteKey.with(path, HttpMethod.POST))
                    .integration(httpIntegration)
                    .build();
        }

        // ============================================================================
        // The ping that keeps an idle connection open
        // ============================================================================
        this.pingSchedule = Rule.Builder.create(this, prefix + "-CollabRelayPing")
                .ruleName(name + "-ping")
                .description(
                        "Sends a ping frame to every relay connection, inside API Gateway's 10-minute idle timeout")
                .schedule(Schedule.rate(Duration.minutes(9)))
                .targets(List.of(
                        LambdaFunction.Builder.create(this.relayFunction).build()))
                .build();

        cfnOutput(this, "CollabRelayWebSocketUrl", webSocketStage.getUrl());
        cfnOutput(this, "CollabRelayHttpUrl", httpApi.getApiEndpoint());
        cfnOutput(this, "CollabRelayTableName", this.table.getTableName());

        infof("CollabRelayStack %s created successfully for %s", this.getNode().getId(), prefix);
    }
}
