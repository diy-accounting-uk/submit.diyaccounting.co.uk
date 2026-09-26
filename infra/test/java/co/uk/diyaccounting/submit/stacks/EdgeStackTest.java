/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class EdgeStackTest {

    private static EdgeStack synthEdgeStack() {
        App app = new App();
        SubmitSharedNames sharedNames = SubmitSharedNames.forDocs();

        return new EdgeStack(
                app,
                "TestEdgeStack",
                EdgeStack.EdgeStackProps.builder()
                        .env(Environment.builder()
                                .account("111111111111")
                                .region("us-east-1")
                                .build())
                        .crossRegionReferences(true)
                        .envName("docs")
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .hostedZoneName(sharedNames.hostedZoneName)
                        .hostedZoneId("Z1234567890ABC")
                        .certificateArn(
                                "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000")
                        .apiGatewayUrl("https://abc123def.execute-api.eu-west-2.amazonaws.com")
                        .baseImageTag("latest")
                        .build());
    }

    @Test
    void wafScanBurstsTableIsPayPerRequestWithClientIpKeyTtlAndDestroy() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResource(
                "AWS::DynamoDB::Table",
                Match.objectLike(Map.of(
                        "DeletionPolicy",
                        "Delete",
                        "UpdateReplacePolicy",
                        "Delete",
                        "Properties",
                        Match.objectLike(Map.of(
                                "TableName",
                                Match.stringLikeRegexp(".*-waf-scan-bursts"),
                                "BillingMode",
                                "PAY_PER_REQUEST",
                                "KeySchema",
                                java.util.List.of(Map.of("AttributeName", "clientIp", "KeyType", "HASH")),
                                "TimeToLiveSpecification",
                                Map.of("AttributeName", "ttl", "Enabled", true))))));
    }

    @Test
    void wafScanDetectLambdaIsGrantedOnlyUpdateItemOnTheBurstsTable() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(java.util.List.of(Match.objectLike(
                                        Map.of("Action", "dynamodb:UpdateItem", "Effect", "Allow")))))))));

        // Least privilege: the grant is scoped to UpdateItem only, never a broader read/write set.
        String templateJson = template.toJSON().toString();
        assertTrue(templateJson.contains("dynamodb:UpdateItem"));
        assertTrue(!templateJson.contains("dynamodb:PutItem"));
        assertTrue(!templateJson.contains("dynamodb:GetItem"));
        assertTrue(!templateJson.contains("dynamodb:DeleteItem"));
        assertTrue(!templateJson.contains("dynamodb:Scan"));
        assertTrue(!templateJson.contains("dynamodb:Query"));
    }

    @Test
    void wafScanDetectLambdaEnvironmentCarriesTheBurstsTableName() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResourceProperties(
                "AWS::Lambda::Function",
                Match.objectLike(Map.of(
                        "Environment",
                        Match.objectLike(Map.of(
                                "Variables",
                                Match.objectLike(Map.of(
                                        "WAF_SCAN_BURST_DYNAMODB_TABLE_NAME",
                                        Match.stringLikeRegexp(".*-waf-scan-bursts"))))))));
    }
}
