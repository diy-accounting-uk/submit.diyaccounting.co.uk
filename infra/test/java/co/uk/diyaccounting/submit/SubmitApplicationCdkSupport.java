/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.Lambda;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.opentest4j.AssertionFailedError;
import software.amazon.awscdk.assertions.Template;

final class SubmitApplicationCdkSupport {

    private SubmitApplicationCdkSupport() {}

    /**
     * A DIYA-GL book write carries a zip far larger than the 8KB CloudFront lets WAF inspect, so
     * the managed SizeRestrictions_BODY rule blocked every save before it reached API Gateway. The
     * fix counts that managed rule and blocks an oversized body from our own rule instead, on every
     * request except a PUT to a book route. This pins both halves: dropping either one silently
     * restores the block, or drops the size protection from routes that still need it.
     */
    @SuppressWarnings("unchecked")
    static void assertOversizedBodyBlockedExceptOnABookWrite(Template template) {
        var webAcl = (Map<String, Object>) template.findResources("AWS::WAFv2::WebACL").values().stream()
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a web ACL"));
        var rules = (List<Map<String, Object>>) ((Map<String, Object>) webAcl.get("Properties")).get("Rules");

        // The rule's 8192 is CloudFront's default body inspection size. Raising it through
        // AssociationConfig would make the two disagree, so the size a request is judged on would
        // no longer be the size WAF was handed.
        org.junit.jupiter.api.Assertions.assertFalse(
                ((Map<String, Object>) webAcl.get("Properties")).containsKey("AssociationConfig"),
                "expected no raised body inspection limit alongside the 8192 threshold");

        var commonRuleSet = rules.stream()
                .filter(rule -> "AWSManagedRulesCommonRuleSet".equals(rule.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected the common rule set"));
        var managedGroup = (Map<String, Object>)
                ((Map<String, Object>) commonRuleSet.get("Statement")).get("ManagedRuleGroupStatement");
        var overrides = (List<Map<String, Object>>) managedGroup.get("RuleActionOverrides");
        var sizeOverride = overrides.stream()
                .filter(override -> "SizeRestrictions_BODY".equals(override.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected SizeRestrictions_BODY to carry an action override"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((Map<String, Object>) sizeOverride.get("ActionToUse")).containsKey("Count"),
                "expected SizeRestrictions_BODY to count rather than block");

        var oversizedBody = rules.stream()
                .filter(rule -> "OversizedBodyOutsideBookWrite".equals(rule.get("Name")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected the oversized-body rule"));
        org.junit.jupiter.api.Assertions.assertEquals(5, oversizedBody.get("Priority"));
        org.junit.jupiter.api.Assertions.assertTrue(
                ((Map<String, Object>) oversizedBody.get("Action")).containsKey("Block"),
                "expected the oversized-body rule to block");

        var conditions = (List<Map<String, Object>>)
                ((Map<String, Object>) ((Map<String, Object>) oversizedBody.get("Statement")).get("AndStatement"))
                        .get("Statements");
        org.junit.jupiter.api.Assertions.assertEquals(2, conditions.size());

        var sizeConstraint = (Map<String, Object>) conditions.get(0).get("SizeConstraintStatement");
        org.junit.jupiter.api.Assertions.assertEquals("GT", sizeConstraint.get("ComparisonOperator"));
        org.junit.jupiter.api.Assertions.assertEquals(8192, ((Number) sizeConstraint.get("Size")).intValue());
        var body = (Map<String, Object>) ((Map<String, Object>) sizeConstraint.get("FieldToMatch")).get("Body");
        org.junit.jupiter.api.Assertions.assertEquals(
                "MATCH",
                body.get("OversizeHandling"),
                "a body larger than the inspection limit must match, which is what the managed rule caught");

        var exemption =
                (Map<String, Object>) ((Map<String, Object>) conditions.get(1).get("NotStatement")).get("Statement");
        var exemptionParts =
                (List<Map<String, Object>>) ((Map<String, Object>) exemption.get("AndStatement")).get("Statements");
        org.junit.jupiter.api.Assertions.assertEquals(2, exemptionParts.size());

        // The uri-prefix half is an OrStatement covering both the new diya-gl prefix and, for the
        // window, the old books prefix - a PUT under either must be exempt from the size block.
        var uriPrefixOr = (Map<String, Object>) exemptionParts.get(0).get("OrStatement");
        org.junit.jupiter.api.Assertions.assertTrue(
                uriPrefixOr != null, "expected the uri-prefix exemption to be an OrStatement of both prefixes");
        var uriPrefixSearchStrings = ((List<Map<String, Object>>) uriPrefixOr.get("Statements"))
                .stream()
                        .map(part ->
                                (String) ((Map<String, Object>) part.get("ByteMatchStatement")).get("SearchString"))
                        .toList();
        org.junit.jupiter.api.Assertions.assertTrue(
                uriPrefixSearchStrings.contains("/api/v1/diya-gl") && uriPrefixSearchStrings.contains("/api/v1/books"),
                "the size exemption must cover both the new and the legacy book route prefix, was "
                        + uriPrefixSearchStrings);

        var methodSearchString =
                (String) ((Map<String, Object>) exemptionParts.get(1).get("ByteMatchStatement")).get("SearchString");
        org.junit.jupiter.api.Assertions.assertEquals(
                "PUT", methodSearchString, "the exemption must be scoped to PUT and nothing wider");
    }

    /**
     * Finds the /api/v1/*, /api/v1/diya-gl/* and /api/v1/books/* cache behaviours on the
     * distribution and asserts they all point at the same response headers policy, and that the
     * policy carries no CorsConfig - so no behaviour lets CloudFront override whatever CORS header
     * the origin already sent.
     */
    @SuppressWarnings("unchecked")
    static void assertApiBehavioursHaveNoCorsOverride(Template template) {
        var distributions = template.findResources("AWS::CloudFront::Distribution");
        org.junit.jupiter.api.Assertions.assertEquals(1, distributions.size());
        var distributionConfig = (Map<String, Object>)
                ((Map<String, Object>) distributions.values().iterator().next()).get("Properties");
        var config = (Map<String, Object>) distributionConfig.get("DistributionConfig");
        var cacheBehaviors = (List<Map<String, Object>>) config.get("CacheBehaviors");

        var apiBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected an /api/v1/* cache behaviour"));
        var diyaGlBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/diya-gl/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected an /api/v1/diya-gl/* cache behaviour"));
        var booksBehaviour = cacheBehaviors.stream()
                .filter(behaviour -> "/api/v1/books/*".equals(behaviour.get("PathPattern")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a /api/v1/books/* cache behaviour"));

        String apiPolicyLogicalId =
                (String) ((Map<String, Object>) apiBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        String diyaGlPolicyLogicalId =
                (String) ((Map<String, Object>) diyaGlBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        String booksPolicyLogicalId =
                (String) ((Map<String, Object>) booksBehaviour.get("ResponseHeadersPolicyId")).get("Ref");
        org.junit.jupiter.api.Assertions.assertEquals(
                apiPolicyLogicalId,
                diyaGlPolicyLogicalId,
                "expected /api/v1/* and /api/v1/diya-gl/* to share one response headers policy");
        org.junit.jupiter.api.Assertions.assertEquals(
                booksPolicyLogicalId,
                apiPolicyLogicalId,
                "expected /api/v1/* and /api/v1/books/* to share one response headers policy");

        var policyResource =
                template.findResources("AWS::CloudFront::ResponseHeadersPolicy").get(apiPolicyLogicalId);
        org.junit.jupiter.api.Assertions.assertTrue(
                policyResource != null, "expected to find the shared API response headers policy resource");
        var policyProperties = (Map<String, Object>) ((Map<String, Object>) policyResource).get("Properties");
        var policyConfig = (Map<String, Object>) policyProperties.get("ResponseHeadersPolicyConfig");
        org.junit.jupiter.api.Assertions.assertFalse(
                policyConfig.containsKey("CorsConfig"),
                "expected the shared API response headers policy to carry no CorsConfig");
    }

    /**
     * Asserts every Lambda function carries an explicit {@code LoggingConfig.LogGroup}, so its logs
     * land in a group this stack retains and deletes with it, not an unnamed one CloudWatch creates
     * with no retention on first invoke. The one known exception is CDK's built-in
     * auto-delete-objects handler, which exposes no logGroup option at all.
     */
    @SuppressWarnings("unchecked")
    static void assertEveryLambdaHasAnExplicitLogGroup(Template template) {
        var missing = new ArrayList<String>();
        template.findResources("AWS::Lambda::Function").forEach((id, resource) -> {
            var properties = (Map<String, Object>) resource.get("Properties");
            var loggingConfig = properties == null ? null : (Map<String, Object>) properties.get("LoggingConfig");
            if (loggingConfig != null && loggingConfig.containsKey("LogGroup")) return;
            var description = String.valueOf(properties == null ? "" : properties.get("Description"));
            if (description.contains("auto-deleting objects")) return;
            missing.add(id);
        });
        org.junit.jupiter.api.Assertions.assertTrue(
                missing.isEmpty(), "Lambda functions with no explicit log group: " + missing);
    }

    @SuppressWarnings("unchecked")
    static void assertHasEnvironmentVariable(Template template, String functionName, String variableName) {
        boolean found = template.findResources("AWS::Lambda::Function").values().stream()
                .anyMatch(resource -> {
                    var properties = (Map<String, Object>) resource.get("Properties");
                    if (properties == null || !functionName.equals(properties.get("FunctionName"))) return false;
                    var environment = (Map<String, Object>) properties.get("Environment");
                    var variables = environment == null ? null : (Map<String, Object>) environment.get("Variables");
                    return variables != null && variables.containsKey(variableName);
                });
        org.junit.jupiter.api.Assertions.assertTrue(
                found, "expected " + functionName + " to have the " + variableName + " environment variable");
    }

    /**
     * Asserts a deployment-set stack's grouped health-alarm shape: its {@code check-} alarms are
     * exactly one {@code -log-errors} alarm per name in {@code expectedLogErrorsNames} (after the
     * {@code tt-witheight-app-} prefix) plus the queue checks: a DLQ and a message-age alarm for each async function that
     * calls an external API, and grouped DLQ and message-age alarms for the others;
     * every function's log group feeds the deployment's shared invocation-errors metric; and the
     * composite covers every check.
     */
    /** The DLQ and message-age checks of async functions that keep a pair of their own. */
    static List<String> outsideCallerQueueChecks(String... functionNames) {
        var checks = new ArrayList<String>();
        for (String functionName : functionNames) {
            checks.add(functionName + "-dlq-not-empty");
            checks.add(functionName + "-queue-message-age");
        }
        return checks;
    }

    static List<String> joined(List<String> first, List<String> second) {
        var all = new ArrayList<>(first);
        all.addAll(second);
        return all;
    }

    @SuppressWarnings("unchecked")
    static void assertGroupedStackHealthAlarm(
            Template template,
            List<String> expectedLogErrorsNames,
            List<String> expectedQueueChecks,
            List<String> routedPrefixes) {
        var logErrorsNames = new ArrayList<String>();
        var queueChecks = new ArrayList<String>();
        for (Map<String, Object> alarm :
                template.findResources("AWS::CloudWatch::Alarm").values()) {
            String name = String.valueOf(((Map<String, Object>) alarm.get("Properties")).get("AlarmName"));
            if (!name.startsWith(Lambda.CHECK_ALARM_NAME_PREFIX)) continue;
            if (name.endsWith("-not-empty") || name.endsWith("-message-age")) {
                queueChecks.add(name.substring((Lambda.CHECK_ALARM_NAME_PREFIX + "tt-witheight-app-").length()));
                continue;
            }
            org.junit.jupiter.api.Assertions.assertTrue(
                    name.endsWith("-log-errors"), "Unexpected per-function check " + name + " on a grouped stack");
            logErrorsNames.add(name.substring(
                    (Lambda.CHECK_ALARM_NAME_PREFIX + "tt-witheight-app-").length(),
                    name.length() - "-log-errors".length()));
        }
        java.util.Collections.sort(logErrorsNames);
        var expected = new ArrayList<>(expectedLogErrorsNames);
        java.util.Collections.sort(expected);
        assertEquals(expected, logErrorsNames);
        java.util.Collections.sort(queueChecks);
        var expectedQueue = new ArrayList<>(expectedQueueChecks);
        java.util.Collections.sort(expectedQueue);
        assertEquals(
                expectedQueue, queueChecks, "Queue checks: a pair per outside caller, grouped alarms for the rest");

        var logErrorsLogGroups = new java.util.HashSet<String>();
        var invocationErrorsLogGroups = new java.util.HashSet<String>();
        for (Map<String, Object> filter :
                template.findResources("AWS::Logs::MetricFilter").values()) {
            Map<String, Object> props = (Map<String, Object>) filter.get("Properties");
            Map<String, Object> transformation =
                    ((List<Map<String, Object>>) props.get("MetricTransformations")).get(0);
            if (!Lambda.LOG_METRIC_NAMESPACE.equals(transformation.get("MetricNamespace"))) continue;
            String logGroup = String.valueOf(props.get("LogGroupName"));
            String metricName = String.valueOf(transformation.get("MetricName"));
            if (metricName.equals("tt-witheight-app" + Lambda.DEPLOYMENT_ERRORS_SUFFIX)) {
                invocationErrorsLogGroups.add(logGroup);
            } else {
                logErrorsLogGroups.add(logGroup);
            }
        }
        org.junit.jupiter.api.Assertions.assertFalse(logErrorsLogGroups.isEmpty());
        assertEquals(
                logErrorsLogGroups,
                invocationErrorsLogGroups,
                "Every function log group with a log-errors filter also feeds the shared invocation-errors metric");

        assertStackHealthAlarm(template, null, 0, routedPrefixes);
    }

    /**
     * Asserts a stack's health-alarm shape: exactly one {@code {stack}-health} composite alarm,
     * whose rule names every one of the stack's {@code check-}-prefixed alarms, none of which is
     * itself routed. {@code expectedConstructs} pins the number of Lambda constructs and
     * {@code expectedAsyncPairs} how many of them are {@link AsyncApiLambda}s, which carry their
     * queue, DLQ and worker checks on top; pass {@code null} for the construct count when it
     * depends on optional config (e.g. a GitHub token ARN).
     */
    @SuppressWarnings("unchecked")
    static void assertStackHealthAlarm(
            Template template, Integer expectedConstructs, int expectedAsyncPairs, List<String> routedPrefixes) {
        Map<String, Map<String, Object>> composites = template.findResources("AWS::CloudWatch::CompositeAlarm");

        // Find the top-level health alarm (ends with HEALTH_ALARM_NAME_SUFFIX, no "-group" in the name)
        Map.Entry<String, Map<String, Object>> topLevelComposite = null;
        for (Map.Entry<String, Map<String, Object>> entry : composites.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props != null) {
                String name = String.valueOf(props.get("AlarmName"));
                if (name.endsWith(Lambda.HEALTH_ALARM_NAME_SUFFIX) && !name.contains("-group")) {
                    topLevelComposite = entry;
                    break;
                }
            }
        }

        org.junit.jupiter.api.Assertions.assertNotNull(
                topLevelComposite,
                "No top-level stack health alarm found (must end with " + Lambda.HEALTH_ALARM_NAME_SUFFIX
                        + " and not contain '-group')");

        Map<String, Object> topLevelProps =
                (Map<String, Object>) topLevelComposite.getValue().get("Properties");
        String topLevelName = String.valueOf(topLevelProps.get("AlarmName"));
        org.junit.jupiter.api.Assertions.assertTrue(
                startsWithAny(topLevelName, routedPrefixes),
                "Top-level composite alarm '" + topLevelName + "' does not start with any routed prefix "
                        + routedPrefixes + " — it is a silent alarm");

        var checkAlarmLogicalIds = new ArrayList<String>();
        for (Map.Entry<String, Map<String, Object>> entry :
                template.findResources("AWS::CloudWatch::Alarm").entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            String alarmName = String.valueOf(props.get("AlarmName"));
            if (!alarmName.startsWith(Lambda.CHECK_ALARM_NAME_PREFIX)) continue;
            checkAlarmLogicalIds.add(entry.getKey());
            org.junit.jupiter.api.Assertions.assertFalse(
                    startsWithAny(alarmName, routedPrefixes),
                    "check- alarm '" + alarmName + "' unexpectedly starts with a routed prefix " + routedPrefixes
                            + " — it would double-notify alongside its stack's composite");
        }

        if (expectedConstructs != null) {
            int expectedChecks = Lambda.HEALTH_CHECK_COUNT * expectedConstructs
                    + AsyncApiLambda.ASYNC_HEALTH_CHECK_COUNT * expectedAsyncPairs;
            org.junit.jupiter.api.Assertions.assertEquals(
                    expectedChecks,
                    checkAlarmLogicalIds.size(),
                    "Expected " + expectedChecks + " check- alarms for " + expectedConstructs + " Lambda constructs of "
                            + "which " + expectedAsyncPairs + " are async pairs, found " + checkAlarmLogicalIds.size());
        }

        // Verify all check alarms are referenced by at least one composite (group or top-level)
        var allReferenced = new ArrayList<String>();
        for (Map.Entry<String, Map<String, Object>> composite : composites.entrySet()) {
            Map<String, Object> props =
                    (Map<String, Object>) composite.getValue().get("Properties");
            if (props != null) {
                collectGetAttTargets(props.get("AlarmRule"), allReferenced);
            }
        }
        var unreferenced = new ArrayList<>(checkAlarmLogicalIds);
        unreferenced.removeAll(allReferenced);
        org.junit.jupiter.api.Assertions.assertTrue(
                unreferenced.isEmpty(), "These check- alarms are missing from all composites: " + unreferenced);

        // Verify each composite alarm's rule length is under 10240 characters
        for (Map.Entry<String, Map<String, Object>> composite : composites.entrySet()) {
            Map<String, Object> props =
                    (Map<String, Object>) composite.getValue().get("Properties");
            if (props == null) continue;
            Object alarmRule = props.get("AlarmRule");
            int ruleLength = estimateAlarmRuleLength(alarmRule);
            org.junit.jupiter.api.Assertions.assertTrue(
                    ruleLength < 10240,
                    "Composite alarm " + composite.getKey() + " rule length " + ruleLength
                            + " exceeds CloudWatch's 10240 character limit");
        }
    }

    /**
     * Estimates the character length of a CloudFormation alarm rule by traversing its Fn::Join and
     * counting character lengths.
     */
    @SuppressWarnings("unchecked")
    static int estimateAlarmRuleLength(Object node) {
        if (node instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) node;
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List) {
                List<Object> joinList = (List<Object>) fnJoin;
                if (joinList.size() >= 2) {
                    String separator = String.valueOf(joinList.get(0));
                    Object parts = joinList.get(1);
                    if (parts instanceof List) {
                        List<Object> partsList = (List<Object>) parts;
                        int totalLength = 0;
                        for (int i = 0; i < partsList.size(); i++) {
                            Object part = partsList.get(i);
                            if (part instanceof String) {
                                totalLength += ((String) part).length();
                            } else if (part instanceof Map) {
                                // Estimate Ref and Fn::GetAtt as 60 characters
                                totalLength += 60;
                            }
                            if (i < partsList.size() - 1) {
                                totalLength += separator.length();
                            }
                        }
                        return totalLength;
                    }
                }
            }
        }
        return 0;
    }

    static boolean startsWithAny(String value, List<String> prefixes) {
        for (String prefix : prefixes) {
            if (value.startsWith(prefix)) return true;
        }
        return false;
    }

    /** Collects the logical ids an alarm rule refers to, from the Fn::GetAtt calls in its Fn::Join. */
    @SuppressWarnings("unchecked")
    static void collectGetAttTargets(Object node, List<String> into) {
        if (node instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) node;
            Object getAtt = map.get("Fn::GetAtt");
            if (getAtt instanceof List && !((List<Object>) getAtt).isEmpty()) {
                into.add(String.valueOf(((List<Object>) getAtt).get(0)));
            }
            map.values().forEach(value -> collectGetAttTargets(value, into));
        } else if (node instanceof List) {
            ((List<Object>) node).forEach(value -> collectGetAttTargets(value, into));
        }
    }

    /**
     * Reads the {@code alarmName} prefix matchers off OpsStack's {@code *-alarm-state-change}
     * EventBridge rule — the actual routing contract, not a copy of it.
     */
    @SuppressWarnings("unchecked")
    static List<String> routedAlarmNamePrefixes(Template opsStackTemplate) {
        Map<String, Map<String, Object>> rules = opsStackTemplate.findResources("AWS::Events::Rule");
        for (Map.Entry<String, Map<String, Object>> entry : rules.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            String name = String.valueOf(props.get("Name"));
            if (!name.endsWith("-alarm-state-change")) continue;
            Map<String, Object> eventPattern = (Map<String, Object>) props.get("EventPattern");
            Map<String, Object> detail = (Map<String, Object>) eventPattern.get("detail");
            List<Object> alarmNameMatchers = (List<Object>) detail.get("alarmName");
            List<String> prefixes = new ArrayList<>();
            for (Object matcher : alarmNameMatchers) {
                Map<String, Object> matcherMap = (Map<String, Object>) matcher;
                Object prefix = matcherMap.get("prefix");
                if (prefix != null) prefixes.add(String.valueOf(prefix));
            }
            return prefixes;
        }
        throw new AssertionFailedError("No *-alarm-state-change EventBridge rule found in OpsStack template");
    }

    @SuppressWarnings("unchecked")
    static void dumpIamPolicies(Template template) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        infof("[IAM diag] Found %d AWS::IAM::Policy resources in AccountStack", policies.size());
        for (Map.Entry<String, Map<String, Object>> e : policies.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) e.getValue().get("Properties");
            if (props == null) continue;
            Object roles = props.get("Roles");
            String rolesStr = roles == null ? "<null>" : roles.toString();
            infof("[IAM diag] policy=%s Roles=%s", e.getKey(), rolesStr);
            Object doc = props.get("PolicyDocument");
            if (doc instanceof Map) {
                Object stmts = ((Map<String, Object>) doc).get("Statement");
                if (stmts instanceof List<?>) {
                    int i = 0;
                    for (Object s : (List<Object>) stmts) {
                        if (s instanceof Map) {
                            Map<String, Object> st = (Map<String, Object>) s;
                            Object act = st.get("Action");
                            Object res = st.get("Resource");
                            infof("[IAM diag]   stmt[%d] Action=%s Resource=%s", i, act, res);
                        }
                        i++;
                    }
                }
            }
        }
    }

    /**
     * Count AWS::IAM::Policy resources in {@code template} that (a) attach to a role whose logical
     * id contains {@code lambdaSlug} and (b) grant {@code dynamodb:UpdateItem} on a resource whose
     * logical id contains "bundles-table".
     */
    /**
     * Returns the roles holding dynamodb:Scan or dynamodb:BatchGetItem, minus the ones expected to.
     * Role names are reported as the CloudFormation logical id, which carries the Lambda's name.
     */
    @SuppressWarnings("unchecked")
    static List<String> findRolesGrantedBulkReads(Template template, List<String> rolesThatReadInBulk) {
        List<String> found = new java.util.ArrayList<>();
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        for (Map.Entry<String, Map<String, Object>> entry : policies.entrySet()) {
            Map<String, Object> props = (Map<String, Object>) entry.getValue().get("Properties");
            if (props == null) continue;
            if (!policyGrantsBulkRead(props)) continue;
            boolean expected = rolesThatReadInBulk.stream().anyMatch(slug -> policyAttachesToRoleMatching(props, slug));
            if (!expected) found.add(entry.getKey());
        }
        return found;
    }

    @SuppressWarnings("unchecked")
    static boolean policyGrantsBulkRead(Map<String, Object> policyProps) {
        Object document = policyProps.get("PolicyDocument");
        if (!(document instanceof Map)) return false;
        Object statements = ((Map<String, Object>) document).get("Statement");
        if (!(statements instanceof List<?>)) return false;
        for (Object statementObj : (List<Object>) statements) {
            if (!(statementObj instanceof Map)) continue;
            Object action = ((Map<String, Object>) statementObj).get("Action");
            List<Object> actions =
                    action instanceof List<?> ? (List<Object>) action : action == null ? List.of() : List.of(action);
            for (Object a : actions) {
                if ("dynamodb:Scan".equals(a) || "dynamodb:BatchGetItem".equals(a)) return true;
            }
        }
        return false;
    }

    static long countIamPoliciesWithUpdateItemOnBundlesTable(Template template, String lambdaSlug) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        long matches = 0;
        for (Map.Entry<String, Map<String, Object>> entry : policies.entrySet()) {
            Map<String, Object> resource = entry.getValue();
            @SuppressWarnings("unchecked")
            Map<String, Object> props = (Map<String, Object>) resource.get("Properties");
            if (props == null) continue;
            if (!policyAttachesToRoleMatching(props, lambdaSlug)) continue;
            if (!policyStatementsGrantUpdateItemOnBundlesTable(props)) continue;
            matches++;
        }
        return matches;
    }

    @SuppressWarnings("unchecked")
    static boolean policyAttachesToRoleMatching(Map<String, Object> policyProps, String slug) {
        Object roles = policyProps.get("Roles");
        if (!(roles instanceof List<?>)) return false;
        for (Object role : (List<Object>) roles) {
            if (!(role instanceof Map)) continue;
            Object ref = ((Map<String, Object>) role).get("Ref");
            if (ref instanceof String && ((String) ref).toLowerCase().contains(slug.replace("-", ""))) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean policyStatementsGrantUpdateItemOnBundlesTable(Map<String, Object> policyProps) {
        Object document = policyProps.get("PolicyDocument");
        if (!(document instanceof Map)) return false;
        Object statements = ((Map<String, Object>) document).get("Statement");
        if (!(statements instanceof List<?>)) return false;
        for (Object statementObj : (List<Object>) statements) {
            if (!(statementObj instanceof Map)) continue;
            Map<String, Object> statement = (Map<String, Object>) statementObj;
            if (!statementGrantsUpdateItem(statement)) continue;
            if (statementTargetsBundlesTable(statement)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean statementGrantsUpdateItem(Map<String, Object> statement) {
        Object action = statement.get("Action");
        if (action instanceof String) return "dynamodb:UpdateItem".equals(action);
        if (action instanceof List<?>) {
            for (Object a : (List<Object>) action) {
                if ("dynamodb:UpdateItem".equals(a)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean statementTargetsBundlesTable(Map<String, Object> statement) {
        Object resource = statement.get("Resource");
        List<Object> resources = resource instanceof List<?>
                ? (List<Object>) resource
                : resource == null ? List.of() : List.of(resource);
        for (Object r : resources) {
            if (resourceRefersToBundlesTable(r)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean resourceRefersToBundlesTable(Object resource) {
        // Bundles table physical name is "{env}-env-bundles" (see SubmitSharedNames.bundlesTableName).
        // Sister tables use "{env}-env-bundle-capacity" / "{env}-env-bundle-*-async-requests", so
        // the exact substring "env-bundles" uniquely identifies the bundles table.
        if (resource instanceof String) {
            return ((String) resource).contains("env-bundles");
        }
        if (resource instanceof List<?>) {
            for (Object part : (List<Object>) resource) {
                if (resourceRefersToBundlesTable(part)) return true;
            }
            return false;
        }
        if (resource instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) resource;
            Object ref = map.get("Ref");
            if (ref instanceof String && ((String) ref).toLowerCase().contains("bundlestable")) return true;
            Object fnGetAtt = map.get("Fn::GetAtt");
            if (fnGetAtt instanceof List<?>) {
                for (Object part : (List<Object>) fnGetAtt) {
                    if (part instanceof String && ((String) part).toLowerCase().contains("bundlestable")) return true;
                }
            }
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List<?>) {
                for (Object part : (List<Object>) fnJoin) {
                    if (resourceRefersToBundlesTable(part)) return true;
                }
            }
            if (map.get("Fn::Sub") instanceof String s && s.contains("env-bundles")) return true;
            for (Object value : map.values()) {
                if (value instanceof List<?>) {
                    for (Object part : (List<Object>) value) {
                        if (resourceRefersToBundlesTable(part)) return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * True if some IAM policy attached to a role matching {@code slug} grants {@code action} on a
     * resource whose ARN string ends in {@code resourceSuffix}. Used to confirm an index grant
     * (e.g. {@code /index/bundleId-expiry-index}) landed on the expected role.
     */
    @SuppressWarnings("unchecked")
    static boolean findRoleGrantedActionOnResourceSuffix(
            Template template, String slug, String action, String resourceSuffix) {
        Map<String, Map<String, Object>> policies = template.findResources("AWS::IAM::Policy");
        for (Map<String, Object> resource : policies.values()) {
            Map<String, Object> props = (Map<String, Object>) resource.get("Properties");
            if (props == null) continue;
            if (!policyAttachesToRoleMatching(props, slug)) continue;
            Object document = props.get("PolicyDocument");
            if (!(document instanceof Map)) continue;
            Object statements = ((Map<String, Object>) document).get("Statement");
            if (!(statements instanceof List<?>)) continue;
            for (Object statementObj : (List<Object>) statements) {
                if (!(statementObj instanceof Map)) continue;
                Map<String, Object> statement = (Map<String, Object>) statementObj;
                if (!statementGrantsAction(statement, action)) continue;
                if (statementTargetsResourceEndingWith(statement, resourceSuffix)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean statementGrantsAction(Map<String, Object> statement, String action) {
        Object statementAction = statement.get("Action");
        if (statementAction instanceof String) return action.equals(statementAction);
        if (statementAction instanceof List<?>) {
            for (Object a : (List<Object>) statementAction) {
                if (action.equals(a)) return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean statementTargetsResourceEndingWith(Map<String, Object> statement, String suffix) {
        Object resource = statement.get("Resource");
        List<Object> resources = resource instanceof List<?>
                ? (List<Object>) resource
                : resource == null ? List.of() : List.of(resource);
        for (Object r : resources) {
            if (resourceEndsWith(r, suffix)) return true;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    static boolean resourceEndsWith(Object resource, String suffix) {
        if (resource instanceof String) return ((String) resource).endsWith(suffix);
        if (resource instanceof List<?>) {
            for (Object part : (List<Object>) resource) {
                if (resourceEndsWith(part, suffix)) return true;
            }
            return false;
        }
        if (resource instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) resource;
            Object fnJoin = map.get("Fn::Join");
            if (fnJoin instanceof List<?> joinArgs && joinArgs.size() == 2) {
                return resourceEndsWith(joinArgs.get(1), suffix);
            }
            Object fnSub = map.get("Fn::Sub");
            if (fnSub instanceof String s) return s.endsWith(suffix);
        }
        return false;
    }

    static @NotNull Map<String, Object> buildContextPropertyMapFromCdkJsonPath(Path cdkJsonPath) throws IOException {
        String json = Files.readString(cdkJsonPath);

        // 2) Extract the "context" object
        ObjectMapper om = new ObjectMapper();
        JsonNode root = om.readTree(json);
        JsonNode ctxNode = root.path("context");

        Map<String, Object> ctx = new HashMap<>();
        for (Map.Entry<String, JsonNode> e : ctxNode.properties()) {
            // CDK context values are Objects; in your case they’re strings
            ctx.put(e.getKey(), e.getValue().asText());
        }
        return ctx;
    }

    static void assertApiRoute(List<Template> apiTemplates, Map<String, Object> routeProperties) {
        int found = 0;
        for (Template template : apiTemplates) {
            found += template.findResources("AWS::ApiGatewayV2::Route", Map.of("Properties", routeProperties))
                    .size();
        }
        assertEquals(1, found, "route " + routeProperties + " across the API stacks");
    }

    @SuppressWarnings("unchecked")
    static void assertResourceTotalUnder(Template template, int limit) {
        Map<String, Object> resources =
                (Map<String, Object>) ((Map<String, Object>) template.toJSON()).get("Resources");
        infof("API stack resource total: %d", resources.size());
        if (resources.size() >= limit) {
            throw new AssertionFailedError("API stack has " + resources.size() + " resources, limit " + limit);
        }
    }
}
