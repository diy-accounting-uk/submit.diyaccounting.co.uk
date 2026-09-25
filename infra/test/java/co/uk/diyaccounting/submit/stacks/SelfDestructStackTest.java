/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SelfDestructStackTest {

    private static SelfDestructStack synthSelfDestructStack() {
        return synthSelfDestructStack("2026-01-01T00:00:00Z", 6);
    }

    private static SelfDestructStack synthSelfDestructStack(String startDatetime, int delayHours) {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = "ci";
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = "ci-selfdestructtest";
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var props = SelfDestructStack.SelfDestructStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName("ci")
                .deploymentName("ci-selfdestructtest")
                .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest")
                .selfDestructLogGroupName(sharedNames.ew2SelfDestructLogGroupName)
                .selfDestructStartDatetime(ZonedDateTime.parse(startDatetime))
                .selfDestructDelayHours(delayHours)
                .isApplicationStack(true)
                .build();

        return new SelfDestructStack(app, "TestSelfDestructStack", props);
    }

    @Test
    void selfDestructLambdaEnvironmentNamesEveryStackInDeletionOrder() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack();
        Template template = Template.fromStack(selfDestructStack);

        var functions = template.findResources(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "Properties",
                        Map.of(
                                "Environment",
                                Map.of(
                                        "Variables",
                                        Match.objectLike(Map.of("SELF_DESTRUCT_STACK_NAME", Match.anyValue())))))));
        assertEquals(1, functions.size(), "expected exactly one self-destruct Lambda function");

        var properties = (Map<?, ?>) functions.values().iterator().next().get("Properties");
        var environment = (Map<?, ?>) properties.get("Environment");
        var variables = (Map<?, ?>) environment.get("Variables");

        assertEquals("ci-selfdestructtest-app-OpsStack", variables.get("OPS_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-PublishStack", variables.get("PUBLISH_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-EdgeStack", variables.get("EDGE_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-ApiStack", variables.get("API_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-AuthStack", variables.get("AUTH_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-HmrcStack", variables.get("HMRC_STACK_NAME"));
        assertEquals(
                "ci-selfdestructtest-app-CompaniesHouseStack",
                variables.get("COMPANIES_HOUSE_STACK_NAME"),
                "the Companies House stack must be named in the Lambda's environment or self-destruct "
                        + "leaves it standing after every other app stack is gone");
        assertEquals("ci-selfdestructtest-app-BillingStack", variables.get("BILLING_STACK_NAME"));
        assertEquals("ci-selfdestructtest-app-AccountStack", variables.get("ACCOUNT_STACK_NAME"));
        assertEquals(
                "/submit/ci/slots/ci-selfdestructtest",
                variables.get("SLOT_PARAMETER_NAME"),
                "self-destruct must know its own slot claim's parameter name to release it");
        assertEquals(
                "/submit/ci/last-known-good-deployment",
                variables.get("LAST_KNOWN_GOOD_PARAMETER_NAME"),
                "self-destruct must know the environment's last-known-good parameter name to check it before deleting anything");
        assertEquals(
                "12",
                variables.get("LAST_KNOWN_GOOD_PROTECTION_HOURS"),
                "self-destruct must know how long the last-known-good pointer protects the set it names");
    }

    @Test
    @SuppressWarnings("unchecked")
    void selfDestructRoleCanReadAndReleaseOnlyItsOwnCiSlot() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack();
        Template template = Template.fromStack(selfDestructStack);

        List<Map<String, Object>> statements = findPolicyStatementsContainingSid(template, "ReadAndReleaseCiSlot");
        Map<String, Object> statement = statements.stream()
                .filter(s -> "ReadAndReleaseCiSlot".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();

        assertEquals(
                List.of("ssm:GetParameter", "ssm:DeleteParameter"),
                statement.get("Action"),
                "the self-destruct role must be able to read its own ci slot claim before deleting anything, "
                        + "and release the claim once it does");
        String resource = (String) statement.get("Resource");
        assertTrue(
                resource.endsWith("parameter/submit/ci/slots/ci-selfdestructtest"),
                "expected this deployment's own slot parameter, got " + resource);
        assertFalse(resource.equals("*"), "the slot grant must not be a bare wildcard");
    }

    @Test
    @SuppressWarnings("unchecked")
    void selfDestructRoleCanReadAndClearOnlyItsOwnEnvironmentsLastKnownGoodPointer() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack();
        Template template = Template.fromStack(selfDestructStack);

        List<Map<String, Object>> statements =
                findPolicyStatementsContainingSid(template, "ReadAndClearLastKnownGoodDeployment");
        Map<String, Object> statement = statements.stream()
                .filter(s -> "ReadAndClearLastKnownGoodDeployment".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();

        assertEquals(
                List.of("ssm:GetParameter", "ssm:PutParameter"),
                statement.get("Action"),
                "the self-destruct role must be able to read the environment's last-known-good pointer "
                        + "before deleting anything, and clear it once the set it names goes past its "
                        + "protection window");
        String resource = (String) statement.get("Resource");
        assertTrue(
                resource.endsWith("parameter/submit/ci/last-known-good-deployment"),
                "expected the ci environment's last-known-good parameter, got " + resource);
        assertFalse(resource.equals("*"), "the last-known-good read/clear grant must not be a bare wildcard");
    }

    @Test
    @SuppressWarnings("unchecked")
    void selfDestructRoleCanWriteOnlyItsOwnEnvironmentsAlarmSilenceParameters() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack();
        Template template = Template.fromStack(selfDestructStack);

        List<Map<String, Object>> statements = findPolicyStatementsContainingSid(template, "WriteAlarmSilence");
        Map<String, Object> statement = statements.stream()
                .filter(s -> "WriteAlarmSilence".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();

        assertEquals(
                List.of("ssm:PutParameter", "ssm:GetParameter"),
                statement.get("Action"),
                "the self-destruct role must be able to write and read its own alarm-silence marker");
        String resource = (String) statement.get("Resource");
        assertTrue(
                resource.endsWith("parameter/submit/ci/alarm-silence/*"),
                "expected the ci alarm-silence prefix, got " + resource);
        assertFalse(resource.equals("*"), "the alarm-silence grant must not be a bare wildcard");
    }

    @Test
    void selfDestructScheduleWrapsHourPastMidnightForStartAt16UTC() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack("2026-01-01T16:16:00Z", 4);
        Template template = Template.fromStack(selfDestructStack);

        var rules = template.findResources("AWS::Events::Rule");
        assertEquals(1, rules.size(), "expected exactly one EventBridge rule");

        var rule = (Map<?, ?>) rules.values().iterator().next();
        var properties = (Map<?, ?>) rule.get("Properties");
        String scheduleExpression = (String) properties.get("ScheduleExpression");

        assertEquals("cron(16 0/4 * * ? *)", scheduleExpression, "schedule should wrap past midnight with hour 0/4");
    }

    @Test
    void selfDestructScheduleWrapsHourPastMidnightForStartAt02UTC() {
        SelfDestructStack selfDestructStack = synthSelfDestructStack("2026-01-01T02:30:00Z", 4);
        Template template = Template.fromStack(selfDestructStack);

        var rules = template.findResources("AWS::Events::Rule");
        assertEquals(1, rules.size(), "expected exactly one EventBridge rule");

        var rule = (Map<?, ?>) rules.values().iterator().next();
        var properties = (Map<?, ?>) rule.get("Properties");
        String scheduleExpression = (String) properties.get("ScheduleExpression");

        assertEquals("cron(30 2/4 * * ? *)", scheduleExpression, "schedule should wrap past midnight with hour 2/4");
    }

    /**
     * The self-destruct role's grants are inline policies on the {@code AWS::IAM::Role} itself
     * (built via {@code Role.Builder.inlinePolicies}), not a separate {@code AWS::IAM::Policy}
     * resource (what {@code addToRolePolicy} produces), so this searches the role's own
     * {@code Policies} list rather than the {@code AWS::IAM::Policy} resource type.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> findPolicyStatementsContainingSid(Template template, String sid) {
        for (Map<String, Object> role : template.findResources("AWS::IAM::Role").values()) {
            Map<String, Object> properties = (Map<String, Object>) role.get("Properties");
            List<Map<String, Object>> inlinePolicies = (List<Map<String, Object>>) properties.get("Policies");
            if (inlinePolicies == null) continue;
            for (Map<String, Object> inlinePolicy : inlinePolicies) {
                Map<String, Object> document = (Map<String, Object>) inlinePolicy.get("PolicyDocument");
                List<Map<String, Object>> statements = (List<Map<String, Object>>) document.get("Statement");
                if (statements.stream().anyMatch(statement -> sid.equals(statement.get("Sid")))) {
                    return statements;
                }
            }
        }
        throw new AssertionError("no IAM::Role inline policy statement carries Sid " + sid);
    }
}
