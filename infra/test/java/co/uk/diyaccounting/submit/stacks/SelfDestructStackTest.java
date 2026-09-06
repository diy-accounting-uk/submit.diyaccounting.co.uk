/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.time.ZonedDateTime;
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
}
