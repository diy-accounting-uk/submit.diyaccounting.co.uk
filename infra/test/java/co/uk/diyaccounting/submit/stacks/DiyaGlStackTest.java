/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class DiyaGlStackTest {

    private static final String DIYA_GL_BUCKET_NAME = "docs-env-diya-gl-111111111111";
    private static final String BOOKS_ALLOWED_ORIGINS =
            "https://ci-spreadsheets.diyaccounting.co.uk,http://localhost:3000";

    private static DiyaGlStack synthDiyaGlStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new DiyaGlStack(
                app,
                "TestDiyaGlStack",
                DiyaGlStack.DiyaGlStackProps.builder()
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
                        .diyaGlBucketName(DIYA_GL_BUCKET_NAME)
                        .booksAllowedOrigins(BOOKS_ALLOWED_ORIGINS)
                        .build());
    }

    @Test
    void stackWiresFourLambdas() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        template.resourceCountIs("AWS::Lambda::Function", 4);
        for (String functionName : List.of(
                stack.diyaGlListGetLambdaProps.ingestFunctionName(),
                stack.diyaGlVersionGetLambdaProps.ingestFunctionName(),
                stack.diyaGlPutLambdaProps.ingestFunctionName(),
                stack.diyaGlDeleteLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function", Match.objectLike(Map.of("FunctionName", functionName)));
        }
    }

    @Test
    void everyFunctionGetsTheBucketNameAllowedOriginsAndEnvironmentName() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.diyaGlListGetLambdaProps.ingestFunctionName(),
                stack.diyaGlVersionGetLambdaProps.ingestFunctionName(),
                stack.diyaGlPutLambdaProps.ingestFunctionName(),
                stack.diyaGlDeleteLambdaProps.ingestFunctionName())) {
            template.hasResourceProperties(
                    "AWS::Lambda::Function",
                    Match.objectLike(Map.of(
                            "FunctionName",
                            functionName,
                            "Environment",
                            Match.objectLike(Map.of(
                                    "Variables",
                                    Match.objectLike(Map.of(
                                            "DIYA_GL_BUCKET_NAME", DIYA_GL_BUCKET_NAME,
                                            "ENVIRONMENT_NAME", "docs",
                                            "DIYA_GL_ALLOWED_ORIGINS", BOOKS_ALLOWED_ORIGINS)))))));
        }
    }

    @Test
    void thePutFunctionGetsQuotaAndEntitlementEnvironmentVariables() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        stack.diyaGlPutLambdaProps.ingestFunctionName(),
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "DIYA_GL_MAX_BYTES", "2097152",
                                        "DIYA_GL_MAX_PER_USER", "20",
                                        "DIYA_GL_VERSIONS_KEPT", "30",
                                        "DIYA_GL_ENTITLEMENT_ENFORCED", "false",
                                        "DIYA_GL_BUNDLE_ID", "resident-diya-gl",
                                        "BUNDLE_DYNAMODB_TABLE_NAME", "docs-env-bundles")))))));
    }

    @Test
    void onlyThePutFunctionGetsWriteAccessToTheBucket() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        assertTrue(
                iamStatementsForFunction(template, stack.diyaGlPutLambdaProps.ingestFunctionName()).stream()
                        .anyMatch(statement -> actionsOf(statement).contains("s3:PutObject")),
                "expected the put function to have s3:PutObject");

        for (String functionName : List.of(
                stack.diyaGlListGetLambdaProps.ingestFunctionName(),
                stack.diyaGlVersionGetLambdaProps.ingestFunctionName(),
                stack.diyaGlDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .noneMatch(statement -> actionsOf(statement).contains("s3:PutObject")),
                    "expected " + functionName + " to have no s3:PutObject");
        }
    }

    @Test
    void noFunctionGetsWildcardS3Access() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.diyaGlListGetLambdaProps.ingestFunctionName(),
                stack.diyaGlVersionGetLambdaProps.ingestFunctionName(),
                stack.diyaGlPutLambdaProps.ingestFunctionName(),
                stack.diyaGlDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .noneMatch(statement -> actionsOf(statement).contains("s3:*")),
                    functionName + " has a wildcard s3 action");
        }
    }

    @Test
    void everyFunctionHasSaltSecretAccess() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);

        for (String functionName : List.of(
                stack.diyaGlListGetLambdaProps.ingestFunctionName(),
                stack.diyaGlVersionGetLambdaProps.ingestFunctionName(),
                stack.diyaGlPutLambdaProps.ingestFunctionName(),
                stack.diyaGlDeleteLambdaProps.ingestFunctionName())) {
            assertTrue(
                    iamStatementsForFunction(template, functionName).stream()
                            .anyMatch(statement -> actionsOf(statement).contains("secretsmanager:GetSecretValue")),
                    "expected " + functionName + " to have salt secret access");
        }
    }

    @Test
    void outputsCarryTheApiBaseUrl() {
        DiyaGlStack stack = synthDiyaGlStack();
        Template template = Template.fromStack(stack);
        String expectedBaseUrl = SubmitSharedNames.forDocs().publicBaseUrl + "api/v1/diya-gl";

        template.hasOutput("DiyaGlApiBaseUrl", Match.objectLike(Map.of("Value", expectedBaseUrl)));
    }

    @Test
    void lambdaFunctionPropsCarryBothTheDiyaGlAndTheBooksPathForEveryRoutePermanently() {
        DiyaGlStack stack = synthDiyaGlStack();

        assertEquals(
                8,
                stack.lambdaFunctionProps.size(),
                "expected four routes doubled: /api/v1/diya-gl and /api/v1/books are both served permanently");

        var urlPaths =
                stack.lambdaFunctionProps.stream().map(AbstractApiLambdaProps::urlPath).toList();
        assertTrue(urlPaths.contains("/api/v1/diya-gl"));
        assertTrue(urlPaths.contains("/api/v1/books"));
        assertTrue(urlPaths.contains("/api/v1/diya-gl/{bookId}/versions/{version}"));
        assertTrue(urlPaths.contains("/api/v1/books/{bookId}/versions/{version}"));
        assertTrue(urlPaths.contains("/api/v1/diya-gl/{bookId}"));
        assertTrue(urlPaths.contains("/api/v1/books/{bookId}"));

        // Both entries resolve to the same underlying Lambda, so this is one implementation
        // published under two permanent routes, not two drifting copies.
        var byFunctionName = stack.lambdaFunctionProps.stream()
                .collect(java.util.stream.Collectors.groupingBy(AbstractApiLambdaProps::ingestFunctionName));
        for (var entry : byFunctionName.entrySet()) {
            assertEquals(
                    2,
                    entry.getValue().size(),
                    "expected exactly a diya-gl-path and a books-path route for " + entry.getKey());
        }
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
