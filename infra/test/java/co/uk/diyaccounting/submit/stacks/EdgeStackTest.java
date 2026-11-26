/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class EdgeStackTest {

    private static EdgeStack synthEdgeStack() {
        return synthEdgeStack("docs");
    }

    private static EdgeStack synthEdgeStack(final String envName) {
        return synthEdgeStack(envName, "");
    }

    private static EdgeStack synthEdgeStack(final String envName, final String originVerifySecretVersionId) {
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
                        .envName(envName)
                        .deploymentName("docs")
                        .resourceNamePrefix(sharedNames.appResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .hostedZoneName(sharedNames.hostedZoneName)
                        .hostedZoneId("Z1234567890ABC")
                        .certificateArn(
                                "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000")
                        .apiGatewayUrl("https://abc123def.execute-api.eu-west-2.amazonaws.com")
                        .docRootPath("web/public")
                        .edgeFunctionAssetPath("app/functions/edge")
                        .originVerifySecretVersionId(originVerifySecretVersionId)
                        .baseImageTag("latest")
                        .build());
    }

    @Test
    void ciDeploymentSetHasNoWafResources() {
        Template template = Template.fromStack(synthEdgeStack("ci"));

        template.resourceCountIs("AWS::WAFv2::WebACL", 0);
        template.resourceCountIs("AWS::WAFv2::IPSet", 0);
        template.resourceCountIs("AWS::WAFv2::RegexPatternSet", 0);
        template.resourceCountIs("AWS::WAFv2::LoggingConfiguration", 0);
        template.resourceCountIs("AWS::Logs::SubscriptionFilter", 0);
        template.resourceCountIs("AWS::DynamoDB::Table", 0);
        template.hasResourceProperties(
                "AWS::CloudFront::Distribution",
                Match.objectLike(Map.of(
                        "DistributionConfig", Match.not(Match.objectLike(Map.of("WebACLId", Match.anyValue()))))));
        // The certificate alarm and its forwarding rule stay on every set.
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of("AlarmName", Match.stringLikeRegexp(".*-cert-expiring"))));
    }

    @Test
    void nonCiDeploymentSetHasWebAclAttachedToTheDistribution() {
        Template template = Template.fromStack(synthEdgeStack("prod"));

        template.resourceCountIs("AWS::WAFv2::WebACL", 1);
        template.hasResourceProperties(
                "AWS::CloudFront::Distribution",
                Match.objectLike(Map.of("DistributionConfig", Match.objectLike(Map.of("WebACLId", Match.anyValue())))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void oversizedBodyRuleExemptsACt600PostUnderTheCtReturnPath() {
        Template template = Template.fromStack(synthEdgeStack("prod"));
        var webAcl = (Map<String, Object>) template.findResources("AWS::WAFv2::WebACL").values().stream()
                .findFirst()
                .orElseThrow();
        var rules = (List<Map<String, Object>>) ((Map<String, Object>) webAcl.get("Properties")).get("Rules");
        var oversizedBody = rules.stream()
                .filter(rule -> "OversizedBodyOutsideBookWrite".equals(rule.get("Name")))
                .findFirst()
                .orElseThrow();
        var conditions = (List<Map<String, Object>>)
                ((Map<String, Object>) ((Map<String, Object>) oversizedBody.get("Statement")).get("AndStatement"))
                        .get("Statements");

        var ctExemption = conditions.stream()
                .map(condition -> (Map<String, Object>) condition.get("NotStatement"))
                .filter(notStatement -> notStatement != null)
                .map(notStatement -> (Map<String, Object>) notStatement.get("Statement"))
                .map(statement -> (Map<String, Object>) statement.get("AndStatement"))
                .filter(andStatement -> andStatement != null)
                .map(andStatement -> (List<Map<String, Object>>) andStatement.get("Statements"))
                .filter(parts -> parts.stream()
                        .anyMatch(part -> part.get("ByteMatchStatement") != null
                                && "/api/v1/hmrc/ct/return"
                                        .equals(((Map<String, Object>) part.get("ByteMatchStatement"))
                                                .get("SearchString"))))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected a NOT exemption for the CT600 return path"));

        assertEquals(2, ctExemption.size());
        var uriMatch = (Map<String, Object>) ctExemption.get(0).get("ByteMatchStatement");
        assertEquals("STARTS_WITH", uriMatch.get("PositionalConstraint"));
        assertTrue(((Map<String, Object>) uriMatch.get("FieldToMatch")).containsKey("UriPath"));
        var methodMatch = (Map<String, Object>) ctExemption.get(1).get("ByteMatchStatement");
        assertTrue(((Map<String, Object>) methodMatch.get("FieldToMatch")).containsKey("Method"));
        assertEquals("EXACTLY", methodMatch.get("PositionalConstraint"));
        assertEquals("POST", methodMatch.get("SearchString"));
    }

    @Test
    void wafBlockAlarmsWatchTheMetricDimensionsCloudFrontScopeWebAclsPublish() {
        Template template = Template.fromStack(synthEdgeStack("prod"));
        String webAcl = SubmitSharedNames.forDocs().appResourceNamePrefix + "-waf";

        Map<String, String> ruleByAlarm = Map.of(
                "waf-rate-limit", "RateLimitRule",
                "waf-attack-signatures", "AWSManagedRulesCommonRuleSet",
                "waf-known-bad-inputs", "AWSManagedRulesKnownBadInputsRuleSet",
                "waf-manual-block", "WafManualBlock");
        ruleByAlarm.forEach((alarmSuffix, rule) -> template.hasResourceProperties(
                "AWS::CloudWatch::Alarm",
                Match.objectLike(Map.of(
                        "AlarmName",
                        Match.stringLikeRegexp(".*-" + alarmSuffix),
                        "Namespace",
                        "AWS/WAFV2",
                        "MetricName",
                        "BlockedRequests",
                        "Dimensions",
                        Match.arrayEquals(List.of(
                                Map.of("Name", "Rule", "Value", rule), Map.of("Name", "WebACL", "Value", webAcl)))))));
    }

    @Test
    void wafAttackAlarmsFireAtFiftyBlocksSoOneBlockedScanDoesNotAlarm() {
        Template template = Template.fromStack(synthEdgeStack("prod"));

        for (String alarmSuffix : List.of("waf-rate-limit", "waf-attack-signatures", "waf-known-bad-inputs")) {
            template.hasResourceProperties(
                    "AWS::CloudWatch::Alarm",
                    Match.objectLike(Map.of(
                            "AlarmName", Match.stringLikeRegexp(".*-" + alarmSuffix), "Threshold", 50, "Period", 300)));
        }
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
                assertTrue(matcher.group().contains("https://pagead2.googlesyndication.com"), directive);
            }
            assertTrue(policies > 0, directive + " not found");
        }
    }

    @Test
    void contentSecurityPolicyAllowsMicrosoftUetScriptAndBeacons() {
        String templateJson = Template.fromStack(synthEdgeStack()).toJSON().toString();

        for (String directive : new String[] {"script-src", "connect-src", "img-src"}) {
            java.util.regex.Matcher matcher =
                    java.util.regex.Pattern.compile(directive + " [^;]*;").matcher(templateJson);
            int policies = 0;
            while (matcher.find()) {
                if (!matcher.group().contains("googletagmanager.com")) {
                    continue;
                }
                policies++;
                assertTrue(matcher.group().contains("https://bat.bing.com"), directive);
                assertTrue(matcher.group().contains("https://bat.bing.net"), directive);
                assertFalse(matcher.group().contains("c.bing.com"), directive);
            }
            assertTrue(policies > 0, directive + " not found");
        }
    }

    @Test
    void originBucketLetsCloudFrontListSoAMissingKeyAnswers404NotForbidden() {
        Template template = Template.fromStack(synthEdgeStack());
        template.hasResourceProperties(
                "AWS::S3::BucketPolicy",
                Map.of(
                        "PolicyDocument",
                        Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Sid",
                                        "AllowCloudFrontListViaOAC",
                                        "Action",
                                        "s3:ListBucket",
                                        "Effect",
                                        "Allow",
                                        "Principal",
                                        Map.of("Service", "cloudfront.amazonaws.com"),
                                        "Condition",
                                        Map.of(
                                                "StringEquals",
                                                Map.of("AWS:SourceAccount", "111111111111"),
                                                "ArnLike",
                                                Map.of(
                                                        "AWS:SourceArn",
                                                        "arn:aws:cloudfront::111111111111:distribution/*")))))))));
    }

    @Test
    void contentSecurityPolicyScriptSrcCarriesNoUnsafeInline() {
        String templateJson = Template.fromStack(synthEdgeStack()).toJSON().toString();
        java.util.regex.Matcher matcher =
                java.util.regex.Pattern.compile("script-src [^;]*;").matcher(templateJson);
        int policies = 0;
        while (matcher.find()) {
            if (!matcher.group().contains("'self'")) {
                continue;
            }
            policies++;
            assertFalse(matcher.group().contains("'unsafe-inline'"), matcher.group());
        }
        assertTrue(policies >= 3, "expected the three response headers policies, found " + policies);
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
    void publicDeadlinesPathIsCachedByItsTwoParametersAndComesBeforeTheGeneralApiBehaviour() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResourceProperties(
                "AWS::CloudFront::CachePolicy",
                Match.objectLike(Map.of(
                        "CachePolicyConfig",
                        Match.objectLike(Map.of(
                                "DefaultTTL",
                                0,
                                "MaxTTL",
                                EdgeStack.PUBLIC_DEADLINES_CACHE_MAX_TTL_SECONDS,
                                "ParametersInCacheKeyAndForwardedToOrigin",
                                Match.objectLike(Map.of(
                                        "QueryStringsConfig",
                                        Map.of(
                                                "QueryStringBehavior",
                                                "whitelist",
                                                "QueryStrings",
                                                List.of("number", "q")),
                                        "CookiesConfig",
                                        Map.of("CookieBehavior", "none"),
                                        "HeadersConfig",
                                        Map.of("HeaderBehavior", "none"))))))));

        @SuppressWarnings("unchecked")
        var distribution = (Map<String, Object>) template.findResources("AWS::CloudFront::Distribution")
                .values()
                .iterator()
                .next();
        @SuppressWarnings("unchecked")
        var config =
                (Map<String, Object>) ((Map<String, Object>) distribution.get("Properties")).get("DistributionConfig");
        @SuppressWarnings("unchecked")
        var behaviours = (List<Map<String, Object>>) config.get("CacheBehaviors");
        var patterns =
                behaviours.stream().map(b -> (String) b.get("PathPattern")).toList();
        int cached = patterns.indexOf("/api/v1/public/company-deadlines");
        assertTrue(cached >= 0, "public deadlines behaviour present");
        assertTrue(cached < patterns.indexOf("/api/v1/*"), "it must come before /api/v1/*");
        assertEquals(List.of("GET", "HEAD"), behaviours.get(cached).get("AllowedMethods"));
        assertNotEquals(
                "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", behaviours.get(cached).get("CachePolicyId"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void publicDeadlinesPathAnswersCorsForTheSpreadsheetsAndDiyaGlSitesWithTheApiSecurityHeaders() {
        Template template = Template.fromStack(synthEdgeStack());
        var policies = template.findResources("AWS::CloudFront::ResponseHeadersPolicy");
        assertEquals(6, policies.size(), "custom response headers policies of one deployment");
        template.resourceCountIs("AWS::CloudFront::ResponseHeadersPolicy", 6);

        String deadlinesPolicyId = null;
        Map<String, Object> deadlinesConfig = null;
        Map<String, Object> apiConfig = null;
        for (var entry : policies.entrySet()) {
            var config = (Map<String, Object>)
                    ((Map<String, Object>) entry.getValue().get("Properties")).get("ResponseHeadersPolicyConfig");
            String name = String.valueOf(config.get("Name"));
            if (name.endsWith("-public-deadlines-whp")) {
                deadlinesPolicyId = entry.getKey();
                deadlinesConfig = config;
            } else if (name.endsWith("-diya-gl-whp")) {
                apiConfig = config;
            }
        }
        assertTrue(deadlinesConfig != null, "public deadlines policy present");
        assertTrue(apiConfig != null, "API policy present");

        var cors = (Map<String, Object>) deadlinesConfig.get("CorsConfig");
        assertEquals(
                List.of(
                        "https://spreadsheets.diyaccounting.co.uk",
                        "https://ci-spreadsheets.diyaccounting.co.uk",
                        "https://diya-gl.co.uk",
                        "https://ci.diya-gl.co.uk"),
                ((Map<String, Object>) cors.get("AccessControlAllowOrigins")).get("Items"));
        assertEquals(
                List.of("GET", "HEAD"), ((Map<String, Object>) cors.get("AccessControlAllowMethods")).get("Items"));
        assertEquals(true, cors.get("OriginOverride"));
        assertEquals(false, cors.get("AccessControlAllowCredentials"));
        assertEquals(apiConfig.get("SecurityHeadersConfig"), deadlinesConfig.get("SecurityHeadersConfig"));
        assertEquals(apiConfig.get("CustomHeadersConfig"), deadlinesConfig.get("CustomHeadersConfig"));
        assertFalse(
                apiConfig.containsKey("CorsConfig"), "the shared API policy keeps passing the origin's CORS through");

        var distribution = (Map<String, Object>) template.findResources("AWS::CloudFront::Distribution")
                .values()
                .iterator()
                .next();
        var behaviours = (List<Map<String, Object>>)
                ((Map<String, Object>) ((Map<String, Object>) distribution.get("Properties")).get("DistributionConfig"))
                        .get("CacheBehaviors");
        var deadlinesBehaviour = behaviours.stream()
                .filter(b -> "/api/v1/public/company-deadlines".equals(b.get("PathPattern")))
                .findFirst()
                .orElseThrow();
        assertEquals(
                deadlinesPolicyId,
                ((Map<String, Object>) deadlinesBehaviour.get("ResponseHeadersPolicyId")).get("Ref"));
        var generalApiBehaviour = behaviours.stream()
                .filter(b -> "/api/v1/*".equals(b.get("PathPattern")))
                .findFirst()
                .orElseThrow();
        assertNotEquals(
                deadlinesPolicyId,
                ((Map<String, Object>) generalApiBehaviour.get("ResponseHeadersPolicyId")).get("Ref"));
    }

    @Test
    void publicDeadlinesPathHasItsOwnPerAddressRateRuleTighterThanTheSiteRule() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> rateStatement = Map.of(
                "Limit",
                (int) EdgeStack.PUBLIC_DEADLINES_RATE_LIMIT_PER_FIVE_MINUTES,
                "AggregateKeyType",
                "IP",
                "EvaluationWindowSec",
                300,
                "ScopeDownStatement",
                Match.objectLike(Map.of(
                        "ByteMatchStatement",
                        Match.objectLike(Map.of(
                                "PositionalConstraint",
                                "STARTS_WITH",
                                "SearchString",
                                "/api/v1/public/company-deadlines")))));
        Map<String, Object> rule = Map.of(
                "Name",
                "PublicDeadlinesRateLimitRule",
                "Action",
                Match.objectLike(Map.of("Block", Match.anyValue())),
                "Statement",
                Map.of("RateBasedStatement", Match.objectLike(rateStatement)));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of("Rules", Match.arrayWith(List.of(Match.objectLike(rule))))));
        assertTrue(EdgeStack.PUBLIC_DEADLINES_RATE_LIMIT_PER_FIVE_MINUTES < 2000L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void publicRegisterPathIsCachedAnHourByItsNumberWithTheDeadlinesCorsPolicyBeforeTheGeneralApiBehaviour() {
        Template template = Template.fromStack(synthEdgeStack());

        template.hasResourceProperties(
                "AWS::CloudFront::CachePolicy",
                Match.objectLike(Map.of(
                        "CachePolicyConfig",
                        Match.objectLike(Map.of(
                                "Name",
                                Match.stringLikeRegexp("-public-register-cp$"),
                                "DefaultTTL",
                                0,
                                "MaxTTL",
                                EdgeStack.PUBLIC_REGISTER_CACHE_MAX_TTL_SECONDS,
                                "ParametersInCacheKeyAndForwardedToOrigin",
                                Match.objectLike(Map.of(
                                        "QueryStringsConfig",
                                        Map.of("QueryStringBehavior", "whitelist", "QueryStrings", List.of("number")),
                                        "CookiesConfig",
                                        Map.of("CookieBehavior", "none"),
                                        "HeadersConfig",
                                        Map.of("HeaderBehavior", "none"))))))));
        assertEquals(3600, EdgeStack.PUBLIC_REGISTER_CACHE_MAX_TTL_SECONDS);
        template.resourceCountIs("AWS::CloudFront::CachePolicy", 3);
        template.resourceCountIs("AWS::CloudFront::ResponseHeadersPolicy", 6);

        String deadlinesPolicyId = template.findResources("AWS::CloudFront::ResponseHeadersPolicy").entrySet().stream()
                .filter(entry -> String.valueOf(((Map<String, Object>)
                                        ((Map<String, Object>) entry.getValue().get("Properties"))
                                                .get("ResponseHeadersPolicyConfig"))
                                .get("Name"))
                        .endsWith("-public-deadlines-whp"))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow();
        String registerCachePolicyId = template.findResources("AWS::CloudFront::CachePolicy").entrySet().stream()
                .filter(entry -> String.valueOf(((Map<String, Object>)
                                        ((Map<String, Object>) entry.getValue().get("Properties"))
                                                .get("CachePolicyConfig"))
                                .get("Name"))
                        .endsWith("-public-register-cp"))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow();

        var distribution = (Map<String, Object>) template.findResources("AWS::CloudFront::Distribution")
                .values()
                .iterator()
                .next();
        var behaviours = (List<Map<String, Object>>)
                ((Map<String, Object>) ((Map<String, Object>) distribution.get("Properties")).get("DistributionConfig"))
                        .get("CacheBehaviors");
        var patterns =
                behaviours.stream().map(b -> (String) b.get("PathPattern")).toList();
        int register = patterns.indexOf("/api/v1/public/company-register");
        assertTrue(register >= 0, "public register behaviour present");
        assertTrue(register < patterns.indexOf("/api/v1/*"), "it must come before /api/v1/*");
        var behaviour = behaviours.get(register);
        assertEquals(List.of("GET", "HEAD"), behaviour.get("AllowedMethods"));
        assertEquals(deadlinesPolicyId, ((Map<String, Object>) behaviour.get("ResponseHeadersPolicyId")).get("Ref"));
        assertEquals(registerCachePolicyId, ((Map<String, Object>) behaviour.get("CachePolicyId")).get("Ref"));
    }

    @Test
    void publicRegisterPathHasItsOwnPerAddressRateRuleTighterThanTheDeadlinesRule() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> rateStatement = Map.of(
                "Limit",
                (int) EdgeStack.PUBLIC_REGISTER_RATE_LIMIT_PER_FIVE_MINUTES,
                "AggregateKeyType",
                "IP",
                "EvaluationWindowSec",
                300,
                "ScopeDownStatement",
                Match.objectLike(Map.of(
                        "ByteMatchStatement",
                        Match.objectLike(Map.of(
                                "PositionalConstraint",
                                "STARTS_WITH",
                                "SearchString",
                                "/api/v1/public/company-register")))));
        Map<String, Object> rule = Map.of(
                "Name",
                "PublicRegisterRateLimitRule",
                "Action",
                Match.objectLike(Map.of("Block", Match.anyValue())),
                "Statement",
                Map.of("RateBasedStatement", Match.objectLike(rateStatement)));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of("Rules", Match.arrayWith(List.of(Match.objectLike(rule))))));
        assertEquals(10L, EdgeStack.PUBLIC_REGISTER_RATE_LIMIT_PER_FIVE_MINUTES);
        assertTrue(EdgeStack.PUBLIC_REGISTER_RATE_LIMIT_PER_FIVE_MINUTES
                < EdgeStack.PUBLIC_DEADLINES_RATE_LIMIT_PER_FIVE_MINUTES);
    }

    @Test
    void markdownCopiesAreServedWithNoindexAndTheSecurityHeadersWhileOtherPathsKeepTheirPolicies() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> noindex = Map.of("Header", "X-Robots-Tag", "Value", "noindex", "Override", true);
        Map<String, Object> config = Map.of(
                "Name",
                Match.stringLikeRegexp("-markdown-headers$"),
                "CustomHeadersConfig",
                Match.objectLike(Map.of("Items", Match.arrayWith(List.of(Match.objectLike(noindex))))),
                "SecurityHeadersConfig",
                Match.objectLike(Map.of(
                        "StrictTransportSecurity", Match.anyValue(),
                        "ContentTypeOptions", Match.anyValue(),
                        "FrameOptions", Match.anyValue())));
        template.hasResourceProperties(
                "AWS::CloudFront::ResponseHeadersPolicy",
                Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(config))));
        Map<String, Object> markdownBehaviour =
                Map.of("PathPattern", "*.md", "ResponseHeadersPolicyId", Match.anyValue());
        Map<String, Object> distribution =
                Map.of("CacheBehaviors", Match.arrayWith(List.of(Match.objectLike(markdownBehaviour))));
        template.hasResourceProperties(
                "AWS::CloudFront::Distribution", Match.objectLike(Map.of("DistributionConfig", distribution)));
    }

    @Test
    void embedPathsMayBeFramedByAnySiteAndAreNotIndexedWhileEveryOtherPathStaysUnframeable() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> noindex = Map.of("Header", "X-Robots-Tag", "Value", "noindex", "Override", true);
        Map<String, Object> permissions = Map.of("Header", "Permissions-Policy", "Override", true);
        Map<String, Object> embedConfig = Map.of(
                "Name",
                Match.stringLikeRegexp("-embed-headers$"),
                "CustomHeadersConfig",
                Match.objectLike(Map.of(
                        "Items", Match.arrayWith(List.of(Match.objectLike(permissions), Match.objectLike(noindex))))),
                "SecurityHeadersConfig",
                Match.objectLike(Map.of(
                        "ContentSecurityPolicy",
                        Match.objectLike(Map.of(
                                "ContentSecurityPolicy",
                                Match.stringLikeRegexp(
                                        "^default-src 'self'; .*frame-ancestors \\*; form-action 'self';$"))),
                        "StrictTransportSecurity",
                        Match.anyValue(),
                        "ContentTypeOptions",
                        Match.anyValue())));
        template.hasResourceProperties(
                "AWS::CloudFront::ResponseHeadersPolicy",
                Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(embedConfig))));
        Map<String, Object> noFrameOptions = Map.of(
                "SecurityHeadersConfig",
                Match.objectLike(Map.of("FrameOptions", Match.absent())),
                "Name",
                Match.stringLikeRegexp("-embed-headers$"));
        template.hasResourceProperties(
                "AWS::CloudFront::ResponseHeadersPolicy",
                Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(noFrameOptions))));
        Map<String, Object> webConfig = Map.of(
                "Name",
                Match.stringLikeRegexp("-whp$"),
                "SecurityHeadersConfig",
                Match.objectLike(Map.of(
                        "ContentSecurityPolicy",
                        Match.objectLike(Map.of(
                                "ContentSecurityPolicy", Match.stringLikeRegexp(".*frame-ancestors 'none'; .*"))),
                        "FrameOptions",
                        Match.objectLike(Map.of("FrameOption", "DENY")))));
        template.hasResourceProperties(
                "AWS::CloudFront::ResponseHeadersPolicy",
                Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(webConfig))));
        Map<String, Object> embedBehaviour =
                Map.of("PathPattern", "/embed/*", "ResponseHeadersPolicyId", Match.anyValue());
        Map<String, Object> distribution =
                Map.of("CacheBehaviors", Match.arrayWith(List.of(Match.objectLike(embedBehaviour))));
        template.hasResourceProperties(
                "AWS::CloudFront::Distribution", Match.objectLike(Map.of("DistributionConfig", distribution)));
    }

    @Test
    void mcpRoutesKeepTheFacadesContentSecurityPolicyWhileApiRoutesTakeCloudFronts() {
        Template template = Template.fromStack(synthEdgeStack());
        for (Map.Entry<String, Boolean> expected :
                Map.of("-mcp-whp", false, "-diya-gl-whp", true).entrySet()) {
            Map<String, Object> contentSecurityPolicy = Map.of("Override", expected.getValue());
            Map<String, Object> securityHeaders =
                    Map.of("ContentSecurityPolicy", Match.objectLike(contentSecurityPolicy));
            Map<String, Object> config = Map.of(
                    "Name",
                    Match.stringLikeRegexp(expected.getKey() + "$"),
                    "SecurityHeadersConfig",
                    Match.objectLike(securityHeaders));
            template.hasResourceProperties(
                    "AWS::CloudFront::ResponseHeadersPolicy",
                    Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(config))));
        }
    }

    @Test
    void webPagesMayOpenAnIdentityPopupWhileApiAndMcpRoutesStaySameOrigin() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, String> expectedOpenerPolicyByName = Map.of(
                "^(?!.*(-diya-gl-whp|-mcp-whp)$).*-whp$",
                "same-origin-allow-popups",
                "-diya-gl-whp$",
                "same-origin",
                "-mcp-whp$",
                "same-origin");
        for (Map.Entry<String, String> expected : expectedOpenerPolicyByName.entrySet()) {
            Map<String, Object> openerPolicy =
                    Map.of("Header", "Cross-Origin-Opener-Policy", "Value", expected.getValue(), "Override", true);
            Map<String, Object> config = Map.of(
                    "Name",
                    Match.stringLikeRegexp(expected.getKey()),
                    "CustomHeadersConfig",
                    Match.objectLike(Map.of("Items", Match.arrayWith(List.of(Match.objectLike(openerPolicy))))));
            template.hasResourceProperties(
                    "AWS::CloudFront::ResponseHeadersPolicy",
                    Match.objectLike(Map.of("ResponseHeadersPolicyConfig", Match.objectLike(config))));
        }
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

    @Test
    void mcpRequestsWithNoAuthorizationHeaderAreCountedPerAddress() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> noAuthorizationHeader = Map.of(
                "NotStatement",
                Map.of(
                        "Statement",
                        Map.of(
                                "SizeConstraintStatement",
                                Match.objectLike(Map.of(
                                        "FieldToMatch",
                                        Map.of("SingleHeader", Map.of("Name", "authorization")),
                                        "ComparisonOperator",
                                        "GT",
                                        "Size",
                                        0)))));
        Map<String, Object> rateStatement = Map.of(
                "Limit",
                (int) EdgeStack.MCP_ANONYMOUS_RATE_LIMIT_PER_FIVE_MINUTES,
                "EvaluationWindowSec",
                300,
                "AggregateKeyType",
                "IP",
                "ScopeDownStatement",
                Map.of(
                        "AndStatement",
                        Map.of(
                                "Statements",
                                List.of(
                                        Match.objectLike(Map.of("OrStatement", Match.anyValue())),
                                        Match.objectLike(noAuthorizationHeader)))));
        Map<String, Object> rule = Map.of(
                "Name",
                "McpAnonymousRateLimitRule",
                "Action",
                Match.objectLike(Map.of("Block", Match.anyValue())),
                "Statement",
                Map.of("RateBasedStatement", Match.objectLike(rateStatement)));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of("Rules", Match.arrayWith(List.of(Match.objectLike(rule))))));
    }

    @Test
    void everyWebAclRuleHasItsOwnPriority() {
        Template template = Template.fromStack(synthEdgeStack());
        template.findResources("AWS::WAFv2::WebACL").values().forEach(webAcl -> {
            @SuppressWarnings("unchecked")
            var rules = (List<Map<String, Object>>) ((Map<String, Object>) webAcl.get("Properties")).get("Rules");
            var priorities = rules.stream().map(rule -> rule.get("Priority")).toList();
            assertEquals(priorities.size(), new java.util.HashSet<>(priorities).size(), "priorities " + priorities);
        });
    }

    @Test
    void reviewerSignInPostsAreCountedPerAddressAndBlockedPastTenInFiveMinutes() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> rateStatement = Map.of(
                "Limit",
                10,
                "EvaluationWindowSec",
                300,
                "AggregateKeyType",
                "IP",
                "ScopeDownStatement",
                Match.objectLike(Map.of(
                        "AndStatement",
                        Match.objectLike(Map.of(
                                "Statements",
                                List.of(
                                        Match.objectLike(Map.of(
                                                "ByteMatchStatement",
                                                Match.objectLike(
                                                        Map.of(
                                                                "FieldToMatch",
                                                                Map.of("Method", Match.anyValue()),
                                                                "SearchString",
                                                                "POST")))),
                                        Match.objectLike(Map.of(
                                                "ByteMatchStatement",
                                                Match.objectLike(
                                                        Map.of(
                                                                "FieldToMatch",
                                                                Map.of("UriPath", Match.anyValue()),
                                                                "PositionalConstraint",
                                                                "EXACTLY",
                                                                "SearchString",
                                                                "/mcp/oauth/reviewer"))))))))));
        Map<String, Object> rule = Map.of(
                "Name",
                "McpReviewerRateLimitRule",
                "Action",
                Match.objectLike(Map.of("Block", Match.anyValue())),
                "Statement",
                Map.of("RateBasedStatement", Match.objectLike(rateStatement)));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of("Rules", Match.arrayWith(List.of(Match.objectLike(rule))))));
    }

    @Test
    void loopbackUriRulesCountInTheCommonRuleSetAndAreBlockedOnEveryPathExceptTheMcpOauthPaths() {
        Template template = Template.fromStack(synthEdgeStack());
        List<Object> countOverrides = Stream.of(
                        "SizeRestrictions_BODY",
                        "EC2MetaDataSSRF_BODY",
                        "EC2MetaDataSSRF_QUERYARGUMENTS",
                        "GenericRFI_BODY",
                        "GenericRFI_QUERYARGUMENTS")
                .<Object>map(name -> Match.objectLike(
                        Map.of("Name", name, "ActionToUse", Match.objectLike(Map.of("Count", Match.anyValue())))))
                .toList();
        Map<String, Object> commonRuleSet = Map.of(
                "Name",
                "AWSManagedRulesCommonRuleSet",
                "Statement",
                Map.of(
                        "ManagedRuleGroupStatement",
                        Match.objectLike(Map.of("RuleActionOverrides", Match.arrayWith(countOverrides)))));
        List<Object> labels = Stream.of(
                        "EC2MetaDataSSRF_Body",
                        "EC2MetaDataSSRF_QueryArguments",
                        "GenericRFI_Body",
                        "GenericRFI_QueryArguments")
                .<Object>map(name -> Match.objectLike(Map.of(
                        "LabelMatchStatement",
                        Match.objectLike(Map.of("Scope", "LABEL", "Key", "awswaf:managed:aws:core-rule-set:" + name)))))
                .toList();
        Map<String, Object> anyLabel =
                Map.of("OrStatement", Match.objectLike(Map.of("Statements", Match.arrayWith(labels))));
        List<Object> paths = Stream.of("/mcp/oauth/register", "/mcp/oauth/authorize", "/mcp/oauth/token")
                .<Object>map(path -> Match.objectLike(Map.of(
                        "ByteMatchStatement",
                        Match.objectLike(Map.of(
                                "FieldToMatch",
                                Map.of("UriPath", Match.anyValue()),
                                "PositionalConstraint",
                                "EXACTLY",
                                "SearchString",
                                path)))))
                .toList();
        Map<String, Object> notOauthPath = Map.of(
                "NotStatement",
                Match.objectLike(Map.of(
                        "Statement",
                        Match.objectLike(Map.of(
                                "OrStatement", Match.objectLike(Map.of("Statements", Match.arrayWith(paths))))))));
        Map<String, Object> blockRule = Map.of(
                "Name",
                "LoopbackUriRulesOutsideMcpOauth",
                "Action",
                Match.objectLike(Map.of("Block", Match.anyValue())),
                "Statement",
                Map.of(
                        "AndStatement",
                        Match.objectLike(Map.of(
                                "Statements",
                                Match.arrayWith(
                                        List.of(Match.objectLike(anyLabel), Match.objectLike(notOauthPath)))))));
        template.hasResourceProperties(
                "AWS::WAFv2::WebACL",
                Match.objectLike(Map.of(
                        "Rules",
                        Match.arrayWith(List.of(Match.objectLike(commonRuleSet), Match.objectLike(blockRule))))));
    }

    @Test
    void everyApiOriginSendsTheOriginVerifyHeaderFromTheNamedSecretVersion() {
        String templateJson = Template.fromStack(synthEdgeStack("prod", "11111111-2222-3333-4444-555555555555"))
                .toJSON()
                .toString();
        String reference =
                "{{resolve:secretsmanager:prod/submit/origin/verify:SecretString:current::11111111-2222-3333-4444-555555555555}}";

        assertEquals(8, templateJson.split(java.util.regex.Pattern.quote(reference), -1).length - 1);
        assertEquals(8, templateJson.split("HeaderName=x-diya-origin-verify", -1).length - 1);
    }

    @Test
    void noOriginSendsTheOriginVerifyHeaderBeforeTheSecretExists() {
        String templateJson =
                Template.fromStack(synthEdgeStack("prod")).toJSON().toString();

        assertFalse(templateJson.contains("x-diya-origin-verify"));
        assertFalse(templateJson.contains("origin/verify"));
    }

    @Test
    void webResponseHeadersPolicyAllowsOnlyTheEnvironmentsOwnOrigin() {
        Template template = Template.fromStack(synthEdgeStack());
        String ownOrigin = SubmitSharedNames.forDocs().publicBaseUrl.replaceAll("/$", "");

        template.hasResourceProperties(
                "AWS::CloudFront::ResponseHeadersPolicy",
                Match.objectLike(Map.of(
                        "ResponseHeadersPolicyConfig",
                        Map.of(
                                "CorsConfig",
                                Map.of("AccessControlAllowOrigins", Map.of("Items", List.of(ownOrigin)))))));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> distributionConfig(final Template template) {
        Map<String, Map<String, Object>> distributions = template.findResources("AWS::CloudFront::Distribution");
        assertEquals(1, distributions.size());
        Map<String, Object> properties =
                (Map<String, Object>) distributions.values().iterator().next().get("Properties");
        return (Map<String, Object>) properties.get("DistributionConfig");
    }

    @Test
    @SuppressWarnings("unchecked")
    void pageRouterRunsOnTheViewerRequestOfTheDefaultBehaviourAndOnNoOtherBehaviour() {
        Template template = Template.fromStack(synthEdgeStack());

        template.resourceCountIs("AWS::CloudFront::Function", 1);
        template.hasResourceProperties(
                "AWS::CloudFront::Function",
                Match.objectLike(Map.of(
                        "Name",
                        SubmitSharedNames.forDocs().appResourceNamePrefix + "-page-router",
                        "AutoPublish",
                        true,
                        "FunctionConfig",
                        Match.objectLike(Map.of("Runtime", "cloudfront-js-2.0")))));
        Map<String, Object> config = distributionConfig(template);
        Map<String, Object> defaultBehaviour = (Map<String, Object>) config.get("DefaultCacheBehavior");
        List<Map<String, Object>> associations =
                (List<Map<String, Object>>) defaultBehaviour.get("FunctionAssociations");
        assertEquals(1, associations.size());
        assertEquals("viewer-request", associations.get(0).get("EventType"));
        for (Map<String, Object> behaviour : (List<Map<String, Object>>) config.get("CacheBehaviors")) {
            assertFalse(
                    behaviour.containsKey("FunctionAssociations"),
                    behaviour.get("PathPattern") + " runs a CloudFront Function");
            assertFalse(
                    behaviour.containsKey("LambdaFunctionAssociations"),
                    behaviour.get("PathPattern") + " runs a Lambda@Edge function");
        }
        assertFalse(defaultBehaviour.containsKey("LambdaFunctionAssociations"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void apiMcpAndOauthPathsReachTheApiOriginWithNoFunctionAndNoErrorResponseSoTheirErrorsStayJson() {
        Template template = Template.fromStack(synthEdgeStack("prod"));
        Map<String, Object> config = distributionConfig(template);

        assertFalse(config.containsKey("CustomErrorResponses"));
        String webOriginId = (String) ((Map<String, Object>) config.get("DefaultCacheBehavior")).get("TargetOriginId");
        List<String> apiPatterns =
                List.of("/api/v1/*", "/api/v1/diya-gl/*", "/api/v1/books/*", "/mcp", "/mcp/*", "/.well-known/oauth-*");
        List<String> seen = new java.util.ArrayList<>();
        for (Map<String, Object> behaviour : (List<Map<String, Object>>) config.get("CacheBehaviors")) {
            String pathPattern = (String) behaviour.get("PathPattern");
            if (apiPatterns.contains(pathPattern)) {
                seen.add(pathPattern);
                assertNotEquals(webOriginId, behaviour.get("TargetOriginId"), pathPattern);
                assertFalse(behaviour.containsKey("FunctionAssociations"), pathPattern);
            }
        }
        assertEquals(apiPatterns.size(), seen.size(), "missing API behaviours: " + seen);
    }

    @Test
    @SuppressWarnings("unchecked")
    void pageRouterCodeIsWrittenFromThePublishedPagesAndThe404Page() {
        Template template = Template.fromStack(synthEdgeStack());
        Map<String, Object> properties = (Map<String, Object>) template.findResources("AWS::CloudFront::Function")
                .values()
                .iterator()
                .next()
                .get("Properties");
        String expected = co.uk.diyaccounting.submit.utils.PageRouterFunctionCode.fromDisk(
                java.nio.file.Path.of("web/public").toAbsolutePath(),
                java.nio.file.Path.of("app/functions/edge").toAbsolutePath());

        assertEquals(expected, properties.get("FunctionCode"));
        assertTrue(expected.contains("<h1>Page not found</h1>"), "the 404 page body");
    }
}
