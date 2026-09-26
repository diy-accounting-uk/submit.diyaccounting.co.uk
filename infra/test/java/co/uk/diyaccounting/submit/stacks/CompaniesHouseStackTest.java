/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

    private static final String PRESENTER_ID_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/companies-house/presenter_id";

    private static final String PRESENTER_CODE_ARN =
            "arn:aws:secretsmanager:eu-west-2:111111111111:secret:docs/submit/companies-house/presenter_code";

    private static CompaniesHouseStack synthCompaniesHouseStack() {
        return synthCompaniesHouseStack("", "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(String companiesHouseApiKeyArn) {
        return synthCompaniesHouseStack(companiesHouseApiKeyArn, "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(
            String companiesHouseApiKeyArn, String companiesHouseClientSecretArn) {
        return synthCompaniesHouseStack(companiesHouseApiKeyArn, companiesHouseClientSecretArn, "", "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStack(
            String companiesHouseApiKeyArn,
            String companiesHouseClientSecretArn,
            String companiesHousePresenterIdArn,
            String companiesHousePresenterCodeArn) {
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
                        .companiesHouseXmlGatewayUri("https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway")
                        .companiesHousePresenterIdArn(companiesHousePresenterIdArn)
                        .companiesHousePresenterCodeArn(companiesHousePresenterCodeArn)
                        .companiesHouseCsFeeWaivedCompanyNumbers("")
                        .build());
    }

    // Only envName varies here: everything else matches synthCompaniesHouseStack()'s defaults, so
    // this isolates what changes in the accounts Lambdas' environment between deployment
    // environments.
    private static CompaniesHouseStack synthCompaniesHouseStackForEnv(String envName) {
        return synthCompaniesHouseStackForEnv(envName, "");
    }

    private static CompaniesHouseStack synthCompaniesHouseStackForEnv(
            String envName, String companiesHouseCsFeeWaivedCompanyNumbers) {
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
                        .envName(envName)
                        .deploymentName(envName)
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .baseImageTag("latest")
                        .companiesHouseBaseUri("https://api.company-information.service.gov.uk")
                        .companiesHouseApiKeyArn("")
                        .companiesHouseFilingBaseUri("https://api-sandbox.company-information.service.gov.uk")
                        .companiesHouseIdentityBaseUri("https://identity-sandbox.company-information.service.gov.uk")
                        .companiesHouseClientId("test-companies-house-client-id")
                        .companiesHouseClientSecretArn("")
                        .companiesHouseXmlGatewayUri("https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway")
                        .companiesHousePresenterIdArn(PRESENTER_ID_ARN)
                        .companiesHousePresenterCodeArn(PRESENTER_CODE_ARN)
                        .companiesHouseCsFeeWaivedCompanyNumbers(companiesHouseCsFeeWaivedCompanyNumbers)
                        .build());
    }

    // A blank identity base URI and client id is the real state before the operator has
    // registered the developer-hub application (and always the state for prod today, per the
    // ci-only gate) - the token Lambda must still synth cleanly in that state, and so must the
    // six filing Lambdas with a blank filing base URI.
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
                        .companiesHouseXmlGatewayUri("")
                        .companiesHousePresenterIdArn("")
                        .companiesHousePresenterCodeArn("")
                        .companiesHouseCsFeeWaivedCompanyNumbers("")
                        .build());
    }

    private static List<String> filingLambdaFunctionNames(CompaniesHouseStack stack) {
        return List.of(
                stack.companiesHouseTransactionPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionPutLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailAddressPostLambdaProps.ingestFunctionName());
    }

    @Test
    void stackWiresTwentyOneLambdas() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 21);
        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseTokenPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionPutLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailAddressPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseOfficersGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", functionName)));
        }
    }

    @Test
    void bothLookupLambdasCarryTheirDesignedRoute() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.GET, stack.companiesHouseSearchGetLambdaProps.httpMethod());
        assertEquals("/api/v1/companies-house/search", stack.companiesHouseSearchGetLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHouseCompanyGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}", stack.companiesHouseCompanyGetLambdaProps.urlPath());

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
    void sixFilingLambdasSitBehindTheCustomAuthorizerAndRegisteredOfficeAddressReadSitsBehindJwt() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        for (var props : List.of(
                stack.companiesHouseTransactionPostLambdaProps,
                stack.companiesHouseTransactionGetLambdaProps,
                stack.companiesHouseTransactionPutLambdaProps,
                stack.companiesHouseRegisteredOfficeAddressPostLambdaProps,
                stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps,
                stack.companiesHouseRegisteredEmailAddressPostLambdaProps)) {
            assertEquals(
                    false,
                    props.jwtAuthorizer(),
                    "filing route " + props.urlPath() + " must not use the JWT authorizer");
            assertEquals(
                    true,
                    props.customAuthorizer(),
                    "filing route " + props.urlPath() + " must use the custom authorizer");
        }

        // The registered office address read carries no Companies House user token: it reads the
        // public register with the API key, matching the two lookup Lambdas' setting.
        assertEquals(true, stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.jwtAuthorizer());
        assertEquals(false, stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.customAuthorizer());
    }

    @Test
    void filingRoutesCarryTheirDesignedPathsAndMethods() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.POST, stack.companiesHouseTransactionPostLambdaProps.httpMethod());
        assertEquals("/api/v1/companies-house/transaction", stack.companiesHouseTransactionPostLambdaProps.urlPath());

        assertEquals(HttpMethod.GET, stack.companiesHouseTransactionGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/transaction/{transactionId}",
                stack.companiesHouseTransactionGetLambdaProps.urlPath());

        assertEquals(HttpMethod.PUT, stack.companiesHouseTransactionPutLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/transaction/{transactionId}",
                stack.companiesHouseTransactionPutLambdaProps.urlPath());

        assertEquals(HttpMethod.GET, stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}/registered-office-address",
                stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.urlPath());

        assertEquals(HttpMethod.POST, stack.companiesHouseRegisteredOfficeAddressPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/transaction/{transactionId}/registered-office-address",
                stack.companiesHouseRegisteredOfficeAddressPostLambdaProps.urlPath());

        assertEquals(HttpMethod.GET, stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility",
                stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps.urlPath());

        assertEquals(HttpMethod.POST, stack.companiesHouseRegisteredEmailAddressPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/transaction/{transactionId}/registered-email-address",
                stack.companiesHouseRegisteredEmailAddressPostLambdaProps.urlPath());
    }

    @Test
    void lambdaFunctionPropsExposesAllTwentyOneForApiStackToConsume() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(21, stack.lambdaFunctionProps.size());
        assertEquals(
                List.of(
                        "/api/v1/companies-house/search",
                        "/api/v1/companies-house/company/{companyNumber}",
                        "/api/v1/companies-house/token",
                        "/api/v1/companies-house/transaction",
                        "/api/v1/companies-house/transaction/{transactionId}",
                        "/api/v1/companies-house/transaction/{transactionId}",
                        "/api/v1/companies-house/company/{companyNumber}/registered-office-address",
                        "/api/v1/companies-house/transaction/{transactionId}/registered-office-address",
                        "/api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility",
                        "/api/v1/companies-house/transaction/{transactionId}/registered-email-address",
                        "/api/v1/companies-house/accounts/preview",
                        "/api/v1/companies-house/accounts",
                        "/api/v1/companies-house/accounts/{submissionNumber}",
                        "/api/v1/companies-house/company/{companyNumber}/officers",
                        "/api/v1/companies-house/company/{companyNumber}/persons-with-significant-control",
                        "/api/v1/companies-house/company/{companyNumber}/filing-data",
                        "/api/v1/companies-house/confirmation-statement/preview",
                        "/api/v1/companies-house/confirmation-statement",
                        "/api/v1/companies-house/confirmation-statement/{submissionNumber}",
                        "/api/v1/companies-house/psc-verification-statement",
                        "/api/v1/companies-house/psc-verification-statement/{submissionNumber}"),
                stack.lambdaFunctionProps.stream().map(p -> p.urlPath()).toList());
    }

    @Test
    void allFourLookupLambdasAndTheRegisteredOfficeAddressReadGetTheBaseUriAndNoApiKeyEnvVarWhenTheArnIsBlank() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseOfficersGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscGetLambdaProps.ingestFunctionName())) {
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
    void allFourLookupLambdasAndTheRegisteredOfficeAddressReadGetTheApiKeyArnEnvVarAndGrantWhenTheArnIsConfigured() {
        CompaniesHouseStack stack = synthCompaniesHouseStack(API_KEY_ARN);
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseSearchGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseOfficersGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals(API_KEY_ARN, env.get("COMPANIES_HOUSE_API_KEY_ARN"));
        }

        // The wildcard suffix Secrets Manager requires, granted to all five API-key Lambda roles
        // (search, company, registered office address read, officers, PSCs) and no others.
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
                                        API_KEY_ARN + "-*")))))))),
                5);
    }

    @Test
    void filingLambdasCarryTheFilingBaseUri() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        for (String functionName : filingLambdaFunctionNames(stack)) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals(
                    "https://api-sandbox.company-information.service.gov.uk",
                    env.get("COMPANIES_HOUSE_FILING_BASE_URI"));
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_API_KEY_ARN"),
                    "A filing Lambda's environment must not carry the API-key ARN - it authenticates with the user's token");
        }
    }

    @Test
    void blankFilingBaseUriLeavesTheVariableUnsetAndStillSynths() {
        CompaniesHouseStack stack = synthCompaniesHouseStackWithBlankOAuthConfig();
        Template template = Template.fromStack(stack);

        for (String functionName : filingLambdaFunctionNames(stack)) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_FILING_BASE_URI"),
                    "COMPANIES_HOUSE_FILING_BASE_URI must not be set when the filing base URI is blank");
        }
    }

    @Test
    void lookupAndFilingLambdasQueryBundlesAndAllTwentyOneLambdasPublishActivityEvents() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        // Every Lambda except the token exchange queries the bundles table: the two company
        // lookup routes, the registered office address read, the six filing routes, the three
        // accounts routes, the six confirmation statement routes, and the two PSC verification
        // statement routes, all gated by enforceBundles(). The token exchange has no authorizer
        // and so no user to check a bundle entitlement against.
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of("Action", "dynamodb:Query")))))))),
                20);
        template.resourcePropertiesCountIs(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of("Action", "events:PutEvents")))))))),
                21);
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
                stack.companiesHouseCompanyGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseTransactionPutLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredOfficeAddressPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailEligibilityGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseRegisteredEmailAddressPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseOfficersGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName())) {
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
    void stackHealthAlarmCoversTheCompaniesHouseLambdas() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        // One composite health alarm plus one CloudWatch alarm per Lambda's own error/duration
        // checks feeds it; the exact per-function alarm count is asserted at the full-application
        // level (SubmitApplicationCdkResourceTest), this test only guards that the composite
        // alarm itself exists for this stack.
        template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 1);
    }

    @Test
    void accountsRoutesCarryTheirDesignedPathsMethodsAndJwtOnlyAuthorizer() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.POST, stack.companiesHouseAccountsPreviewPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/accounts/preview",
                stack.companiesHouseAccountsPreviewPostLambdaProps.urlPath());
        assertEquals(HttpMethod.POST, stack.companiesHouseAccountsPostLambdaProps.httpMethod());
        assertEquals("/api/v1/companies-house/accounts", stack.companiesHouseAccountsPostLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHouseAccountsGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/accounts/{submissionNumber}",
                stack.companiesHouseAccountsGetLambdaProps.urlPath());

        // None of the three carries a Companies House OAuth token, so all three sit behind the
        // JWT authorizer alone, unlike the six OAuth filing Lambdas above.
        for (var props : List.of(
                stack.companiesHouseAccountsPreviewPostLambdaProps,
                stack.companiesHouseAccountsPostLambdaProps,
                stack.companiesHouseAccountsGetLambdaProps)) {
            assertEquals(
                    true, props.jwtAuthorizer(), "accounts route " + props.urlPath() + " must use the JWT authorizer");
            assertEquals(
                    false,
                    props.customAuthorizer(),
                    "accounts route " + props.urlPath() + " must not use the custom authorizer");
        }
    }

    @Test
    void accountsAndConfirmationStatementLambdasCarryTheXmlGatewayUri() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals(
                    "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway", env.get("COMPANIES_HOUSE_XMLGW_URI"));
        }
    }

    @Test
    void blankXmlGatewayUriLeavesTheVariableUnsetAndStillSynths() {
        CompaniesHouseStack stack = synthCompaniesHouseStackWithBlankOAuthConfig();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_XMLGW_URI"),
                    "COMPANIES_HOUSE_XMLGW_URI must not be set when the gateway URI is blank");
        }
    }

    @Test
    void officersAndPscRoutesCarryTheirDesignedPathsAndJwtOnlyAuthorizer() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.GET, stack.companiesHouseOfficersGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}/officers",
                stack.companiesHouseOfficersGetLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHousePscGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}/persons-with-significant-control",
                stack.companiesHousePscGetLambdaProps.urlPath());

        for (var props : List.of(stack.companiesHouseOfficersGetLambdaProps, stack.companiesHousePscGetLambdaProps)) {
            assertEquals(
                    true, props.jwtAuthorizer(), "lookup route " + props.urlPath() + " must use the JWT authorizer");
            assertEquals(
                    false,
                    props.customAuthorizer(),
                    "lookup route " + props.urlPath() + " must not use the custom authorizer");
        }
    }

    @Test
    void confirmationStatementRoutesCarryTheirDesignedPathsMethodsAndJwtOnlyAuthorizer() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.POST, stack.companiesHouseFilingDataPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/company/{companyNumber}/filing-data",
                stack.companiesHouseFilingDataPostLambdaProps.urlPath());
        assertEquals(HttpMethod.POST, stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/confirmation-statement/preview",
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.urlPath());
        assertEquals(HttpMethod.POST, stack.companiesHouseConfirmationStatementPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/confirmation-statement",
                stack.companiesHouseConfirmationStatementPostLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHouseConfirmationStatementGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/confirmation-statement/{submissionNumber}",
                stack.companiesHouseConfirmationStatementGetLambdaProps.urlPath());

        // None of the four carries a Companies House OAuth token, so all four sit behind the JWT
        // authorizer alone, unlike the six OAuth filing Lambdas above.
        for (var props : List.of(
                stack.companiesHouseFilingDataPostLambdaProps,
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps,
                stack.companiesHouseConfirmationStatementPostLambdaProps,
                stack.companiesHouseConfirmationStatementGetLambdaProps)) {
            assertEquals(
                    true,
                    props.jwtAuthorizer(),
                    "confirmation statement route " + props.urlPath() + " must use the JWT authorizer");
            assertEquals(
                    false,
                    props.customAuthorizer(),
                    "confirmation statement route " + props.urlPath() + " must not use the custom authorizer");
        }
    }

    @Test
    void pscVerificationStatementRoutesCarryTheirDesignedPathsMethodsAndJwtOnlyAuthorizer() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();

        assertEquals(HttpMethod.POST, stack.companiesHousePscVerificationStatementPostLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/psc-verification-statement",
                stack.companiesHousePscVerificationStatementPostLambdaProps.urlPath());
        assertEquals(HttpMethod.GET, stack.companiesHousePscVerificationStatementGetLambdaProps.httpMethod());
        assertEquals(
                "/api/v1/companies-house/psc-verification-statement/{submissionNumber}",
                stack.companiesHousePscVerificationStatementGetLambdaProps.urlPath());

        // Neither carries a Companies House OAuth token, so both sit behind the JWT authorizer
        // alone, the same as the confirmation statement's own submit and poll routes.
        for (var props : List.of(
                stack.companiesHousePscVerificationStatementPostLambdaProps,
                stack.companiesHousePscVerificationStatementGetLambdaProps)) {
            assertEquals(
                    true,
                    props.jwtAuthorizer(),
                    "PSC verification statement route " + props.urlPath() + " must use the JWT authorizer");
            assertEquals(
                    false,
                    props.customAuthorizer(),
                    "PSC verification statement route " + props.urlPath() + " must not use the custom authorizer");
        }
    }

    @Test
    void ciEnablesGatewayTestOnEveryGatewayRouteAndSetsThePackageReferenceOnEachSubmitRouteOnly() {
        CompaniesHouseStack stack = synthCompaniesHouseStackForEnv("ci");
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals("true", env.get("COMPANIES_HOUSE_GATEWAY_TEST"));
        }

        for (String functionName : List.of(
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals("0012", environmentVariablesOf(functions).get("COMPANIES_HOUSE_PACKAGE_REFERENCE"));
        }

        // The three poll routes and the filing-data lookup have no PackageReference field to
        // carry - only a submission does.
        for (String functionName : List.of(
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertFalse(environmentVariablesOf(functions).containsKey("COMPANIES_HOUSE_PACKAGE_REFERENCE"));
        }

        // Neither preview reaches the gateway, so both carry neither.
        for (String functionName : List.of(
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            var previewEnv = environmentVariablesOf(functions);
            assertFalse(previewEnv.containsKey("COMPANIES_HOUSE_GATEWAY_TEST"));
            assertFalse(previewEnv.containsKey("COMPANIES_HOUSE_PACKAGE_REFERENCE"));
        }
    }

    @Test
    void everyOtherEnvironmentLeavesGatewayTestOffAndThePackageReferenceUnset() {
        CompaniesHouseStack stack = synthCompaniesHouseStackForEnv("prod");
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals("false", env.get("COMPANIES_HOUSE_GATEWAY_TEST"));
            assertFalse(
                    env.containsKey("COMPANIES_HOUSE_PACKAGE_REFERENCE"),
                    "the live package reference is not yet known, so it must stay unset rather than submit blank");
        }
    }

    @Test
    void confirmationStatementPostLambdaCarriesTheFeeWaiverListOnlyWhenConfigured() {
        CompaniesHouseStack waived = synthCompaniesHouseStackForEnv("prod", "06846849");
        var waivedFunctions = Template.fromStack(waived)
                .findResources(
                        "AWS::Lambda::Function",
                        Map.of(
                                "Properties",
                                Map.of(
                                        "FunctionName",
                                        waived.companiesHouseConfirmationStatementPostLambdaProps
                                                .ingestFunctionName())));
        assertEquals(
                "06846849",
                environmentVariablesOf(waivedFunctions).get("COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS"));

        CompaniesHouseStack unwaived = synthCompaniesHouseStackForEnv("ci");
        var unwaivedFunctions = Template.fromStack(unwaived)
                .findResources(
                        "AWS::Lambda::Function",
                        Map.of(
                                "Properties",
                                Map.of(
                                        "FunctionName",
                                        unwaived.companiesHouseConfirmationStatementPostLambdaProps
                                                .ingestFunctionName())));
        assertFalse(
                environmentVariablesOf(unwaivedFunctions).containsKey("COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS"));
    }

    @Test
    void everyGatewayReachingLambdaReadsBothPresenterSecretsAndBothPreviewsCannot() {
        CompaniesHouseStack stack = synthCompaniesHouseStack("", "", PRESENTER_ID_ARN, PRESENTER_CODE_ARN);
        Template template = Template.fromStack(stack);

        // The wildcard suffix Secrets Manager requires, granted to exactly the seven Lambda roles
        // that reach the gateway (accounts submit/poll, filing-data, confirmation statement
        // submit/poll, PSC verification statement submit/poll) for each of the two presenter
        // secrets.
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
                                        PRESENTER_ID_ARN + "-*")))))))),
                7);
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
                                        PRESENTER_CODE_ARN + "-*")))))))),
                7);
    }

    @Test
    void everyGatewayReachingLambdaCarriesBothPresenterSecretArnsAndBothPreviewsCarryNeither() {
        CompaniesHouseStack stack = synthCompaniesHouseStack("", "", PRESENTER_ID_ARN, PRESENTER_CODE_ARN);
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHousePscVerificationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertEquals(PRESENTER_ID_ARN, env.get("COMPANIES_HOUSE_PRESENTER_ID_ARN"));
            assertEquals(PRESENTER_CODE_ARN, env.get("COMPANIES_HOUSE_PRESENTER_CODE_ARN"));
        }

        for (String functionName : List.of(
                stack.companiesHouseAccountsPreviewPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPreviewPostLambdaProps.ingestFunctionName())) {
            var previewFunctions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, previewFunctions.size());
            var previewEnv = environmentVariablesOf(previewFunctions);
            assertFalse(previewEnv.containsKey("COMPANIES_HOUSE_PRESENTER_ID_ARN"));
            assertFalse(previewEnv.containsKey("COMPANIES_HOUSE_PRESENTER_CODE_ARN"));
        }
    }

    @Test
    void blankPresenterSecretArnsGrantNothingAndStillSynth() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.companiesHouseAccountsPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseAccountsGetLambdaProps.ingestFunctionName(),
                stack.companiesHouseFilingDataPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementPostLambdaProps.ingestFunctionName(),
                stack.companiesHouseConfirmationStatementGetLambdaProps.ingestFunctionName())) {
            var functions = template.findResources(
                    "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
            assertEquals(1, functions.size());
            var env = environmentVariablesOf(functions);
            assertFalse(env.containsKey("COMPANIES_HOUSE_PRESENTER_ID_ARN"));
            assertFalse(env.containsKey("COMPANIES_HOUSE_PRESENTER_CODE_ARN"));
        }

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
                                        Match.stringLikeRegexp(".*presenter_id.*"))))))))),
                0);
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
                                        Match.stringLikeRegexp(".*presenter_code.*"))))))))),
                0);
    }

    // CloudFormation refuses a stack past 500 resources. Every filing form this plan adds another
    // Lambda pair to (CS-13a's PSC verification statement, the horizons this stack is likely to
    // grow into next) pushes this stack's own count up, so this guards the room left before that
    // wall, rather than waiting to hit it during a real deploy.
    @Test
    void stackStaysWellUnderTheCloudFormationFiveHundredResourceLimit() {
        CompaniesHouseStack stack = synthCompaniesHouseStack();
        Map<String, Object> resources = resourcesOf(Template.fromStack(stack));
        assertTrue(
                resources.size() < 500,
                "CompaniesHouseStack synths " + resources.size()
                        + " resources, approaching CloudFormation's 500-per-stack limit");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> resourcesOf(Template template) {
        Map<String, Object> json = (Map<String, Object>) template.toJSON();
        return (Map<String, Object>) json.get("Resources");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> environmentVariablesOf(Map<String, Map<String, Object>> functions) {
        var resource = functions.values().iterator().next();
        var properties = (Map<String, Object>) resource.get("Properties");
        var environment = (Map<String, Object>) properties.get("Environment");
        return (Map<String, Object>) environment.get("Variables");
    }
}
