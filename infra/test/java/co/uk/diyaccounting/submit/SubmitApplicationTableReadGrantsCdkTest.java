/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.SubmitApplicationCdkSupport.*;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.AppProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

/**
 * Under more than one salt version the data layer reads a row before it updates or deletes it
 * (locateBundleOwner for bundles, ownerHashOfClient for practice clients). A single-version
 * deployment skips that read, so only a multi-version deployment shows a missing
 * dynamodb:GetItem. This test finds the missing grant in the synthesised template instead.
 */
class SubmitApplicationTableReadGrantsCdkTest extends SubmitApplicationCdkTestEnvironment {

    private static final Set<String> ROW_WRITE_ACTIONS = Set.of("dynamodb:UpdateItem", "dynamodb:DeleteItem");

    @Test
    void everyLambdaThatUpdatesOrDeletesBundlesCanAlsoGetThem() throws IOException {
        assertNoWriterWithoutGetItem("BUNDLE_DYNAMODB_TABLE_NAME");
    }

    @Test
    void everyLambdaThatUpdatesPracticeClientsCanAlsoGetThem() throws IOException {
        assertNoWriterWithoutGetItem("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME");
    }

    @Test
    void theCheckNamesALambdaWhoseGrantLacksGetItem() {
        var statements = List.<Map<String, Object>>of(Map.of(
                "Effect", "Allow",
                "Action", List.of("dynamodb:Query", "dynamodb:DeleteItem"),
                "Resource", "arn:aws:dynamodb:eu-west-2:1:table/docs-env-bundles"));
        assertTrue(writesWithoutGetItem(statements, "docs-env-bundles"));
    }

    private void assertNoWriterWithoutGetItem(String tableEnvironmentVariable) throws IOException {
        Path cdkJsonPath = Path.of("cdk-application/cdk.json").toAbsolutePath();
        Map<String, Object> ctx = buildContextPropertyMapFromCdkJsonPath(cdkJsonPath);
        App app = new App(AppProps.builder().context(ctx).build());
        SubmitApplication.SubmitApplicationProps appProps = SubmitApplication.loadAppProps(app, "cdk-application/");
        new SubmitApplication(app, appProps);

        List<String> offenders = new ArrayList<>();
        int checked = 0;
        for (var child : app.getNode().getChildren()) {
            if (!(child instanceof Stack stack)) continue;
            Template template = Template.fromStack(stack);
            for (var function : template.findResources("AWS::Lambda::Function").values()) {
                Map<String, Object> properties = asMap(function.get("Properties"));
                String tableName = tableNameIn(properties, tableEnvironmentVariable);
                if (tableName == null) continue;
                checked++;
                if (writesWithoutGetItem(statementsOf(template, properties), tableName)) {
                    offenders.add(stack.getStackName() + " / " + properties.get("FunctionName"));
                }
            }
        }
        assertTrue(checked > 0, "no Lambda carries " + tableEnvironmentVariable);
        assertTrue(
                offenders.isEmpty(),
                "Lambdas that update or delete rows of the table in " + tableEnvironmentVariable
                        + " without dynamodb:GetItem on it: " + offenders);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private static String tableNameIn(Map<String, Object> functionProperties, String variable) {
        Object environment = functionProperties.get("Environment");
        if (environment == null) return null;
        Object value = asMap(asMap(environment).get("Variables")).get(variable);
        return value instanceof String name ? name : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> statementsOf(Template template, Map<String, Object> functionProperties) {
        String roleLogicalId = String.valueOf(
                ((List<Object>) asMap(functionProperties.get("Role")).get("Fn::GetAtt")).get(0));
        List<Map<String, Object>> statements = new ArrayList<>();
        for (var policy : template.findResources("AWS::IAM::Policy").values()) {
            Map<String, Object> properties = asMap(policy.get("Properties"));
            boolean attached = ((List<Map<String, Object>>) properties.get("Roles"))
                    .stream().anyMatch(role -> roleLogicalId.equals(String.valueOf(role.get("Ref"))));
            if (!attached) continue;
            Map<String, Object> document = asMap(properties.get("PolicyDocument"));
            statements.addAll((List<Map<String, Object>>) document.get("Statement"));
        }
        return statements;
    }

    @SuppressWarnings("unchecked")
    private static boolean writesWithoutGetItem(List<Map<String, Object>> statements, String tableName) {
        Set<String> actions = new HashSet<>();
        for (var statement : statements) {
            Object resource = statement.get("Resource");
            List<Object> resources = resource instanceof List<?> ? (List<Object>) resource : List.of(resource);
            if (resources.stream().noneMatch(r -> String.valueOf(r).contains(tableName))) continue;
            Object action = statement.get("Action");
            if (action instanceof List<?> list) list.forEach(a -> actions.add(String.valueOf(a)));
            else actions.add(String.valueOf(action));
        }
        boolean writes = actions.stream().anyMatch(ROW_WRITE_ACTIONS::contains);
        return writes && !actions.contains("dynamodb:GetItem");
    }
}
