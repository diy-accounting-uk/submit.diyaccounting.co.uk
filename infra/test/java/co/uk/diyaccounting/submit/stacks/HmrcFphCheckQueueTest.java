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
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

/**
 * The queue of new fraud prevention header shapes, its dead letter queue and its consumer: both
 * queues are encrypted and refuse a request without TLS, the retention and redrive are set, the
 * consumer reads one message at a time with two at once at most, and every other function in the
 * stack can send to the queue.
 */
class HmrcFphCheckQueueTest {

    private static final SubmitSharedNames SHARED_NAMES = SubmitSharedNames.forDocs();
    private static Template TEMPLATE;

    @BeforeAll
    static void synthHmrcStack() {
        App app = new App();
        HmrcStack stack = new HmrcStack(
                app,
                "TestHmrcFphStack",
                HmrcStack.HmrcStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(SHARED_NAMES.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(SHARED_NAMES)
                        .baseImageTag("latest")
                        .hmrcBaseUri("https://test-api.service.hmrc.gov.uk")
                        .hmrcClientId("test-client-id")
                        .hmrcClientSecretArn("")
                        .hmrcSandboxBaseUri("https://test-api.service.hmrc.gov.uk")
                        .hmrcSandboxClientId("test-sandbox-client-id")
                        .hmrcSandboxClientSecretArn("arn:aws:secretsmanager:eu-west-2:111111111111:secret:sandbox")
                        .cognitoUserPoolId("eu-west-2_TestPool")
                        .build());
        TEMPLATE = Template.fromStack(stack);
    }

    @Test
    void queueKeepsAMessageOneDayAndMovesItToTheDeadLetterQueueAfterThreeReceives() {
        TEMPLATE.hasResourceProperties(
                "AWS::SQS::Queue",
                Match.objectLike(Map.of(
                        "QueueName",
                        SHARED_NAMES.hmrc.hmrcFphCheckQueueName,
                        "MessageRetentionPeriod",
                        86400,
                        "VisibilityTimeout",
                        120,
                        "SqsManagedSseEnabled",
                        true,
                        "RedrivePolicy",
                        Match.objectLike(Map.of("maxReceiveCount", 3)))));
    }

    @Test
    void deadLetterQueueKeepsAMessageFourDaysAndIsEncrypted() {
        TEMPLATE.hasResourceProperties(
                "AWS::SQS::Queue",
                Match.objectLike(Map.of(
                        "QueueName",
                        SHARED_NAMES.hmrc.hmrcFphCheckDeadLetterQueueName,
                        "MessageRetentionPeriod",
                        345600,
                        "SqsManagedSseEnabled",
                        true)));
    }

    @Test
    void bothQueuesRefuseRequestsWithoutTls() {
        var policies = TEMPLATE.findResources("AWS::SQS::QueuePolicy");
        assertEquals(2, policies.size(), "one policy for each queue");
        for (var policy : policies.values()) {
            assertTrue(policy.toString().contains("aws:SecureTransport"), "policy denies a request without TLS");
        }
    }

    @Test
    void consumerReadsOneMessageAtATimeAndTwoAtMost() {
        TEMPLATE.hasResourceProperties(
                "AWS::Lambda::EventSourceMapping",
                Match.objectLike(
                        Map.of("BatchSize", 1, "ScalingConfig", Match.objectLike(Map.of("MaximumConcurrency", 2)))));
        TEMPLATE.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        SHARED_NAMES.hmrc.hmrcFphCheckWorkerFunctionName,
                        "Timeout",
                        60,
                        "ImageConfig",
                        Match.objectLike(Map.of("Command", List.of(SHARED_NAMES.hmrc.hmrcFphCheckWorkerHandler))))));
    }

    @SuppressWarnings("unchecked")
    @Test
    void everyOtherFunctionNamesTheQueueAndTheConsumerDoesNot() {
        int senders = 0;
        for (var function : TEMPLATE.findResources("AWS::Lambda::Function").values()) {
            var properties = (Map<String, Object>) function.get("Properties");
            var variables =
                    (Map<String, Object>) ((Map<String, Object>) properties.get("Environment")).get("Variables");
            boolean consumer = SHARED_NAMES.hmrc.hmrcFphCheckWorkerFunctionName.equals(properties.get("FunctionName"));
            if (consumer) {
                assertFalse(
                        variables.containsKey("FPH_CHECK_QUEUE_URL"), "the consumer does not send to its own queue");
            } else {
                assertTrue(
                        variables.containsKey("FPH_CHECK_QUEUE_URL"),
                        properties.get("FunctionName") + " names the queue");
                senders++;
            }
        }
        assertTrue(senders > 0);
    }

    @SuppressWarnings("unchecked")
    @Test
    void everySendStatementNamesTheQueue() {
        int statements = 0;
        for (var policy : TEMPLATE.findResources("AWS::IAM::Policy").values()) {
            var document = (Map<String, Object>) ((Map<String, Object>) policy.get("Properties")).get("PolicyDocument");
            for (var statement : (List<Map<String, Object>>) document.get("Statement")) {
                if ("sqs:SendMessage".equals(statement.get("Action"))) {
                    statements++;
                    assertTrue(
                            String.valueOf(statement.get("Resource")).contains(SHARED_NAMES.hmrc.hmrcFphCheckQueueName),
                            "a send statement names only the header check queue");
                }
            }
        }
        assertTrue(statements > 0);
    }

    @Test
    void consumerReadsTheSandboxSecretAndTheIntegrationCallsTable() {
        TEMPLATE.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of("Action", "dynamodb:GetItem")))))))));
        TEMPLATE.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "FunctionName",
                        SHARED_NAMES.hmrc.hmrcFphCheckWorkerFunctionName,
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "HMRC_SANDBOX_CLIENT_SECRET_ARN",
                                        "arn:aws:secretsmanager:eu-west-2:111111111111:secret:sandbox",
                                        "INTEGRATION_CALLS_DYNAMODB_TABLE_NAME",
                                        SHARED_NAMES.data.integrationCallsTableName)))))));
    }
}
