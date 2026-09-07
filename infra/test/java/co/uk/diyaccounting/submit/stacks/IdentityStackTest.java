/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class IdentityStackTest {

    private static final String CERTIFICATE_ARN =
            "arn:aws:acm:eu-west-2:111111111111:certificate/12345678-1234-1234-1234-123456789012";

    private static final String GOOGLE_CLIENT_SECRET_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test/google-client-secret";

    private static IdentityStack synthIdentityStack(String envName) {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = envName;
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = envName + "-identitytest";
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var props = IdentityStack.IdentityStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName(envName)
                .deploymentName(envName + "-identitytest")
                .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .hostedZoneName("example.com")
                .hostedZoneId("Z1234567890")
                .certificateArn(CERTIFICATE_ARN)
                .googleClientId("test-google-client-id")
                .googleClientSecretArn(GOOGLE_CLIENT_SECRET_ARN)
                .build();

        return new IdentityStack(app, "TestIdentityStack", props);
    }

    @Test
    void stackCreatesTwoUserPoolClientsOnTheSamePool() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Cognito::UserPool", 1);
        template.resourceCountIs("AWS::Cognito::UserPoolClient", 2);
    }

    @Test
    void booksClientUsesTheAuthorizationCodeFlowWithNoSecretAndPreventsUserExistenceErrors() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        // Locate the books client by name rather than relying on synthesis order.
        var booksClients = template.findResources(
                "AWS::Cognito::UserPoolClient",
                Map.of("Properties", Map.of("AllowedOAuthFlows", List.of("code"))));
        assertEquals(2, booksClients.size(), "both clients use the authorization code grant");

        var booksClient = booksClients.values().stream()
                .filter(resource -> {
                    @SuppressWarnings("unchecked")
                    var properties = (Map<String, Object>) resource.get("Properties");
                    return String.valueOf(properties.get("ClientName")).endsWith("-books-client");
                })
                .findFirst()
                .orElseThrow(() -> new AssertionError("no books client found"));

        @SuppressWarnings("unchecked")
        var properties = (Map<String, Object>) booksClient.get("Properties");
        assertFalse((Boolean) properties.get("GenerateSecret"), "the books client must not generate a client secret");
        assertEquals("ENABLED", properties.get("PreventUserExistenceErrors"));
        assertEquals(List.of("code"), properties.get("AllowedOAuthFlows"));
        assertEquals(List.of("email", "openid", "profile"), properties.get("AllowedOAuthScopes"));
        assertEquals(List.of("Google"), properties.get("SupportedIdentityProviders"));
    }

    @Test
    void ciBooksClientCallbackAndLogoutUrlsCoverTheCiHostAndLocalhost() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        var expectedUrls = List.of(
                "https://ci-spreadsheets.diyaccounting.co.uk/books/",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/bst.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/se.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/taxi.html",
                "https://ci-spreadsheets.diyaccounting.co.uk/books/ltd.html",
                "http://localhost:3000/books/",
                "http://localhost:3000/books/bst.html",
                "http://localhost:3000/books/se.html",
                "http://localhost:3000/books/taxi.html",
                "http://localhost:3000/books/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-books-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void prodBooksClientCallbackAndLogoutUrlsCoverOnlyTheProdHost() {
        IdentityStack stack = synthIdentityStack("prod");
        Template template = Template.fromStack(stack);

        var expectedUrls = List.of(
                "https://spreadsheets.diyaccounting.co.uk/books/",
                "https://spreadsheets.diyaccounting.co.uk/books/bst.html",
                "https://spreadsheets.diyaccounting.co.uk/books/se.html",
                "https://spreadsheets.diyaccounting.co.uk/books/taxi.html",
                "https://spreadsheets.diyaccounting.co.uk/books/ltd.html");

        template.hasResourceProperties(
                "AWS::Cognito::UserPoolClient",
                Match.objectLike(Map.of(
                        "ClientName",
                        Match.stringLikeRegexp(".*-books-client$"),
                        "CallbackURLs",
                        Match.arrayEquals(expectedUrls),
                        "LogoutURLs",
                        Match.arrayEquals(expectedUrls))));
    }

    @Test
    void booksClientIdIsPublishedAsAStackOutputAndAnSsmParameter() {
        IdentityStack stack = synthIdentityStack("ci");
        Template template = Template.fromStack(stack);

        template.hasOutput("BooksUserPoolClientId", Match.anyValue());
        template.hasResourceProperties(
                "AWS::SSM::Parameter",
                Match.objectLike(Map.of("Name", "/submit/ci/spreadsheets-books-app-client-id")));
    }
}
