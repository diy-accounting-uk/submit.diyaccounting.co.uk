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
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

class CompaniesHouseStackTest {

    private static final String API_KEY_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/companies-house/api_key";

    private static final String CLIENT_SECRET_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/companies-house/client_secret";

    private static CompaniesHouseStack synthCompaniesHouseStack() {
        return synthCompaniesHouseStack("", "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(String companiesHouseApiKeyArn) {
        return synthCompaniesHouseStack(companiesHouseApiKeyArn, "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(
            String companiesHouseApiKeyArn, String companiesHouseClientSecretArn) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new CompaniesHouseStack(
                app,
                "TestCompaniesHouseStack",
                CompaniesHouseStack.CompaniesHouseStackProps.builder()
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
                        .baseImageTag("latest")
                        .companiesHouseBaseUri("https://api.company-information.service.gov.uk")
                        .companiesHouseApiKeyArn(companiesHouseApiKeyArn)
                        .companiesHouseFilingBaseUri("https://api-sandbox.company-information.service.gov.uk")
                        .companiesHouseIdentityBaseUri("https://identity-sandbox.company-information.service.gov.uk")
                        .companiesHouseClientId("test-companies-house-client-id")
                        .companiesHouseClientSecretArn(companiesHouseClientSecretArn)
                        .build());
    }

    // A blank identity base URI and client id is the real state before the operator has
    // registered the developer-hub application (and always the state for prod today, per the
    // ci-only gate) - the token Lambda must still synth cleanly in that state.
    private static CompaniesHouseStack synthCompaniesHouseStackWithBlankOAuthConfig() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new CompaniesHouseStack(
                app,
                "TestCompaniesHouseStack",
                CompaniesHouseStack.CompaniesHouseStackProps.builder()
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
                        .baseImageTag("latest")
                        .companiesHouseBaseUri("https://api.company-information.service.gov.uk")
                        .companiesHouseApiKeyArn("")
                        .companiesHouseFilingBaseUri("")
                        .companiesHouseIdentityBaseUri("")
                        .companiesHouseClientId("")
                        .companiesHouseClientSecretArn("")
                        .build());
    }

    @Test
    void stackWiresTheTwoLookupLambdasAndTheTokenLambda() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 3);
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName", stack.companiesHouseSearchGetLambdaProps.ingestFunctionName())));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName", stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName())));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(
                        Map.of("FunctionName", stack.companiesHouseTokenPostLambdaProps.ingestFunctionName())));
    }

    @Test
    void bothLookupLambdasCarryTheirDesignedRoute() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.GET, stack.companiesHouseSearchGetLambdaProps.httpMethod());
        assertEquals("/api/v1/companies-house/search", stack.companiesHouseSearchGetLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHouseCompanyGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}",
                stack.companiesHouseCompanyGetLambdaProps.urlPath());

        // Both routes sit behind the JWT authorizer, no custom authorizer: a signed-in user with
        // no purchased bundle still reaches these, matching the design's "default" bundle gate.
        assertEquals(true, stack.companiesHouseSearchGetLambdaProps.jwtAuthorizer());
        assertEquals(false, stack.companiesHouseSearchGetLambdaProps.customAuthorizer());
        assertEquals(true, stack.companiesHouseCompanyGetLambdaProps.jwtAuthorizer());
        assertEquals(false, stack.companiesHouseCompanyGetLambdaProps.customAuthorizer());
    }

    @Test
    void tokenLambdaCarriesItsDesignedRouteAndHasNoAuthorizer() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.POST, stack.companiesHouseTokenPostLambdaProps.httpMethod());
        assertEquals("/api/v1/companies-house/token", stack.companiesHouseTokenPostLambdaProps.urlPath());

        // No authorizer: the route is reached before any Companies House token exists, matching
        // hmrcTokenPost's own route.
        assertEquals(false, stack.companiesHouseTokenPostLambdaProps.jwtAuthorizer());
        assertEquals(false, stack.companiesHouseTokenPostLambdaProps.customAuthorizer());
    }

    @Test
    void lambdaFunctionPropsExposesAllThreeForApiStackToConsume() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(3, stack.lambdaFunctionProps.size());
        assertEquals(
                List.of(
                        "/api/v1/companies-house/search",
                        "/api/v1/companies-house/company/{companyNumber}",
                        "/api/v1/companies-house/token"),
                stack.lambdaFunctionProps.stream().map(p -> p.urlPath()).toList());
    }

    @Test
    void bothLambdasGetTheBaseUriAndNoApiKeyEnvVarWhenTheArnIsBlank() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals("https://api.company-information.service.gov.uk", env.get("COMPANIES_HOUSE_BASE_URI"));
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_API_KEY_ARN"),
                    "COMPANIES_HOUSE_API_KEY_ARN must not be set when the ARN is blank");
        }

        // No secretsmanager:GetSecretValue on a Companies House API key ARN when none was
        // configured; the salt-secret grant is unconditional so a GetSecretValue statement still
        // exists.
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        Match.stringLikeRegexp(".*companies-house/api_key.*"))))))))),
                0);
    }

    @Test
    void bothLambdasGetTheApiKeyArnEnvVarAndGrantWhenTheArnIsConfigured() {
        CompaniesHouseStack stack = synthCompaniesHouseStack(API_KEY_ARN);
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals(API_KEY_ARN, env.get("COMPANIES_HOUSE_API_KEY_ARN"));
        }

        // The wildcard suffix Secrets Manager requires, granted to both lookup Lambda roles.
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action", "secretsmanager:GetSecretValue", "Resource", API_KEY_ARN + "-*")))))))),
                2);
    }

    @Test
    void lookupLambdasQueryBundlesAndAllThreeLambdasPublishActivityEvents() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        // Only the two lookup Lambdas query the bundles table; the token exchange has no
        // authorizer and so no user to check a bundle entitlement against.
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(
                                        List.of(Match.objectLike(Map.of("Action", "dynamodb:Query")))))))),
                2);
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(
                                        List.of(Match.objectLike(Map.of("Action", "events:PutEvents")))))))),
                3);
    }

    @Test
    void tokenLambdaReadsTheClientSecret() {
        CompaniesHouseStack stack = synthCompaniesHouseStack("", CLIENT_SECRET_ARN);
        Template template = Template.fromStack(stack);

        var functions = template.findResources(
                "AWS::Lambda::Function",
                Map.of(
                        "Properties",
                        Map.of("FunctionName", stack.companiesHouseTokenPostLambdaProps.ingestFunctionName())));
        assertEquals(1, functions.size());
        var env = environmentVariablesOf(functions);
        assertEquals(CLIENT_SECRET_ARN, env.get("COMPANIES_HOUSE_CLIENT_SECRET_ARN"));

        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        CLIENT_SECRET_ARN + "-*")))))))),
                1);
    }

    @Test
    void filingLambdasCannotReadTheClientSecret() {
        CompaniesHouseStack stack = synthCompaniesHouseStack("", CLIENT_SECRET_ARN);
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_CLIENT_SECRET_ARN"),
                    "Only the token Lambda's environment carries the OAuth client secret ARN");
        }
    }

    @Test
    void blankClientSecretArnLeavesTheVariableUnset() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        var functions = template.findResources(
                "AWS::Lambda::Function",
                Map.of(
                        "Properties",
                        Map.of("FunctionName", stack.companiesHouseTokenPostLambdaProps.ingestFunctionName())));
        assertEquals(1, functions.size());
        var env = environmentVariablesOf(functions);
        assertFalse(
                env.containsKey("COMPANIES_HOUSE_CLIENT_SECRET_ARN"),
                "COMPANIES_HOUSE_CLIENT_SECRET_ARN must not be set when the ARN is blank");

        // No secretsmanager:GetSecretValue on the client secret ARN pattern when none was
        // configured; the salt-secret grant is unconditional so a GetSecretValue statement still
        // exists.
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "secretsmanager:GetSecretValue",
                                        "Resource",
                                        Match.stringLikeRegexp(".*companies-house/client_secret.*"))))))))),
                0);
    }

    @Test
    void blankIdentityBaseUriAndClientIdLeaveTheirVariablesUnsetAndStillSynth() {
        CompaniesHouseStack stack = synthCompaniesHouseStackWithBlankOAuthConfig();
        Template template = Template.fromStack(stack);

        var functions = template.findResources(
                "AWS::Lambda::Function",
                Map.of(
                        "Properties",
                        Map.of("FunctionName", stack.companiesHouseTokenPostLambdaProps.ingestFunctionName())));
        assertEquals(1, functions.size());
        var env = environmentVariablesOf(functions);
        assertFalse(env.containsKey("COMPANIES_HOUSE_IDENTITY_BASE_URI"));
        assertFalse(env.containsKey("COMPANIES_HOUSE_CLIENT_ID"));
        assertFalse(env.containsKey("COMPANIES_HOUSE_CLIENT_SECRET_ARN"));
    }

    @Test
    void stackHealthAlarmCoversAllThreeLambdas() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        // One composite health alarm plus one CloudWatch alarm per Lambda's own error/duration
        // checks feeds it; the exact per-function alarm count is asserted at the full-application
        // level (SubmitApplicationCdkResourceTest), this test only guards that the composite
        // alarm itself exists for this stack.
        template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 1);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> environmentVariablesOf(Map<String, Map<String, Object>> functions) {
        var resource = functions.values().iterator().next();
        var properties = (Map<String, Object>) resource.get("Properties");
        var environment = (Map<String, Object>) properties.get("Environment");
        return (Map<String, Object>) environment.get("Variables");
    }
}
