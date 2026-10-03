/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpJwtAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaAuthorizer;
import software.amazon.awscdk.aws_apigatewayv2_authorizers.HttpLambdaResponseType;
import software.amazon.awscdk.aws_apigatewayv2_integrations.HttpLambdaIntegration;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;
import software.amazon.awscdk.services.apigatewayv2.HttpRoute;
import software.amazon.awscdk.services.apigatewayv2.HttpRouteKey;
import software.amazon.awscdk.services.apigatewayv2.IHttpApi;
import software.amazon.awscdk.services.apigatewayv2.IHttpRouteAuthorizer;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;

/**
 * Adds Lambda routes to one HTTP API from inside a given stack. ApiStack and ApiRoutesStack each
 * hold one of these, so the API's routes, integrations and invoke permissions are split across two
 * CloudFormation stacks, each under the 500-resource limit. An authoriser is created in the stack
 * whose routes bind it, so each stack carries its own copy; {@code idPrefix} keeps their names
 * distinct on the shared API.
 */
final class ApiRoutes {

    private final Stack stack;
    private final IHttpApi httpApi;
    private final HttpJwtAuthorizer jwtAuthorizer;
    private final HttpJwtAuthorizer booksJwtAuthorizer;
    private final HttpJwtAuthorizer billingJwtAuthorizer;
    private final HttpJwtAuthorizer allClientsJwtAuthorizer;
    private final HttpLambdaAuthorizer customAuthorizer;
    private final Set<String> createdRouteKeys = new LinkedHashSet<>();
    private final Map<String, String> firstCreatorByRoute = new HashMap<>();

    ApiRoutes(
            Stack stack,
            IHttpApi httpApi,
            String idPrefix,
            String userPoolId,
            String userPoolClientId,
            String booksUserPoolClientId,
            String mcpUserPoolClientId,
            IFunction customAuthorizerLambda) {
        this.stack = stack;
        this.httpApi = httpApi;

        String issuer = "https://cognito-idp.%s.amazonaws.com/%s".formatted(stack.getRegion(), userPoolId);
        boolean mcpClientSet = mcpUserPoolClientId != null && !mcpUserPoolClientId.isBlank();

        // The submission MCP's own client reaches the same VAT and Companies House routes the
        // Submit web client reaches, for the same signed-in user (route-level authorisation keys
        // off sub, never off which client issued the token), so its audience joins this
        // authoriser's own. Blank until the deploy wiring sets it.
        var mainAudience = new ArrayList<String>(List.of(userPoolClientId));
        if (mcpClientSet) mainAudience.add(mcpUserPoolClientId);
        this.jwtAuthorizer = HttpJwtAuthorizer.Builder.create(idPrefix + "-CognitoAuthorizer", issuer)
                .jwtAudience(mainAudience)
                .build();

        // A books-client-scoped audience: a books token must never be accepted on the VAT or
        // Companies House routes, and vice versa. The MCP client reaches the cloud book routes too.
        var cloudBookAudience = new ArrayList<String>(List.of(booksUserPoolClientId));
        if (mcpClientSet) cloudBookAudience.add(mcpUserPoolClientId);
        this.booksJwtAuthorizer = HttpJwtAuthorizer.Builder.create(idPrefix + "-BooksCognitoAuthorizer", issuer)
                .jwtAudience(cloudBookAudience)
                .build();

        // Checkout and portal accept a token from either client, since a DIYA-GL subscriber
        // manages their subscription with a books-client token.
        this.billingJwtAuthorizer = HttpJwtAuthorizer.Builder.create(idPrefix + "-BillingCognitoAuthorizer", issuer)
                .jwtAudience(List.of(userPoolClientId, booksUserPoolClientId))
                .build();

        // Sign-out is the one route every client must reach, since a token from any client names
        // a session that route has to end.
        var allClientsAudience = new ArrayList<String>(List.of(userPoolClientId, booksUserPoolClientId));
        if (mcpClientSet) allClientsAudience.add(mcpUserPoolClientId);
        this.allClientsJwtAuthorizer = HttpJwtAuthorizer.Builder.create(
                        idPrefix + "-AllClientsCognitoAuthorizer", issuer)
                .jwtAudience(allClientsAudience)
                .build();

        this.customAuthorizer = HttpLambdaAuthorizer.Builder.create(
                        idPrefix + "-CustomAuthorizer", customAuthorizerLambda)
                .responseTypes(List.of(HttpLambdaResponseType.IAM))
                .identitySource(List.of("$request.header.X-Authorization"))
                .resultsCacheTtl(Duration.minutes(5))
                .build();
    }

    /** Route keys already taken on the API by another stack; this one skips them. */
    void reserve(Set<String> routeKeysTakenElsewhere) {
        for (String routeKey : routeKeysTakenElsewhere) {
            createdRouteKeys.add(routeKey);
            firstCreatorByRoute.put(routeKey, "<another stack>");
        }
    }

    /** Every route key this instance created or reserved. */
    Set<String> routeKeys() {
        return Collections.unmodifiableSet(createdRouteKeys);
    }

    void addAll(List<AbstractApiLambdaProps> lambdaFunctions) {
        for (AbstractApiLambdaProps apiLambdaProps : lambdaFunctions) {
            String routeKeyStr = apiLambdaProps.httpMethod().toString() + " " + apiLambdaProps.urlPath();
            if (createdRouteKeys.contains(routeKeyStr)) {
                infof(
                        "Skipping duplicate route %s (attempted by %s, first created by %s)",
                        routeKeyStr,
                        apiLambdaProps.ingestFunctionName(),
                        firstCreatorByRoute.getOrDefault(routeKeyStr, "<unknown>"));
                continue;
            }
            createdRouteKeys.add(routeKeyStr);
            firstCreatorByRoute.put(routeKeyStr, apiLambdaProps.ingestFunctionName());
            createRouteForLambda(apiLambdaProps);
        }

        var sorted = new ArrayList<>(createdRouteKeys);
        Collections.sort(sorted);
        infof("Total API routes known to %s: %d", stack.getNode().getId(), sorted.size());
        for (String rk : sorted) {
            infof(" - %s (by %s)", rk, firstCreatorByRoute.getOrDefault(rk, "<unknown>"));
        }
    }

    private IHttpRouteAuthorizer authorizerFor(AbstractApiLambdaProps apiLambdaProps) {
        // A billing route is checked first: its authoriser accepts either client's audience. A
        // books route is checked next: its own authoriser keeps a books token off every other
        // route regardless of what jwtAuthorizer()/customAuthorizer() say.
        if (apiLambdaProps.billingJwtAuthorizer()) return billingJwtAuthorizer;
        if (apiLambdaProps.booksJwtAuthorizer()) return booksJwtAuthorizer;
        if (apiLambdaProps.allClientsJwtAuthorizer()) return allClientsJwtAuthorizer;
        if (apiLambdaProps.customAuthorizer()) return customAuthorizer;
        if (apiLambdaProps.jwtAuthorizer()) return jwtAuthorizer;
        return null;
    }

    private void addRoute(
            String routeId, HttpRouteKey routeKey, HttpLambdaIntegration integration, IHttpRouteAuthorizer authorizer) {
        var builder = HttpRoute.Builder.create(stack, routeId)
                .httpApi(httpApi)
                .routeKey(routeKey)
                .integration(integration);
        if (authorizer != null) builder.authorizer(authorizer);
        builder.build();
    }

    private void createRouteForLambda(AbstractApiLambdaProps apiLambdaProps) {
        // Stable, unique construct IDs per route from the method+path signature
        String keySuffix = (apiLambdaProps.httpMethod().toString() + "-" + apiLambdaProps.urlPath())
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");

        String importedFnId = apiLambdaProps.ingestFunctionName() + "-imported-" + keySuffix;
        String integrationId = apiLambdaProps.ingestFunctionName() + "-Integration-" + keySuffix;
        String routeId = apiLambdaProps.ingestFunctionName() + "-Route-" + keySuffix;

        IFunction fn = Function.fromFunctionAttributes(
                stack,
                importedFnId,
                FunctionAttributes.builder()
                        .functionArn(apiLambdaProps.ingestProvisionedConcurrencyAliasArn())
                        .sameEnvironment(true)
                        .build());

        // HttpLambdaIntegration grants API Gateway invoke on this function for every route it binds.
        HttpLambdaIntegration integration = HttpLambdaIntegration.Builder.create(integrationId, fn)
                .timeout(Duration.seconds(29))
                .build();

        IHttpRouteAuthorizer authorizer = authorizerFor(apiLambdaProps);
        addRoute(
                routeId,
                HttpRouteKey.with(apiLambdaProps.urlPath(), apiLambdaProps.httpMethod()),
                integration,
                authorizer);
        infof(
                "Created route %s %s for function %s",
                apiLambdaProps.httpMethod().toString(), apiLambdaProps.urlPath(), fn.getFunctionName());

        // A HEAD route for the same path, unless the primary route is HEAD or one exists already.
        if (apiLambdaProps.httpMethod() != HttpMethod.HEAD) {
            String headRouteKeyStr = "HEAD " + apiLambdaProps.urlPath();
            if (!createdRouteKeys.contains(headRouteKeyStr)) {
                createdRouteKeys.add(headRouteKeyStr);
                firstCreatorByRoute.put(headRouteKeyStr, apiLambdaProps.ingestFunctionName());
                addRoute(
                        apiLambdaProps.ingestFunctionName() + "-Route-HEAD-" + keySuffix,
                        HttpRouteKey.with(apiLambdaProps.urlPath(), HttpMethod.HEAD),
                        integration,
                        authorizer);
                infof(
                        "Created route HEAD %s for function %s (via auto-HEAD)",
                        apiLambdaProps.urlPath(), fn.getFunctionName());
            }
        }

        // A books route's CORS preflight is an unauthenticated OPTIONS route on the same path,
        // answered by the same integration. Deduped by path alone, since PUT and DELETE on
        // /api/v1/books/{bookId} share one preflight.
        if (apiLambdaProps.optionsPreflightRoute()) {
            String optionsRouteKeyStr = "OPTIONS " + apiLambdaProps.urlPath();
            if (!createdRouteKeys.contains(optionsRouteKeyStr)) {
                createdRouteKeys.add(optionsRouteKeyStr);
                firstCreatorByRoute.put(optionsRouteKeyStr, apiLambdaProps.ingestFunctionName());
                addRoute(
                        apiLambdaProps.ingestFunctionName() + "-Route-OPTIONS-" + keySuffix,
                        HttpRouteKey.with(apiLambdaProps.urlPath(), HttpMethod.OPTIONS),
                        integration,
                        null);
                infof(
                        "Created route OPTIONS %s for function %s (unauthenticated preflight)",
                        apiLambdaProps.urlPath(), fn.getFunctionName());
            }
        }
    }
}
