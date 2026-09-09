/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class BooksStackTest {

    private static final String BOOKS_BUCKET_NAME = "docs-env-books-111111111111";
    private static final String BOOKS_ALLOWED_ORIGINS = "https://ci-spreadsheets.diyaccounting.co.uk,http://localhost:3000";

    private static BooksStack synthBooksStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new BooksStack(
                app,
                "TestBooksStack",
                BooksStack.BooksStackProps.builder()
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
                        .booksBucketName(BOOKS_BUCKET_NAME)
                        .booksAllowedOrigins(BOOKS_ALLOWED_ORIGINS)
                        .build());
    }

    @Test
    void stackWiresFourLambdas() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 4);
        for (String functionName : List.of(
                stack.booksListGetLambdaProps.ingestFunctionName(),
                stack.booksVersionGetLambdaProps.ingestFunctionName(),
                stack.booksPutLambdaProps.ingestFunctionName(),
                stack.booksDeleteLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", functionName)));
        }
    }

    @Test
    void everyFunctionGetsTheBucketNameAllowedOriginsAndEnvironmentName() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.booksListGetLambdaProps.ingestFunctionName(),
                stack.booksVersionGetLambdaProps.ingestFunctionName(),
                stack.booksPutLambdaProps.ingestFunctionName(),
                stack.booksDeleteLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function",
                    Match.objectLike(Map.of(
                            "FunctionName",
                            functionName,
                            "Environment",
                            Match.objectLike(Map.of(
                                    "Variables",
                                    Match.objectLike(Map.of(
                                            "BOOKS_BUCKET_NAME", BOOKS_BUCKET_NAME,
                                            "ENVIRONMENT_NAME", "docs",
                                            "BOOKS_ALLOWED_ORIGINS", BOOKS_ALLOWED_ORIGINS)))))));
        }
    }

    @Test
    void thePutFunctionGetsQuotaAndEntitlementEnvironmentVariables() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        stack.booksPutLambdaProps.ingestFunctionName(),
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "BOOKS_MAX_BYTES", "2097152",
                                        "BOOKS_MAX_PER_USER", "20",
                                        "BOOKS_VERSIONS_KEPT", "30",
                                        "BOOKS_ENTITLEMENT_ENFORCED", "false",
                                        "BOOKS_BUNDLE_ID", "resident-diya-gl",
                                        "BUNDLE_DYNAMODB_TABLE_NAME", "docs-env-bundles")))))));
    }

    @Test
    void onlyThePutFunctionGetsWriteAccessToTheBucket() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        assertTrue(
                iamStatementsForFunction(template, stack.booksPutLambdaProps.ingestFunctionName()).stream()
                        .anyMatch(statement -> actionsOf(statement).contains("s3:PutObject")),
                "expected the put function to have s3:PutObject");

        for (String functionName : List.of(
                stack.booksListGetLambdaProps.ingestFunctionName(),
                stack.booksVersionGetLambdaProps.ingestFunctionName(),
                stack.booksDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .noneMatch(statement -> actionsOf(statement).contains("s3:PutObject")),
                    "expected " + functionName + " to have no s3:PutObject");
        }
    }

    @Test
    void noFunctionGetsWildcardS3Access() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.booksListGetLambdaProps.ingestFunctionName(),
                stack.booksVersionGetLambdaProps.ingestFunctionName(),
                stack.booksPutLambdaProps.ingestFunctionName(),
                stack.booksDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .noneMatch(statement -> actionsOf(statement).contains("s3:*")),
                    functionName + " has a wildcard s3 action");
        }
    }

    @Test
    void everyFunctionHasSaltSecretAccess() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.booksListGetLambdaProps.ingestFunctionName(),
                stack.booksVersionGetLambdaProps.ingestFunctionName(),
                stack.booksPutLambdaProps.ingestFunctionName(),
                stack.booksDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .anyMatch(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue")),
                    "expected " + functionName + " to have salt secret access");
        }
    }

    @Test
    void outputsCarryTheApiBaseUrl() {
        BooksStack stack = synthBooksStack();
        Template template = Template.fromStack(stack);
        String expectedBaseUrl = SubmitSharedNames.forDocs().publicBaseUrl + "api/v1/books";

        template.hasOutput("BooksApiBaseUrl", Match.objectLike(Map.of("Value", expectedBaseUrl)));
    }

    @SuppressWarnings("unchecked")
    private static List<String> actionsOf(Map<String, Object> statement) {
        Object action = statement.get("Action");
        return action instanceof List<?> list ? (List<String>) list : List.of(String.valueOf(action));
    }

    /**
     * Finds every IAM policy statement attached (directly or via an inline role policy) to the
     * given Lambda function's role, by matching the policy's role reference back to the
     * function's own role.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> iamStatementsForFunction(Template template, String functionName) {
        var functions = template.findResources(
                "AWS::Lambda::Function", Map.of("Properties", Map.of("FunctionName", functionName)));
        assertEquals(1, functions.size(), "expected exactly one function named " + functionName);
        var functionResource = functions.values().iterator().next();
        var functionProperties = (Map<String, Object>) functionResource.get("Properties");
        var roleRef = (Map<String, Object>) functionProperties.get("Role");
        // Role is {"Fn::GetAtt": ["<RoleLogicalId>", "Arn"]}
        var roleGetAtt = (List<Object>) roleRef.get("Fn::GetAtt");
        String roleLogicalId = (String) roleGetAtt.get(0);

        var statements = new java.util.ArrayList<Map<String, Object>>();
        template.findResources("AWS::IAM::Policy").forEach((id, policy) -> {
            var properties = (Map<String, Object>) policy.get("Properties");
            var roles = (List<Object>) properties.get("Roles");
            boolean attachedToThisRole = roles.stream().anyMatch(role -> {
                if (!(role instanceof Map)) {
                    return false;
                }
                var refMap = (Map<String, Object>) role;
                return roleLogicalId.equals(refMap.get("Ref"));
            });
            if (!attachedToThisRole) {
                return;
            }
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            var docStatements = (List<Map<String, Object>>) document.get("Statement");
            statements.addAll(docStatements);
        });
        return statements;
    }
}
