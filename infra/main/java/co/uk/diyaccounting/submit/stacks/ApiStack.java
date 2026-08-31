/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.CustomResource;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpJwtAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaResponseType;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.customresources.Provider;
import software.amazon.awscdk.services.apigatewayv2.ApiMapping;
import software.amazon.awscdk.services.apigatewayv2.CfnStage;
import software.amazon.awscdk.services.apigatewayv2.DomainName;
import software.amazon.awscdk.services.apigatewayv2.HttpApi;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.certificatemanager.ICertificate;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.MetricOptions;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.constructs.Construct;

public class ApiStack extends Stack {

    public final HttpApi httpApi;

    @Value.Immutable
    public interface ApiStackProps extends StackProps, SubmitStackProps {

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

        List<AbstractApiLambdaProps> lambdaFunctions();

        static ImmutableApiStackProps.Builder builder() {
            return ImmutableApiStackProps.builder();
        }

        String userPoolId();

        String userPoolClientId();

        String customAuthorizerLambdaArn();

        String buildNumber();

        String regionalCertificateArn();
    }

    @Value.Immutable
    public interface EndpointConfig {
        String path();

        HttpMethod httpMethod();

        String lambdaKey();

        static ImmutableEndpointConfig.Builder builder() {
            return ImmutableEndpointConfig.builder();
        }
    }

    public ApiStack(final Construct scope, final String id, final ApiStackProps props) {
        super(scope, id, props);

        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Create HTTP API Gateway v2
        this.httpApi = HttpApi.Builder.create(this, props.resourceNamePrefix() + "-HttpApi")
                .apiName(props.resourceNamePrefix() + "-api")
                .description(
                        "API Gateway v2 for " + props.resourceNamePrefix() + " (build " + props.buildNumber() + ")")
                .build();

        // Create API Gateway custom domain for the deployment domain so API GW accepts
        // the Host header that CloudFront forwards (required for CloudFront-Viewer-Address forwarding)
        ICertificate regionalCert = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-RegionalCert", props.regionalCertificateArn());

        DomainName deploymentCustomDomain = DomainName.Builder.create(
                        this, props.resourceNamePrefix() + "-CustomDomain")
                .domainName(props.sharedNames().deploymentDomainName)
                .certificate(regionalCert)
                .build();

        ApiMapping.Builder.create(this, props.resourceNamePrefix() + "-ApiMapping")
                .api(this.httpApi)
                .domainName(deploymentCustomDomain)
                .build();

        // Custom resource to clean up external API Gateway custom domain mappings on stack deletion.
        // set-origins creates mappings outside CloudFormation; if not removed before CF deletes the
        // HttpApi, the deletion fails because the $default stage is still referenced.
        LogGroup cleanupFnLogGroup = LogGroup.Builder.create(
                        this, props.resourceNamePrefix() + "-ApiGwCleanupFnLogGroup")
                .logGroupName("/aws/lambda/" + props.resourceNamePrefix() + "-api-gw-cleanup")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        Function cleanupFn = Function.Builder.create(this, props.resourceNamePrefix() + "-ApiGwCleanupFn")
                .runtime(Runtime.NODEJS_24_X)
                .handler("index.handler")
                .code(Code.fromInline(CLEANUP_LAMBDA_CODE))
                .timeout(Duration.minutes(5))
                .description("Cleans up external API Gateway custom domain mappings on stack deletion")
                .logGroup(cleanupFnLogGroup)
                .build();

        cleanupFn.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("apigateway:GET", "apigateway:DELETE"))
                .resources(List.of("arn:aws:apigateway:" + getRegion() + "::/*"))
                .build());

        // The Provider construct wraps cleanupFn in its own "framework-onEvent" Lambda to run the
        // custom resource protocol; that wrapper needs its own log group, separate from cleanupFn's.
        LogGroup cleanupProviderLogGroup = LogGroup.Builder.create(
                        this, props.resourceNamePrefix() + "-ApiGwCleanupProviderLogGroup")
                .logGroupName("/aws/lambda/" + props.resourceNamePrefix() + "-api-gw-cleanup-provider")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        Provider cleanupProvider = Provider.Builder.create(this, props.resourceNamePrefix() + "-ApiGwCleanupProvider")
                .onEventHandler(cleanupFn)
                .logGroup(cleanupProviderLogGroup)
                .build();

        CustomResource.Builder.create(this, props.resourceNamePrefix() + "-ApiGwCleanup")
                .serviceToken(cleanupProvider.getServiceToken())
                .properties(Map.of("ApiId", this.httpApi.getHttpApiId()))
                .build();

        // The access log group is env-scoped: the ObservabilityStack creates and deletes it and
        // holds the single API Gateway resource policy (10 per account). CloudFormation validates
        // the stage's destination exists when the change set is created, so nothing in this
        // stack can create it; an app deployment only references it.
        ILogGroup apiAccessLogGroup = LogGroup.fromLogGroupName(
                this, props.resourceNamePrefix() + "-ApiAccessLogs", props.sharedNames().apiAccessLogGroupName);

        // Configure default stage access logs and logging level/metrics
        assert this.httpApi.getDefaultStage() != null;
        var defaultStage = (CfnStage) this.httpApi.getDefaultStage().getNode().getDefaultChild();
        assert defaultStage != null;

        defaultStage.setAccessLogSettings(CfnStage.AccessLogSettingsProperty.builder()
                .destinationArn(apiAccessLogGroup.getLogGroupArn())
                .format("{" + "\"requestId\":\"$context.requestId\","
                        + "\"path\":\"$context.path\","
                        + "\"routeKey\":\"$context.routeKey\","
                        + "\"protocol\":\"$context.protocol\","
                        + "\"status\":\"$context.status\","
                        + "\"responseLength\":\"$context.responseLength\","
                        + "\"requestTime\":\"$context.requestTime\","
                        + "\"integrationError\":\"$context.integrationErrorMessage\""
                        + "}")
                .build());
        // Enable AWS X-Ray tracing for the default stage via property override.
        // Some CDK versions don't expose 'tracingEnabled' on CfnStage for HTTP APIs yet.
        // defaultStage.addPropertyOverride("TracingEnabled", true);
        // Note: Execution logs (loggingLevel) and detailed route metrics are not supported for HTTP APIs.
        // Avoid setting defaultRouteSettings to prevent BadRequestException during deployment.

        // Alarm: API Gateway HTTP 5xx errors >= 1 in a 5-minute period
        Alarm.Builder.create(this, props.resourceNamePrefix() + "-Api5xxAlarm")
                .alarmName(props.resourceNamePrefix() + "-api-5xx")
                .metric(this.httpApi
                        .metricServerError()
                        .with(MetricOptions.builder()
                                .period(Duration.minutes(5))
                                .build()))
                .threshold(1)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .alarmDescription("API Gateway 5xx errors >= 1 for API " + this.httpApi.getApiId())
                .build();

        // Create authorizers to selectively apply to routes
        String issuer = "https://cognito-idp.%s.amazonaws.com/%s".formatted(getRegion(), props.userPoolId());
        HttpJwtAuthorizer jwtAuthorizer = HttpJwtAuthorizer.Builder.create(
                        props.resourceNamePrefix() + "-CognitoAuthorizer", issuer)
                .jwtAudience(List.of(props.userPoolClientId()))
                .build();

        // Create custom Lambda authorizer for X-Authorization header
        IFunction customAuthorizerLambda = Function.fromFunctionAttributes(
                this,
                props.resourceNamePrefix() + "-CustomAuthorizerLambda",
                FunctionAttributes.builder()
                        .functionArn(props.customAuthorizerLambdaArn())
                        .sameEnvironment(true)
                        .build());

        HttpLambdaAuthorizer customAuthorizer = HttpLambdaAuthorizer.Builder.create(
                        props.resourceNamePrefix() + "-CustomAuthorizer", customAuthorizerLambda)
                .responseTypes(List.of(HttpLambdaResponseType.IAM))
                .identitySource(List.of("$request.header.X-Authorization"))
                .resultsCacheTtl(Duration.minutes(5))
                .build();

        // Ensure API Gateway can invoke the custom authorizer Lambda explicitly (robust across regions)
        customAuthorizerLambda.addPermission(
                props.resourceNamePrefix() + "-AllowInvokeAuthorizerFromHttpApi",
                Permission.builder()
                        .action("lambda:InvokeFunction")
                        .principal(new ServicePrincipal("apigateway.amazonaws.com"))
                        .sourceArn("arn:aws:execute-api:" + this.getRegion() + ":" + this.getAccount() + ":"
                                + this.httpApi.getApiId() + "/*")
                        .build());

        java.util.Set<String> createdRouteKeys = new java.util.HashSet<>();
        java.util.Map<String, String> firstCreatorByRoute = new java.util.HashMap<>();
        for (int i = 0; i < props.lambdaFunctions().size(); i++) {
            AbstractApiLambdaProps apiLambdaProps = props.lambdaFunctions().get(i);
            String routeKeyStr = apiLambdaProps.httpMethod().toString() + " " + apiLambdaProps.urlPath();
            if (createdRouteKeys.contains(routeKeyStr)) {
                String firstCreator = firstCreatorByRoute.getOrDefault(routeKeyStr, "<unknown>");
                infof(
                        "Skipping duplicate route %s (attempted by %s, first created by %s)",
                        routeKeyStr, apiLambdaProps.ingestFunctionName(), firstCreator);
                continue;
            }
            createdRouteKeys.add(routeKeyStr);
            firstCreatorByRoute.put(routeKeyStr, apiLambdaProps.ingestFunctionName());
            createRouteForLambda(
                    apiLambdaProps, jwtAuthorizer, customAuthorizer, createdRouteKeys, firstCreatorByRoute);
        }

        // Synthesis-time diagnostics: list all created routes
        if (!createdRouteKeys.isEmpty()) {
            var sorted = new java.util.ArrayList<>(createdRouteKeys);
            java.util.Collections.sort(sorted);
            infof("Total unique API routes synthesized: %d", sorted.size());
            for (String rk : sorted) {
                String creator = firstCreatorByRoute.getOrDefault(rk, "<unknown>");
                infof(" - %s (by %s)", rk, creator);
            }
        } else {
            infof("No API routes synthesized");
        }

        // Outputs
        cfnOutput(this, "HttpApiId", this.httpApi.getHttpApiId());

        // Export the API Gateway URL for cross-stack reference
        CfnOutput.Builder.create(this, "HttpApiUrl")
                .value(this.httpApi.getUrl())
                .exportName(props.resourceNamePrefix() + "-HttpApiUrl")
                .description("API Gateway v2 URL for " + props.resourceNamePrefix())
                .build();

        infof(
                "ApiStack %s created successfully for %s with API Gateway URL: %s",
                this.getNode().getId(), props.resourceNamePrefix(), this.httpApi.getUrl());
    }

    // Inline Node.js Lambda that cleans up external API Gateway custom domain mappings on Delete.
    // On Create/Update it is a no-op. All errors are caught and logged — best-effort only.
    private static final String CLEANUP_LAMBDA_CODE =
            """
            const { ApiGatewayV2Client, GetDomainNamesCommand, GetApiMappingsCommand,
                    DeleteApiMappingCommand, DeleteDomainNameCommand } = require("@aws-sdk/client-apigatewayv2");
            exports.handler = async (event) => {
              console.log("Event:", JSON.stringify(event));
              if (event.RequestType !== "Delete") {
                return { PhysicalResourceId: event.PhysicalResourceId || "cleanup-noop" };
              }
              const apiId = event.ResourceProperties.ApiId;
              if (!apiId) {
                console.log("No ApiId provided, skipping");
                return { PhysicalResourceId: "cleanup-no-api-id" };
              }
              const client = new ApiGatewayV2Client({});
              try {
                let nextToken;
                do {
                  const domainResp = await client.send(new GetDomainNamesCommand({ NextToken: nextToken }));
                  const domains = domainResp.Items || [];
                  for (const domain of domains) {
                    const domainName = domain.DomainName;
                    try {
                      const mapResp = await client.send(new GetApiMappingsCommand({ DomainName: domainName }));
                      const mappings = mapResp.Items || [];
                      const ourMappings = mappings.filter(m => m.ApiId === apiId);
                      for (const m of ourMappings) {
                        console.log(`Deleting mapping ${m.ApiMappingId} from domain ${domainName}`);
                        try {
                          await client.send(new DeleteApiMappingCommand({
                            DomainName: domainName, ApiMappingId: m.ApiMappingId
                          }));
                        } catch (e) { console.log(`Delete mapping error (ignored): ${e.message}`); }
                      }
                      if (ourMappings.length > 0 && ourMappings.length === mappings.length) {
                        console.log(`Deleting domain ${domainName} (all mappings were ours)`);
                        try {
                          await client.send(new DeleteDomainNameCommand({ DomainName: domainName }));
                        } catch (e) { console.log(`Delete domain error (ignored): ${e.message}`); }
                      }
                    } catch (e) { console.log(`Error processing domain ${domainName} (ignored): ${e.message}`); }
                  }
                  nextToken = domainResp.NextToken;
                } while (nextToken);
              } catch (e) { console.log(`Cleanup error (ignored): ${e.message}`); }
              return { PhysicalResourceId: event.PhysicalResourceId || "cleanup-noop" };
            };
            """;

    private void createRouteForLambda(
            AbstractApiLambdaProps apiLambdaProps,
            HttpJwtAuthorizer jwtAuthorizer,
            HttpLambdaAuthorizer customAuthorizer,
            java.util.Set<String> createdRouteKeys,
            java.util.Map<String, String> firstCreatorByRoute) {

        // Build stable, unique construct IDs per route using method+path signature
        String keySuffix = (apiLambdaProps.httpMethod().toString() + "-" + apiLambdaProps.urlPath())
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");

        String importedFnId = apiLambdaProps.ingestFunctionName() + "-imported-" + keySuffix;
        String integrationId = apiLambdaProps.ingestFunctionName() + "-Integration-" + keySuffix;
        String routeId = apiLambdaProps.ingestFunctionName() + "-Route-" + keySuffix;

        IFunction fn = Function.fromFunctionAttributes(
                this,
                importedFnId,
                FunctionAttributes.builder()
                        .functionArn(apiLambdaProps.ingestProvisionedConcurrencyAliasArn())
                        .sameEnvironment(true)
                        .build());

        // Create HTTP Lambda integration
        HttpLambdaIntegration integration = HttpLambdaIntegration.Builder.create(integrationId, fn)
                .timeout(Duration.seconds(29))
                .build();

        // Create HTTP route with the appropriate authoriser
        var routeKey = HttpRouteKey.with(apiLambdaProps.urlPath(), apiLambdaProps.httpMethod());
        if (apiLambdaProps.customAuthorizer()) {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .authorizer(customAuthorizer)
                    .build();
        } else if (apiLambdaProps.jwtAuthorizer()) {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .authorizer(jwtAuthorizer)
                    .build();
        } else {
            HttpRoute.Builder.create(this, routeId)
                    .httpApi(this.httpApi)
                    .routeKey(routeKey)
                    .integration(integration)
                    .build();
        }

        infof(
                "Created route %s %s for function %s",
                apiLambdaProps.httpMethod().toString(), apiLambdaProps.urlPath(), fn.getFunctionName());

        // Explicitly allow API Gateway to invoke this Lambda (defensive against region/env mismatches)
        fn.addPermission(
                apiLambdaProps.ingestFunctionName() + "-AllowInvokeFromHttpApi-" + keySuffix,
                Permission.builder()
                        .action("lambda:InvokeFunction")
                        .principal(new ServicePrincipal("apigateway.amazonaws.com"))
                        .sourceArn("arn:aws:execute-api:" + this.getRegion() + ":" + this.getAccount() + ":"
                                + this.httpApi.getApiId() + "/*")
                        .build());

        // Per-function error alarm already exists as `{fn}-errors` from the Lambda construct
        // (Lambda.java) on this same fn.metricErrors() metric — no need to alarm on it again here.

        // Additionally create a HEAD route for the same path to ensure HEAD requests are accepted across the API.
        // Only create if the primary route isn't already HEAD and there's no explicit HEAD route defined elsewhere.
        if (apiLambdaProps.httpMethod() != HttpMethod.HEAD) {
            String headRouteKeyStr = "HEAD " + apiLambdaProps.urlPath();
            if (!createdRouteKeys.contains(headRouteKeyStr)) {
                // Track so we don't double-create if encountered again
                createdRouteKeys.add(headRouteKeyStr);
                firstCreatorByRoute.put(headRouteKeyStr, apiLambdaProps.ingestFunctionName());

                String headRouteId = apiLambdaProps.ingestFunctionName() + "-Route-HEAD-" + keySuffix;
                var headRouteKey = HttpRouteKey.with(apiLambdaProps.urlPath(), HttpMethod.HEAD);

                if (apiLambdaProps.customAuthorizer()) {
                    HttpRoute.Builder.create(this, headRouteId)
                            .httpApi(this.httpApi)
                            .routeKey(headRouteKey)
                            .integration(integration)
                            .authorizer(customAuthorizer)
                            .build();
                } else if (apiLambdaProps.jwtAuthorizer()) {
                    HttpRoute.Builder.create(this, headRouteId)
                            .httpApi(this.httpApi)
                            .routeKey(headRouteKey)
                            .integration(integration)
                            .authorizer(jwtAuthorizer)
                            .build();
                } else {
                    HttpRoute.Builder.create(this, headRouteId)
                            .httpApi(this.httpApi)
                            .routeKey(headRouteKey)
                            .integration(integration)
                            .build();
                }

                infof(
                        "Created route HEAD %s for function %s (via auto-HEAD)",
                        apiLambdaProps.urlPath(), fn.getFunctionName());
            }
        }
    }
}
