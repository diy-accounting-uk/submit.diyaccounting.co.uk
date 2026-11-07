/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class EmailStackTest {

    private static EmailStack synthEmailStack(String envName, String operatorNotifyEmail) {
        App app = new App();
        SubmitSharedNames.SubmitSharedNamesProps sharedNamesProps = new SubmitSharedNames.SubmitSharedNamesProps();
        sharedNamesProps.hostedZoneName = "example.com";
        sharedNamesProps.envName = envName;
        sharedNamesProps.subDomainName = "submit";
        sharedNamesProps.deploymentName = envName + "-emailtest";
        sharedNamesProps.regionName = "eu-west-2";
        sharedNamesProps.awsAccount = "111111111111";
        SubmitSharedNames sharedNames = new SubmitSharedNames(sharedNamesProps);

        var props = EmailStack.EmailStackProps.builder()
                .env(Environment.builder()
                        .account("111111111111")
                        .region("eu-west-2")
                        .build())
                .crossRegionReferences(false)
                .envName(envName)
                .deploymentName(envName + "-emailtest")
                .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                .cloudTrailEnabled("false")
                .sharedNames(sharedNames)
                .baseImageTag("latest")
                .hostedZoneName("example.com")
                .hostedZoneId("Z1234567890")
                .operatorNotifyEmail(operatorNotifyEmail)
                .build();

        return new EmailStack(app, "TestEmailStack", props);
    }

    @Test
    void stackCreatesTheSesIdentityConfigurationSetAndEventPath() {
        Template template = Template.fromStack(synthEmailStack("ci", "ops@example.com"));

        template.resourceCountIs("AWS::SES::EmailIdentity", 1);
        template.resourceCountIs("AWS::SES::ConfigurationSet", 1);
        template.resourceCountIs("AWS::SES::ConfigurationSetEventDestination", 1);
        template.resourceCountIs("AWS::SNS::Topic", 1);
        template.resourceCountIs("AWS::SQS::Queue", 2);
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.resourceCountIs("AWS::Lambda::EventSourceMapping", 1);
        template.resourceCountIs("AWS::Lambda::Function", 3);
    }

    @Test
    void identityUsesEasyDkimAndACustomMailFromDomainOnTheConfigurationSet() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::SES::EmailIdentity",
                Match.objectLike(Map.of(
                        "EmailIdentity",
                        "example.com",
                        "DkimSigningAttributes",
                        Match.objectLike(Map.of("NextSigningKeyLength", "RSA_2048_BIT")),
                        "MailFromAttributes",
                        Match.objectLike(Map.of(
                                "MailFromDomain", "bounce.example.com", "BehaviorOnMxFailure", "USE_DEFAULT_VALUE")))));
        template.hasResourceProperties(
                "AWS::SES::ConfigurationSet", Match.objectLike(Map.of("Name", "ci-env-customer-email")));
    }

    @Test
    void eventDestinationSendsBounceComplaintRejectRenderingFailureAndDelayToTheTopic() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::SES::ConfigurationSetEventDestination",
                Match.objectLike(Map.of(
                        "EventDestination",
                        Match.objectLike(Map.of(
                                "Enabled",
                                true,
                                "MatchingEventTypes",
                                List.of("bounce", "complaint", "reject", "renderingFailure", "deliveryDelay"))))));
        template.hasResourceProperties(
                "AWS::SNS::Topic", Match.objectLike(Map.of("TopicName", "ci-env-customer-email-events")));
    }

    @Test
    void queuesAreEncryptedAndTheMainQueueRedrivesToTheDeadLetterQueueAfterFiveReceives() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::SQS::Queue",
                Match.objectLike(Map.of(
                        "QueueName",
                        "ci-env-customer-email",
                        "SqsManagedSseEnabled",
                        true,
                        "VisibilityTimeout",
                        180,
                        "MessageRetentionPeriod",
                        4 * 24 * 3600,
                        "RedrivePolicy",
                        Match.objectLike(Map.of("maxReceiveCount", 5)))));
        template.hasResourceProperties(
                "AWS::SQS::Queue",
                Match.objectLike(
                        Map.of("QueueName", "ci-env-customer-email-dlq", "MessageRetentionPeriod", 14 * 24 * 3600)));
    }

    @Test
    void ruleSendsCustomerEmailRequestsToTheQueueWithTheEventDetailAsTheMessage() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::Events::Rule",
                Match.objectLike(Map.of(
                        "EventPattern",
                        Match.objectLike(Map.of("detail-type", List.of("CustomerEmailRequest"))),
                        "Targets",
                        Match.arrayWith(List.of(Match.objectLike(
                                Map.of("InputPath", "$.detail", "DeadLetterConfig", Match.anyValue())))))));
    }

    @Test
    void workerReadsOneMessageAtATimeWithAtMostTwoInFlight() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::Lambda::EventSourceMapping",
                Match.objectLike(
                        Map.of("BatchSize", 1, "ScalingConfig", Match.objectLike(Map.of("MaximumConcurrency", 2)))));
    }

    @Test
    void workerSendsOnlyFromTheSupportAddressOnTheIdentityAndConfigurationSet() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        var statement = policyStatementWithSid(template, "SendFromSupportAddress");
        assertEquals("ses:SendEmail", statement.get("Action"));
        assertEquals(
                Map.of("StringEquals", Map.of("ses:FromAddress", "support@example.com")), statement.get("Condition"));
        assertEquals(2, ((List<?>) statement.get("Resource")).size());
    }

    @Test
    void workerLooksUpUsersOnlyInThePoolAndReadsOnlyTheReceiptsItem() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        var listUsers = policyStatementWithSid(template, "LookUpUserInPool");
        assertEquals("cognito-idp:ListUsers", listUsers.get("Action"));
        assertFalse(String.valueOf(listUsers.get("Resource")).contains("\"*\""));
        var getAccount = policyStatementWithSid(template, "ReadSesAccount");
        assertEquals("ses:GetAccount", getAccount.get("Action"));
    }

    @Test
    void testSinkIsSetOnCiAndBlankOnProd() {
        Template ci = Template.fromStack(synthEmailStack("ci", "ops@example.com"));
        Template prod = Template.fromStack(synthEmailStack("prod", "ops@example.com"));

        ci.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "ci-env-customer-email-send",
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "CUSTOMER_EMAIL_TEST_SINK",
                                        "success@simulator.amazonses.com",
                                        "CUSTOMER_EMAIL_OPERATOR_COPY_TO",
                                        "ops@example.com",
                                        "CUSTOMER_EMAIL_FROM",
                                        "DIY Accounting <support@example.com>")))))));
        prod.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "prod-env-customer-email-send",
                        "Environment",
                        Match.objectLike(
                                Map.of("Variables", Match.objectLike(Map.of("CUSTOMER_EMAIL_TEST_SINK", "")))))));
    }

    @Test
    void blankOperatorAddressLeavesTheOperatorCopyBlank() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        "ci-env-customer-email-send",
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables", Match.objectLike(Map.of("CUSTOMER_EMAIL_OPERATOR_COPY_TO", "")))))));
    }

    @Test
    void deadLetterQueueAlarmJoinsTheStackHealthAlarm() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of("AlarmName", "check-ci-env-customer-email-dlq-not-empty")));
        template.hasResourceProperties(
                "AWS::CloudWatch::CompositeAlarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        "ci-env-email" + co.uk.diyaccounting.submit.constructs.Lambda.HEALTH_ALARM_NAME_SUFFIX)));
    }

    @Test
    void dnsRecordsAreWrittenInOneCustomResourceForDkimMailFromMxAndSpf() {
        Template template = Template.fromStack(synthEmailStack("ci", ""));

        var resources = template.findResources("Custom::AWS");
        var text = resources.values().toString();
        assertTrue(text.contains("changeResourceRecordSets"), "a Route53 change batch is written");
        assertTrue(text.contains("bounce.example.com"));
        assertTrue(text.contains("feedback-smtp.eu-west-2.amazonses.com"));
        assertTrue(text.contains("v=spf1 include:amazonses.com ~all"));
        assertTrue(text.contains("CNAME"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> policyStatementWithSid(Template template, String sid) {
        for (Map<String, Object> policy :
                template.findResources("AWS::IAM::Policy").values()) {
            var properties = (Map<String, Object>) policy.get("Properties");
            var document = (Map<String, Object>) properties.get("PolicyDocument");
            for (Map<String, Object> statement : (List<Map<String, Object>>) document.get("Statement")) {
                if (sid.equals(statement.get("Sid"))) return statement;
            }
        }
        throw new AssertionError("no policy statement with Sid " + sid);
    }
}
