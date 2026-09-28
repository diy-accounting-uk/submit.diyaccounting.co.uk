/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import java.util.List;
import java.util.Map;
import software.amazon.awscdk.assertions.Template;

/**
 * Shared IAM assertions for Lambdas that charge a token via tokenEnforcement's
 * consumeTokenForActivity or chargeTokenOnSuccess. Those calls issue a conditional
 * dynamodb:UpdateItem against the bundles table, so the Lambda's own role must hold that action on
 * that table, not just dynamodb:Query.
 */
final class BundlesTableIamAssertions {

    private BundlesTableIamAssertions() {}

    @SuppressWarnings("unchecked")
    static boolean lambdaRoleCanUpdateBundlesTable(Template template, String functionName) {
        var functions = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .filter(properties -> functionName.equals(properties.get("FunctionName")))
                .toList();
        if (functions.size() != 1) {
            throw new IllegalStateException(
                    "expected exactly one Lambda named " + functionName + ", found " + functions.size());
        }
        var roleRef = (Map<String, Object>) functions.get(0).get("Role");
        var roleLogicalId = String.valueOf(((List<Object>) roleRef.get("Fn::GetAtt")).get(0));

        return template.findResources("AWS::IAM::Policy").values().stream()
                .map(policy -> (Map<String, Object>) policy.get("Properties"))
                .filter(properties -> ((List<Map<String, Object>>) properties.get("Roles"))
                        .stream().anyMatch(role -> roleLogicalId.equals(String.valueOf(role.get("Ref")))))
                .map(properties -> (Map<String, Object>) properties.get("PolicyDocument"))
                .flatMap(document -> ((List<Map<String, Object>>) document.get("Statement")).stream())
                .anyMatch(BundlesTableIamAssertions::statementGrantsUpdateItemOnBundlesTable);
    }

    @SuppressWarnings("unchecked")
    private static boolean statementGrantsUpdateItemOnBundlesTable(Map<String, Object> statement) {
        Object action = statement.get("Action");
        List<Object> actions =
                action instanceof List<?> ? (List<Object>) action : action == null ? List.of() : List.of(action);
        if (actions.stream().noneMatch("dynamodb:UpdateItem"::equals)) {
            return false;
        }

        Object resource = statement.get("Resource");
        List<Object> resources = resource instanceof List<?>
                ? (List<Object>) resource
                : resource == null ? List.of() : List.of(resource);
        // Bundles table physical name is "{env}-env-bundles" (see SubmitSharedNames.bundlesTableName).
        // Sister tables use "{env}-env-bundle-capacity" / "{env}-env-bundle-*-async-requests", so the
        // exact substring "env-bundles" uniquely identifies the bundles table.
        return resources.stream().anyMatch(r -> String.valueOf(r).contains("env-bundles"));
    }
}
