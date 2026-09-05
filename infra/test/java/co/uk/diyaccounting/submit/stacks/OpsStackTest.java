/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class OpsStackTest {

    private static OpsStack synthOpsStack(String envName, String opsGithubTokenSecretArn, String baseUrl) {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = envName;
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = envName;
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var builder = OpsStack.OpsStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName(envName)
                .deploymentName(envName)
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest");
        if (opsGithubTokenSecretArn != null) {
            builder.opsGithubTokenSecretArn(opsGithubTokenSecretArn);
        }
        if (baseUrl != null) {
            builder.baseUrl(baseUrl);
        }

        return new OpsStack(app, "TestOpsStack-" + envName, builder.build());
    }

    @Test
    void alarmStateChangeRuleTargetsOnlyTelegramInCi() {
        OpsStack opsStack = synthOpsStack(
                "ci",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:ci/submit/ops/github_token",
                null);
        Template template = Template.fromStack(opsStack);

        var rules = template.findResources(
                "AWS::Events::Rule", Map.of("Properties", Map.of("Name", "ci-env-alarm-state-change")));
        assertEquals(1, rules.size());
        var properties = (Map<?, ?>) rules.values().iterator().next().get("Properties");
        var targets = (List<?>) properties.get("Targets");
        assertEquals(
                1,
                targets.size(),
                "a ci alarm-state-change rule must route to the Telegram forwarder only, never open a GitHub issue");
    }

    @Test
    void alarmStateChangeRuleTargetsTelegramAndGithubIssueInProd() {
        OpsStack opsStack = synthOpsStack(
                "prod",
                "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token",
                null);
        Template template = Template.fromStack(opsStack);

        var rules = template.findResources(
                "AWS::Events::Rule", Map.of("Properties", Map.of("Name", "prod-env-alarm-state-change")));
        assertEquals(1, rules.size());
        var properties = (Map<?, ?>) rules.values().iterator().next().get("Properties");
        var targets = (List<?>) properties.get("Targets");
        assertEquals(
                2,
                targets.size(),
                "a prod alarm-state-change rule must route to both the Telegram forwarder and the "
                        + "GitHub-issue Lambda");
    }

    @Test
    void canaryAlarmsTreatMissingDataAsNotBreaching() {
        OpsStack opsStack = synthOpsStack("prod", null, "https://submit.diyaccounting.co.uk/");
        Template template = Template.fromStack(opsStack);

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of("AlarmName", "prod-env-health-failed", "TreatMissingData", "notBreaching")));
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of("AlarmName", "prod-env-api-failed", "TreatMissingData", "notBreaching")));
    }
}
