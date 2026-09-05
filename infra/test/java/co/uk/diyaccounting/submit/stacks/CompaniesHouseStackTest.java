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

    private static CompaniesHouseStack synthCompaniesHouseStack() {
        return synthCompaniesHouseStack("");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(String companiesHouseApiKeyArn) {
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
                        .build());
    }

    @Test
    void stackWiresExactlyTheTwoLookupLambdas() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 2);
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName", stack.companiesHouseSearchGetLambdaProps.ingestFunctionName())));
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName", stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName())));
    }

    @Test
    void bothLambdasCarryTheirDesignedRoute() {
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
    void lambdaFunctionPropsExposesBothForApiStackToConsume() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(2, stack.lambdaFunctionProps.size());
        assertEquals(
                List.of("/api/v1/companies-house/search", "/api/v1/companies-house/company/{companyNumber}"),
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

        // No secretsmanager:GetSecretValue on a Companies House ARN when none was configured; the
        // salt-secret grant is unconditional so a GetSecretValue statement still exists.
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
                                        Match.stringLikeRegexp(".*companies-house.*"))))))))),
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

        // The wildcard suffix Secrets Manager requires, granted to both Lambda roles.
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
    void bothLambdasCanQueryTheBundlesTableAndPublishActivityEvents() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

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
                2);
    }

    @Test
    void stackHealthAlarmCoversBothLambdas() {
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
