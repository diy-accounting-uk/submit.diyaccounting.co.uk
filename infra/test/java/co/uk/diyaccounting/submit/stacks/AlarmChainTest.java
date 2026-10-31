/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AlarmChain;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Template;

class AlarmChainTest {

    @Test
    @SuppressWarnings("unchecked")
    void accountStackAlarmsAfterTheTenthDependOnAnotherAlarm() {
        var sharedNames = SubmitSharedNames.forDocs();
        var props = AccountStack.AccountStackProps.builder()
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
                .cognitoUserPoolArn("arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_TestPool")
                .hmrcAgentAuthorisationBaseUri("https://test-api.service.hmrc.gov.uk")
                .booksAllowedOrigins("https://ci.diya-gl.co.uk")
                .build();
        var template = Template.fromStack(new AccountStack(new App(), "ChainAccountStack", props));

        Map<String, Map<String, Object>> alarms = template.findResources("AWS::CloudWatch::Alarm");
        Set<String> alarmIds = alarms.keySet();
        assertTrue(alarmIds.size() > AlarmChain.MAX_IN_FLIGHT, "expected more than ten alarms, got " + alarmIds.size());

        long alarmsWithNoAlarmDependency = alarms.values().stream()
                .filter(resource -> dependsOn(resource).stream().noneMatch(alarmIds::contains))
                .count();
        assertEquals(
                AlarmChain.MAX_IN_FLIGHT,
                alarmsWithNoAlarmDependency,
                "only the first ten alarms may start without waiting for another alarm");
    }

    @SuppressWarnings("unchecked")
    private static List<String> dependsOn(Map<String, Object> resource) {
        Object value = resource.get("DependsOn");
        if (value == null) {
            return List.of();
        }
        if (value instanceof String single) {
            return List.of(single);
        }
        return ((List<Object>) value).stream().map(Object::toString).collect(Collectors.toList());
    }
}
