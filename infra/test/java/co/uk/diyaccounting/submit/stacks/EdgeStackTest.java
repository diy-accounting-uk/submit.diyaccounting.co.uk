/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

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
                                List.of(Map.of("AttributeName", "clientIp", "KeyType", "HASH")),
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
                                Match.arrayWith(List.of(Match.objectLike(
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

    @Test
    void cloudFrontAccessLogsDeliveryPartitionsByDateOnlySoHistorySurvivesAcrossReleases() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResourceProperties(
                "AWS::Logs::Delivery",
                Match.objectLike(Map.of("S3SuffixPath", "{yyyy}/{MM}/{dd}/", "S3EnableHiveCompatiblePath", true)));

        assertTrue(!template.toJSON().toString().contains("distributionid"));
    }

    @Test
    void contentSecurityPolicyAllowsGoogleAdsPingsInConnectSrcAndImgSrc() {
        String templateJson = Template.fromStack(synthEdgeStack()).toJSON().toString();

        for (String directive : new String[] {"connect-src", "img-src"}) {
            java.util.regex.Matcher matcher =
                    java.util.regex.Pattern.compile(directive + " [^;]*;").matcher(templateJson);
            int policies = 0;
            while (matcher.find()) {
                if (!matcher.group().contains("googletagmanager.com")) {
                    continue;
                }
                policies++;
                assertTrue(matcher.group().contains("https://www.googleadservices.com"), directive);
                assertTrue(matcher.group().contains("https://googleads.g.doubleclick.net"), directive);
            }
            assertTrue(policies > 0, directive + " not found");
        }
    }

    @Test
    void contentSecurityPolicyAllowsGoogleDrivePickerAndTokenClient() {
        String templateJson = Template.fromStack(synthEdgeStack()).toJSON().toString();
        String[][] required = {
            {"script-src", "https://accounts.google.com", "https://apis.google.com"},
            {"connect-src", "https://www.googleapis.com", "https://oauth2.googleapis.com", "https://accounts.google.com"
            },
            {"frame-src", "https://accounts.google.com", "https://apis.google.com", "https://docs.google.com"},
            {"img-src", "https://*.googleusercontent.com", "https://ssl.gstatic.com", "https://www.gstatic.com"},
            {"img-src", "https://i.ytimg.com"},
        };

        for (String[] directive : required) {
            java.util.regex.Matcher matcher =
                    java.util.regex.Pattern.compile(directive[0] + " [^;]*;").matcher(templateJson);
            int policies = 0;
            while (matcher.find()) {
                if (!matcher.group().contains("'self'")) {
                    continue;
                }
                policies++;
                for (int i = 1; i < directive.length; i++) {
                    assertTrue(matcher.group().contains(directive[i]), directive[0] + " " + directive[i]);
                }
            }
            assertTrue(policies > 0, directive[0] + " not found");
        }
    }

    @Test
    void mcpPathsReachTheApiGatewayOriginWithCachingDisabledAndNoErrorResponses() {
        Template template = Template.fromStack(synthEdgeStack());
        for (String pathPattern : new String[] {"/mcp", "/mcp/*", "/.well-known/oauth-*"}) {
            Map<String, Object> behaviour = Map.of(
                    "PathPattern",
                    pathPattern,
                    "AllowedMethods",
                    Match.arrayWith(List.of("POST", "DELETE")),
                    "CachePolicyId",
                    "4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
            Map<String, Object> config =
                    Map.of("CacheBehaviors", Match.arrayWith(List.of(Match.objectLike(behaviour))));
            template.hasResourceProperties(
                    "AWS::CloudFront::Distribution", Match.objectLike(Map.of("DistributionConfig", config)));
        }
        assertFalse(template.toJSON().toString().contains("CustomErrorResponses"));
    }

    @Test
    void perIpRateRuleLeavesOutMcpPathsAndAnAuthorizationKeyedRuleCoversThem() {
        Template template = Template.fromStack(synthEdgeStack());
        String json = template.toJSON().toString();
        assertTrue(json.contains("McpRateLimitRule"));
        assertTrue(json.contains("CUSTOM_KEYS"));
        assertTrue(json.contains("authorization"));
        assertTrue(json.contains("/.well-known/oauth-"));
        Map<String, Object> rateStatement = Map.of(
                "AggregateKeyType",
                "IP",
                "ScopeDownStatement",
                Match.objectLike(Map.of("NotStatement", Match.anyValue())));
        Map<String, Object> rule = Map.of(
                "Name", "RateLimitRule", "Statement", Map.of("RateBasedStatement", Match.objectLike(rateStatement)));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of("Rules", Match.arrayWith(List.of(Match.objectLike(rule))))));
    }
}
