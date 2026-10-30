/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.assertions.Template;

/** Finds the Lambdas that publish activity events but cannot read the operator emails secret. */
final class ActivityPublisherGrants {

    record Result(int publishers, List<String> ungranted) {}

    private ActivityPublisherGrants() {}

    static Result check(App app) {
        ObjectMapper mapper = new ObjectMapper();
        List<String> ungranted = new ArrayList<>();
        int publishers = 0;
        for (var child : app.getNode().getChildren()) {
            if (!(child instanceof Stack stack)) continue;
            JsonNode resources =
                    mapper.valueToTree(Template.fromStack(stack).toJSON()).path("Resources");
            Set<String> grantedRoles = new HashSet<>();
            for (Map.Entry<String, JsonNode> entry : resources.properties()) {
                JsonNode resource = entry.getValue();
                if (!"AWS::IAM::Policy".equals(resource.path("Type").asText())) continue;
                if (!resource.path("Properties")
                        .path("PolicyDocument")
                        .toString()
                        .contains("/submit/operator-emails")) {
                    continue;
                }
                resource.path("Properties")
                        .path("Roles")
                        .forEach(role -> grantedRoles.add(role.path("Ref").asText()));
            }
            for (Map.Entry<String, JsonNode> entry : resources.properties()) {
                JsonNode resource = entry.getValue();
                if (!"AWS::Lambda::Function".equals(resource.path("Type").asText())) continue;
                JsonNode properties = resource.path("Properties");
                if (!properties.path("Environment").path("Variables").has("ACTIVITY_BUS_NAME")) continue;
                publishers++;
                String role = properties.path("Role").path("Fn::GetAtt").path(0).asText();
                if (!grantedRoles.contains(role)) ungranted.add(stack.getStackName() + "/" + entry.getKey());
            }
        }
        return new Result(publishers, ungranted);
    }
}
