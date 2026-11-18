/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class CollabRelayStackTest {

    private static final String COORDINATOR_KEY =
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINzZcymn8wTk5aKEinfvSINlQ8qjacZUV6obhP5plgOT coordinator";

    private static Template synth() {
        return synth(COORDINATOR_KEY);
    }

    private static Template synth(String coordinatorPublicKey) {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();
        var props = CollabRelayStack.CollabRelayStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName("docs")
                .deploymentName("docs")
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest")
                .coordinatorPublicKey(coordinatorPublicKey)
                .build();
        return Template.fromStack(new CollabRelayStack(app, "TestCollabRelayStack", props));
    }

    @Test
    void tableExpiresItemsByTtlAndIsDestroyedWithTheStack() {
        Template template = synth();
        template.resourceCountIs("AWS::DynamoDB::Table", 1);
        template.hasResourceProperties(
                "AWS::DynamoDB::Table",
                Match.objectLike(Map.of(
                        "TableName", "docs-env-collab-relay",
                        "BillingMode", "PAY_PER_REQUEST",
                        "TimeToLiveSpecification", Map.of("AttributeName", "expiresAt", "Enabled", true))));
        template.hasResource(
                "AWS::DynamoDB::Table",
                Match.objectLike(Map.of("DeletionPolicy", "Delete", "UpdateReplacePolicy", "Delete")));
    }

    @Test
    void webSocketApiHasConnectAndDisconnectAndHttpApiHasTheThreePostRoutes() {
        Template template = synth();
        template.resourceCountIs("AWS::ApiGatewayV2::Api", 2);
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Api",
                Match.objectLike(Map.of("ProtocolType", "WEBSOCKET", "Name", "docs-env-collab-relay-ws")));
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Api",
                Match.objectLike(Map.of("ProtocolType", "HTTP", "Name", "docs-env-collab-relay-http")));

        var routeKeys = new TreeSet<String>();
        template.findResources("AWS::ApiGatewayV2::Route").forEach((id, resource) -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) resource.get("Properties");
            routeKeys.add((String) properties.get("RouteKey"));
            assertEquals("NONE", properties.getOrDefault("AuthorizationType", "NONE"), id + " has an authorizer");
        });
        assertEquals(
                new TreeSet<>(List.of("$connect", "$disconnect", "POST /ack", "POST /register", "POST /send")),
                routeKeys);

        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Stage",
                Match.objectLike(Map.of(
                        "StageName",
                        "relay",
                        "AutoDeploy",
                        true,
                        "DefaultRouteSettings",
                        Match.objectLike(Map.of("ThrottlingRateLimit", 5, "ThrottlingBurstLimit", 10)))));
        template.hasResourceProperties(
                "AWS::ApiGatewayV2::Stage", Match.objectLike(Map.of("StageName", "$default", "AutoDeploy", true)));
    }

    @Test
    void pingRuleRunsEveryNineMinutes() {
        Template template = synth();
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(
                        Map.of("Name", "docs-env-collab-relay-ping", "ScheduleExpression", "rate(9 minutes)")));
    }

    @Test
    void lambdaRunsTheRelayHandlerWithTheCoordinatorKeyAndTable() {
        Template template = synth();
        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "docs-env-collab-relay",
                        "Architectures",
                        List.of("arm64"),
                        "ImageConfig",
                        Map.of("Command", List.of("app/functions/collab/collabRelay.handler")),
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "COLLAB_RELAY_DYNAMODB_TABLE_NAME",
                                        "docs-env-collab-relay",
                                        "COLLAB_COORDINATOR_PUBLIC_KEY",
                                        COORDINATOR_KEY)))))));
    }

    @Test
    void lambdaMayPostToConnectionsAndInvokeItselfOnly() {
        Template template = synth();
        var actions = new ArrayList<String>();
        var offenders = new ArrayList<String>();
        template.findResources("AWS::IAM::Policy").forEach((id, policy) -> {
            @SuppressWarnings("unchecked")
            var properties = (Map<String, Object>) policy.get("Properties");
            @SuppressWarnings("unchecked")
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            @SuppressWarnings("unchecked")
            var statements = (List<Map<String, Object>>) document.get("Statement");
            for (Map<String, Object> statement : statements) {
                actions.add(String.valueOf(statement.get("Action")));
                if ("*".equals(statement.get("Resource"))) offenders.add(id + " " + statement.get("Action"));
            }
        });
        assertTrue(offenders.isEmpty(), "IAM statements granting on every resource: " + offenders);
        assertTrue(actions.contains("execute-api:ManageConnections"), "no @connections grant: " + actions);
        assertTrue(actions.contains("lambda:InvokeFunction"), "no self-invoke grant: " + actions);
        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "lambda:InvokeFunction",
                                        "Resource",
                                        "arn:aws:lambda:eu-west-2:111111111111:function:docs-env-collab-relay")))))))));
    }

    @Test
    void noCoordinatorKeyLeavesTheVariableOut() {
        Template template = synth("");
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            assertFalse(
                    String.valueOf(resource.get("Properties")).contains("COLLAB_COORDINATOR_PUBLIC_KEY"),
                    id + " names a coordinator key");
        });
    }

    // CloudFormation refuses a template whose resources refer to each other in a circle; the
    // Lambda, its role policy, the WebSocket API and its routes come closest to one.
    @Test
    @SuppressWarnings("unchecked")
    void resourcesHaveNoCircularReference() {
        var resources = (Map<String, Object>) synth().toJSON().get("Resources");
        var edges = new HashMap<String, Set<String>>();
        resources.forEach((id, resource) -> {
            var targets = new HashSet<String>();
            collectReferences(resource, resources.keySet(), targets);
            targets.remove(id);
            edges.put(id, targets);
        });
        var state = new HashMap<String, Integer>();
        for (String id : edges.keySet()) {
            assertFalse(visitFindsCycle(id, edges, state), "circular reference through " + id);
        }
    }

    @SuppressWarnings("unchecked")
    private static void collectReferences(Object node, Set<String> ids, Set<String> into) {
        if (node instanceof Map<?, ?> map) {
            map.forEach((key, value) -> {
                if ("Ref".equals(key) && value instanceof String ref && ids.contains(ref)) into.add(ref);
                if ("Fn::GetAtt".equals(key)
                        && value instanceof List<?> list
                        && ids.contains(String.valueOf(list.get(0)))) {
                    into.add(String.valueOf(list.get(0)));
                }
                if ("DependsOn".equals(key)) {
                    if (value instanceof String dep) into.add(dep);
                    if (value instanceof List<?> deps) deps.forEach(dep -> into.add(String.valueOf(dep)));
                }
                collectReferences(value, ids, into);
            });
        } else if (node instanceof List<?> list) {
            list.forEach(item -> collectReferences(item, ids, into));
        }
    }

    private static boolean visitFindsCycle(String id, Map<String, Set<String>> edges, Map<String, Integer> state) {
        var current = state.getOrDefault(id, 0);
        if (current == 1) return true;
        if (current == 2) return false;
        state.put(id, 1);
        for (String next : edges.getOrDefault(id, Set.of())) {
            if (visitFindsCycle(next, edges, state)) return true;
        }
        state.put(id, 2);
        return false;
    }
}
