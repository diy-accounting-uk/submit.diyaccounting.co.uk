/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

class ApiStackTest {

    private static final String USER_POOL_CLIENT_ID = "main-client-id";
    private static final String BOOKS_USER_POOL_CLIENT_ID = "books-client-id";

    private static ApiStack synthApiStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        var regularRoute = ApiLambdaProps.builder()
                .idPrefix("regular")
                .ingestFunctionName("test-regular-fn")
                .ingestHandler("app/functions/test/regular.ingestHandler")
                .ingestLambdaArn("arn:aws:lambda:eu-west-2:111111111111:function:test-regular-fn")
                .ingestProvisionedConcurrencyAliasArn(
                        "arn:aws:lambda:eu-west-2:111111111111:function:test-regular-fn:pc")
                .provisionedConcurrencyAliasName("pc")
                .baseImageTag("latest")
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .httpMethod(HttpMethod.GET)
                .urlPath("/api/v1/regular")
                .jwtAuthorizer(true)
                .customAuthorizer(false)
                .build();

        var booksPutRoute = ApiLambdaProps.builder()
                .idPrefix("books-put")
                .ingestFunctionName("test-books-put-fn")
                .ingestHandler("app/functions/books/booksPut.ingestHandler")
                .ingestLambdaArn("arn:aws:lambda:eu-west-2:111111111111:function:test-books-put-fn")
                .ingestProvisionedConcurrencyAliasArn(
                        "arn:aws:lambda:eu-west-2:111111111111:function:test-books-put-fn:pc")
                .provisionedConcurrencyAliasName("pc")
                .baseImageTag("latest")
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .httpMethod(HttpMethod.PUT)
                .urlPath("/api/v1/books/{bookId}")
                .jwtAuthorizer(false)
                .customAuthorizer(false)
                .booksJwtAuthorizer(true)
                .optionsPreflightRoute(true)
                .build();

        var booksDeleteRoute = ApiLambdaProps.builder()
                .idPrefix("books-delete")
                .ingestFunctionName("test-books-delete-fn")
                .ingestHandler("app/functions/books/booksDelete.ingestHandler")
                .ingestLambdaArn("arn:aws:lambda:eu-west-2:111111111111:function:test-books-delete-fn")
                .ingestProvisionedConcurrencyAliasArn(
                        "arn:aws:lambda:eu-west-2:111111111111:function:test-books-delete-fn:pc")
                .provisionedConcurrencyAliasName("pc")
                .baseImageTag("latest")
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .httpMethod(HttpMethod.DELETE)
                .urlPath("/api/v1/books/{bookId}")
                .jwtAuthorizer(false)
                .customAuthorizer(false)
                .booksJwtAuthorizer(true)
                .optionsPreflightRoute(true)
                .build();

        var billingCheckoutRoute = ApiLambdaProps.builder()
                .idPrefix("billing-checkout")
                .ingestFunctionName("test-billing-checkout-fn")
                .ingestHandler("app/functions/billing/billingCheckoutPost.ingestHandler")
                .ingestLambdaArn("arn:aws:lambda:eu-west-2:111111111111:function:test-billing-checkout-fn")
                .ingestProvisionedConcurrencyAliasArn(
                        "arn:aws:lambda:eu-west-2:111111111111:function:test-billing-checkout-fn:pc")
                .provisionedConcurrencyAliasName("pc")
                .baseImageTag("latest")
                .ecrRepositoryName(sharedNames.ecrRepositoryName)
                .ecrRepositoryArn(sharedNames.ecrRepositoryArn)
                .httpMethod(HttpMethod.POST)
                .urlPath("/api/v1/billing/checkout")
                .jwtAuthorizer(false)
                .customAuthorizer(false)
                .billingJwtAuthorizer(true)
                .build();

        return new ApiStack(
                app,
                "TestApiStack",
                ApiStack.ApiStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .lambdaFunctions(List.of(regularRoute, booksPutRoute, booksDeleteRoute, billingCheckoutRoute))
                        .userPoolId("eu-west-2_123456789")
                        .userPoolClientId(USER_POOL_CLIENT_ID)
                        .booksUserPoolClientId(BOOKS_USER_POOL_CLIENT_ID)
                        .customAuthorizerLambdaArn(
                                "arn:aws:lambda:eu-west-2:111111111111:function:test-custom-authorizer")
                        .buildNumber("test")
                        .regionalCertificateArn(
                                "arn:aws:acm:eu-west-2:111111111111:certificate/00000000-0000-0000-0000-000000000000")
                        .build());
    }

    @Test
    void createsThreeJwtAuthorisersScopedToMainBooksAndBothClientIds() {
        ApiStack stack = synthApiStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 3);
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Authorizer",
                Match.objectLike(Map.of(
                        "JwtConfiguration", Match.objectLike(Map.of("Audience", List.of(USER_POOL_CLIENT_ID))))));
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Authorizer",
                Match.objectLike(Map.of(
                        "JwtConfiguration", Match.objectLike(Map.of("Audience", List.of(BOOKS_USER_POOL_CLIENT_ID))))));
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Authorizer",
                Match.objectLike(Map.of(
                        "JwtConfiguration",
                        Match.objectLike(
                                Map.of("Audience", List.of(USER_POOL_CLIENT_ID, BOOKS_USER_POOL_CLIENT_ID))))));
    }

    @Test
    void aBooksRouteIsAuthorisedByTheBooksAuthoriserNotTheMainOne() {
        ApiStack stack = synthApiStack();
        Template template = Template.fromStack(stack);

        String mainAuthorizerId = authorizerLogicalIdForAudience(template, USER_POOL_CLIENT_ID);
        String booksAuthorizerId = authorizerLogicalIdForAudience(template, BOOKS_USER_POOL_CLIENT_ID);

        var putRoutes = template.findResources(
                "AWS::ApiGatewayV2::Route", Map.of("Properties", Map.of("RouteKey", "PUT /api/v1/books/{bookId}")));
        assertEquals(1, putRoutes.size());
        assertEquals(
                booksAuthorizerId,
                refOf(((Map<?, ?>) putRoutes.values().iterator().next()).get("Properties"), "AuthorizerId"));

        var regularRoutes = template.findResources(
                "AWS::ApiGatewayV2::Route", Map.of("Properties", Map.of("RouteKey", "GET /api/v1/regular")));
        assertEquals(1, regularRoutes.size());
        assertEquals(
                mainAuthorizerId,
                refOf(((Map<?, ?>) regularRoutes.values().iterator().next()).get("Properties"), "AuthorizerId"));
    }

    @Test
    void aBillingRouteIsAuthorisedByTheBillingAuthoriserAcceptingBothAudiences() {
        ApiStack stack = synthApiStack();
        Template template = Template.fromStack(stack);

        var billingAuthorizers = template.findResources(
                "AWS::ApiGatewayV2::Authorizer",
                Map.of(
                        "Properties",
                        Map.of(
                                "JwtConfiguration",
                                Map.of("Audience", List.of(USER_POOL_CLIENT_ID, BOOKS_USER_POOL_CLIENT_ID)))));
        assertEquals(1, billingAuthorizers.size(), "expected exactly one billing authoriser with both audiences");
        String billingAuthorizerId = billingAuthorizers.keySet().iterator().next();

        var checkoutRoutes = template.findResources(
                "AWS::ApiGatewayV2::Route", Map.of("Properties", Map.of("RouteKey", "POST /api/v1/billing/checkout")));
        assertEquals(1, checkoutRoutes.size());
        assertEquals(
                billingAuthorizerId,
                refOf(((Map<?, ?>) checkoutRoutes.values().iterator().next()).get("Properties"), "AuthorizerId"));
    }

    @Test
    void oneUnauthenticatedOptionsRouteIsCreatedPerBooksPathNotPerLambda() {
        ApiStack stack = synthApiStack();
        Template template = Template.fromStack(stack);

        var optionsRoutes = template.findResources(
                "AWS::ApiGatewayV2::Route", Map.of("Properties", Map.of("RouteKey", "OPTIONS /api/v1/books/{bookId}")));
        assertEquals(1, optionsRoutes.size(), "PUT and DELETE share one path, so only one OPTIONS route");

        @SuppressWarnings("unchecked")
        var properties = (Map<String, Object>)
                ((Map<?, ?>) optionsRoutes.values().iterator().next()).get("Properties");
        assertFalse(properties.containsKey("AuthorizerId"), "OPTIONS preflight must not require an authorizer");
    }

    @SuppressWarnings("unchecked")
    private static String authorizerLogicalIdForAudience(Template template, String audience) {
        var authorizers = template.findResources(
                "AWS::ApiGatewayV2::Authorizer",
                Map.of("Properties", Map.of("JwtConfiguration", Map.of("Audience", List.of(audience)))));
        assertEquals(1, authorizers.size(), "expected exactly one authorizer with audience " + audience);
        return authorizers.keySet().iterator().next();
    }

    @SuppressWarnings("unchecked")
    private static String refOf(Object propertiesObject, String key) {
        var properties = (Map<String, Object>) propertiesObject;
        assertTrue(properties.containsKey(key), "expected property " + key);
        var ref = (Map<String, Object>) properties.get(key);
        return (String) ref.get("Ref");
    }
}
