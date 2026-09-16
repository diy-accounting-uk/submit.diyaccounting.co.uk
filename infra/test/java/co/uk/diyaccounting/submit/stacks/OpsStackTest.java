/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
                "ci", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:ci/submit/ops/github_token", null);
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
                "prod", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token", null);
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
    void opsStackCreatesNoBusWideTelegramForwarder() {
        OpsStack opsStack = synthOpsStack(
                "prod", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token", null);
        Template template = Template.fromStack(opsStack);

        // The catch-all rule on the custom ActivityEvent bus, and the Lambda it targets, now
        // belong to env-level ActivityStack (one instance per environment, not one per
        // deployment). OpsStack only imports that Lambda as a target for its own
        // deployment-scoped default-bus rules (CfnStackStatusRule, AlarmStateChangeRule).
        var busWideRules = template.findResources(
                "AWS::Events::Rule",
                Map.of("Properties", Map.of("EventPattern", Map.of("detail-type", List.of("ActivityEvent")))));
        assertEquals(
                0, busWideRules.size(), "OpsStack must not create its own bus-wide catch-all Telegram forwarder rule");
        var forwarderFunctionNames = template.findResources("AWS::Lambda::Function").values().stream()
                .map(resource -> (Map<?, ?>) resource.get("Properties"))
                .map(properties -> String.valueOf(properties.get("FunctionName")))
                .filter(functionName -> functionName.contains("activity-telegram-forwarder"))
                .toList();
        assertEquals(List.of(), forwarderFunctionNames, "OpsStack must not build its own Telegram forwarder Lambda");
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

    @Test
    @SuppressWarnings("unchecked")
    void alarmToGithubIssueLambdaCanReadOnlyItsOwnEnvironmentsAlarmSilenceParameters() {
        OpsStack opsStack = synthOpsStack(
                "prod", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token", null);
        Template template = Template.fromStack(opsStack);

        List<Map<String, Object>> statements = findPolicyStatementsContainingSid(template, "ReadAlarmSilence");
        Map<String, Object> statement = statements.stream()
                .filter(s -> "ReadAlarmSilence".equals(s.get("Sid")))
                .findFirst()
                .orElseThrow();

        assertEquals("ssm:GetParameter", statement.get("Action"));
        String resource = (String) statement.get("Resource");
        assertTrue(
                resource.endsWith("parameter/submit/prod/alarm-silence/*"),
                "expected the prod alarm-silence prefix, got " + resource);
    }

    @Test
    @SuppressWarnings("unchecked")
    void alarmToGithubIssueLambdaHasReservedConcurrencyOfOne() {
        // Serialises this deployment's own invocations, so one invocation's create always
        // finishes before the next one's list runs (see #210/#212). It does not reach a second
        // deployment's own copy of this Lambda - see alarmToGithubIssueLambdaCanClaimTheAlarmIssueLockTable
        // for the mechanism that covers that (#273/#274).
        OpsStack opsStack = synthOpsStack(
                "prod", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token", null);
        Template template = Template.fromStack(opsStack);

        var matching = template.findResources("AWS::Lambda::Function").entrySet().stream()
                .filter(entry -> {
                    var properties = (Map<String, Object>) entry.getValue().get("Properties");
                    return String.valueOf(properties.get("FunctionName")).contains("alarm-to-github-issue");
                })
                .toList();
        assertEquals(1, matching.size(), "expected exactly one alarm-to-github-issue Lambda function");
        var properties = (Map<String, Object>) matching.get(0).getValue().get("Properties");
        assertEquals(1.0, ((Number) properties.get("ReservedConcurrentExecutions")).doubleValue());
    }

    @Test
    @SuppressWarnings("unchecked")
    void alarmToGithubIssueLambdaCanClaimTheAlarmIssueLockTable() {
        // #273/#274: two live deployments' own copies of this Lambda both raised an issue for
        // the same environment-scoped alarm transition, because reserved concurrency of 1 only
        // serialises within one deployment. The Lambda claims the transition in the env-scoped
        // alarm-issue-lock table before it calls GitHub, so a second deployment's invocation
        // loses the conditional put instead of also creating an issue.
        OpsStack opsStack = synthOpsStack(
                "prod", "arn:aws:secretsmanager:eu-west-2:111111111111:secret:prod/submit/ops/github_token", null);
        Template template = Template.fromStack(opsStack);

        var matching = template.findResources("AWS::Lambda::Function").entrySet().stream()
                .filter(entry -> {
                    var properties = (Map<String, Object>) entry.getValue().get("Properties");
                    return String.valueOf(properties.get("FunctionName")).contains("alarm-to-github-issue");
                })
                .toList();
        assertEquals(1, matching.size(), "expected exactly one alarm-to-github-issue Lambda function");
        var properties = (Map<String, Object>) matching.get(0).getValue().get("Properties");
        var environment = (Map<String, Object>) properties.get("Environment");
        var variables = (Map<String, Object>) environment.get("Variables");
        assertEquals("prod-env-alarm-issue-locks", variables.get("ALARM_ISSUE_LOCK_DYNAMODB_TABLE_NAME"));

        var putItemStatements = template.findResources("AWS::IAM::Policy").values().stream()
                .map(resource -> (Map<String, Object>) resource.get("Properties"))
                .map(policyProperties -> (Map<String, Object>) policyProperties.get("PolicyDocument"))
                .flatMap(policyDocument -> ((List<Map<String, Object>>) policyDocument.get("Statement")).stream())
                .filter(statement -> {
                    var action = statement.get("Action");
                    return action.equals("dynamodb:PutItem") || (action instanceof List<?> actions && actions.contains("dynamodb:PutItem"));
                })
                .toList();
        assertTrue(
                putItemStatements.stream().anyMatch(statement -> String.valueOf(statement.get("Resource")).contains("AlarmIssueLockTable")
                        || String.valueOf(statement.get("Resource")).contains("alarm-issue-locks")),
                "expected a dynamodb:PutItem statement scoped to the alarm-issue-lock table, got " + putItemStatements);
    }

    @Test
    @SuppressWarnings("unchecked")
    void tokenChargeUnpaidMetricFiltersCoverEveryHmrcSubmissionEndpointIngestLogGroup() {
        OpsStack opsStack = synthOpsStack("prod", null, null);
        Template template = Template.fromStack(opsStack);

        Map<String, Map<String, Object>> metricFilters = template.findResources("AWS::Logs::MetricFilter");
        assertEquals(
                12,
                metricFilters.size(),
                "expected one metric filter per HMRC submission endpoint that calls chargeTokenOnSuccess, "
                        + "on the ingest log group its worker shares");
        assertTrue(
                metricFilters.keySet().stream().noneMatch(id -> id.contains("Worker")),
                "a worker has no log group of its own, so no filter may name one: " + metricFilters.keySet());

        for (Map<String, Object> filter : metricFilters.values()) {
            var properties = (Map<String, Object>) filter.get("Properties");
            assertEquals("{ $.message = \"Token charge failed after HMRC success\" }", properties.get("FilterPattern"));
            var metricTransformations = (List<Map<String, Object>>) properties.get("MetricTransformations");
            assertEquals(1, metricTransformations.size());
            assertEquals("Submit/Business", metricTransformations.get(0).get("MetricNamespace"));
            assertEquals("TokenChargeUnpaid", metricTransformations.get(0).get("MetricName"));
        }

        var logGroupNames = metricFilters.values().stream()
                .map(filter -> (Map<String, Object>) filter.get("Properties"))
                .map(properties -> (String) properties.get("LogGroupName"))
                .toList();
        assertTrue(
                logGroupNames.stream().anyMatch(name -> name.contains("hmrc-vat-return-post")),
                "expected a metric filter on a VAT return post log group, got " + logGroupNames);
        assertTrue(
                logGroupNames.stream().anyMatch(name -> name.contains("hmrc-itsa-final-declaration-post")),
                "expected a metric filter on an ITSA final declaration log group, got " + logGroupNames);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> findPolicyStatementsContainingSid(Template template, String sid) {
        for (Map<String, Object> policy :
                template.findResources("AWS::IAM::Policy").values()) {
            Map<String, Object> properties = (Map<String, Object>) policy.get("Properties");
            Map<String, Object> document = (Map<String, Object>) properties.get("PolicyDocument");
            List<Map<String, Object>> statements = (List<Map<String, Object>>) document.get("Statement");
            if (statements.stream().anyMatch(statement -> sid.equals(statement.get("Sid")))) {
                return statements;
            }
        }
        throw new AssertionError("no IAM::Policy statement carries Sid " + sid);
    }
}
