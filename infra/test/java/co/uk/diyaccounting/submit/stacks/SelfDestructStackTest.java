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
                .selfDestructStartDatetime(ZonedDateTime.parse("2026-01-01T00:00:00Z"))
                .selfDestructDelayHours(6)
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
