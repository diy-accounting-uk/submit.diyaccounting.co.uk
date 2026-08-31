/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.stacks.analytics.CloudFrontAccessLogs;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.ArnComponents;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.PhysicalName;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.CachePolicy;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.HeadersFrameOption;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestCookieBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestHeaderBehavior;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestQueryStringBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeader;
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeadersBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentSecurityPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentTypeOptions;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersCorsBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersFrameOptions;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersReferrerPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersStrictTransportSecurity;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersXSSProtection;
import software.amazon.awscdk.services.cloudfront.ResponseSecurityHeadersBehavior;
import software.amazon.awscdk.services.cloudfront.S3OriginAccessControl;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.Signing;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.HttpOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.events.EventBus;
import software.amazon.awscdk.services.events.EventPattern;
import software.amazon.awscdk.services.events.IEventBus;
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;
import software.amazon.awscdk.services.lambda.Permission;
import software.amazon.awscdk.services.logs.CfnDelivery;
import software.amazon.awscdk.services.logs.CfnDeliveryDestination;
import software.amazon.awscdk.services.logs.CfnDeliveryDestinationProps;
import software.amazon.awscdk.services.logs.CfnDeliveryProps;
import software.amazon.awscdk.services.logs.CfnDeliverySource;
import software.amazon.awscdk.services.logs.CfnDeliverySourceProps;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.wafv2.CfnWebACL;
import software.constructs.Construct;

public class EdgeStack extends Stack {

    public Bucket originBucket;
    // public IBucket originAccessLogBucket;
    public final Distribution distribution;
    public final Permission distributionInvokeFnUrl;
    public final String aliasRecordDomainName;
    public final String aliasRecordV6DomainName;

    // private static final String CF_LOGS_SOURCE_NAME = "cf-src";
    // private static final String CF_LOGS_DEST_NAME = "cf-dest";

    @Value.Immutable
    public interface EdgeStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        String hostedZoneName();

        String hostedZoneId();

        String certificateArn();

        String apiGatewayUrl();

        static ImmutableEdgeStackProps.Builder builder() {
            return ImmutableEdgeStackProps.builder();
        }
    }

    public EdgeStack(final Construct scope, final String id, final EdgeStackProps props) {
        this(scope, id, null, props);
    }

    public EdgeStack(final Construct scope, final String id, final StackProps stackProps, final EdgeStackProps props) {
        super(
                scope,
                id,
                StackProps.builder()
                        .env(props.getEnv()) // enforce region from props
                        .description(stackProps != null ? stackProps.getDescription() : null)
                        .stackName(stackProps != null ? stackProps.getStackName() : null)
                        .terminationProtection(stackProps != null ? stackProps.getTerminationProtection() : null)
                        .analyticsReporting(stackProps != null ? stackProps.getAnalyticsReporting() : null)
                        .synthesizer(stackProps != null ? stackProps.getSynthesizer() : null)
                        .crossRegionReferences(stackProps != null ? stackProps.getCrossRegionReferences() : null)
                        .build());

        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Hosted zone (must exist)
        IHostedZone zone = HostedZone.fromHostedZoneAttributes(
                this,
                props.resourceNamePrefix() + "-Zone",
                HostedZoneAttributes.builder()
                        .hostedZoneId(props.hostedZoneId())
                        .zoneName(props.hostedZoneName())
                        .build());
        String recordName = props.hostedZoneName().equals(props.sharedNames().deploymentDomainName)
                ? null
                : (props.sharedNames().deploymentDomainName.endsWith("." + props.hostedZoneName())
                        ? props.sharedNames()
                                .deploymentDomainName
                                .substring(
                                        0,
                                        props.sharedNames().deploymentDomainName.length()
                                                - (props.hostedZoneName().length() + 1))
                        : props.sharedNames().deploymentDomainName);

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert =
                Certificate.fromCertificateArn(this, props.resourceNamePrefix() + "-WebCert", props.certificateArn());

        // AWS WAF WebACL for CloudFront protection against common attacks and rate limiting
        CfnWebACL webAcl = CfnWebACL.Builder.create(this, props.resourceNamePrefix() + "-WebAcl")
                .name(props.resourceNamePrefix() + "-waf")
                .scope("CLOUDFRONT")
                .defaultAction(CfnWebACL.DefaultActionProperty.builder()
                        .allow(CfnWebACL.AllowActionProperty.builder().build())
                        .build())
                .rules(List.of(
                        // Rate limiting rule - 2000 requests per 5 minutes per IP
                        CfnWebACL.RuleProperty.builder()
                                .name("RateLimitRule")
                                .priority(1)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .rateBasedStatement(CfnWebACL.RateBasedStatementProperty.builder()
                                                .limit(2000L) // requests per 5 minutes
                                                .aggregateKeyType("IP")
                                                .build())
                                        .build())
                                .action(CfnWebACL.RuleActionProperty.builder()
                                        .block(CfnWebACL.BlockActionProperty.builder()
                                                .build())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("RateLimitRule")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for known bad inputs
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                .priority(2)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesKnownBadInputsRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesKnownBadInputsRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build(),
                        // AWS managed rule for common rule set (SQL injection, XSS, etc.)
                        CfnWebACL.RuleProperty.builder()
                                .name("AWSManagedRulesCommonRuleSet")
                                .priority(3)
                                .statement(CfnWebACL.StatementProperty.builder()
                                        .managedRuleGroupStatement(CfnWebACL.ManagedRuleGroupStatementProperty.builder()
                                                .name("AWSManagedRulesCommonRuleSet")
                                                .vendorName("AWS")
                                                .ruleActionOverrides(
                                                        List.of()) // Empty override list to prevent conflicts
                                                .build())
                                        .build())
                                .overrideAction(CfnWebACL.OverrideActionProperty.builder()
                                        .none(Map.of())
                                        .build())
                                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                                        .cloudWatchMetricsEnabled(true)
                                        .metricName("AWSManagedRulesCommonRuleSet")
                                        .sampledRequestsEnabled(true)
                                        .build())
                                .build()))
                .description(
                        "WAF WebACL for OIDC provider CloudFront distribution - provides rate limiting and protection against common attacks")
                .visibilityConfig(CfnWebACL.VisibilityConfigProperty.builder()
                        .cloudWatchMetricsEnabled(true)
                        .metricName(props.resourceNamePrefix() + "-waf")
                        .sampledRequestsEnabled(true)
                        .build())
                .build();

        // ============================================================================
        // WAF Security Alarms - Phase 1.2
        // ============================================================================
        // Note: These alarms are created in us-east-1 (CloudFront region). Alarm state
        // changes are forwarded to the eu-west-2 default event bus below, where OpsStack's
        // AlarmStateChangeRule picks them up and routes them to the Telegram forwarder.

        // Rate Limit Rule alarm - indicates potential DDoS or automated abuse
        Alarm rateLimitAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-RateLimitAlarm")
                .alarmName(props.resourceNamePrefix() + "-waf-rate-limit")
                .alarmDescription("WAF rate limiting triggered (50+ blocks in 5min) - possible DDoS or automated abuse")
                .metric(Metric.Builder.create()
                        .namespace("AWS/WAFV2")
                        .metricName("BlockedRequests")
                        .dimensionsMap(Map.of(
                                "WebACL", props.resourceNamePrefix() + "-waf",
                                "Region", "Global",
                                "Rule", "RateLimitRule"))
                        .statistic("Sum")
                        .period(software.amazon.awscdk.Duration.minutes(5))
                        .build())
                .threshold(50)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Common Rule Set alarm - SQL injection, XSS attacks
        Alarm commonRuleAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-CommonRuleAlarm")
                .alarmName(props.resourceNamePrefix() + "-waf-attack-signatures")
                .alarmDescription(
                        "WAF detected attack patterns (SQLi/XSS) - 5+ blocks in 5min - review sampled requests")
                .metric(Metric.Builder.create()
                        .namespace("AWS/WAFV2")
                        .metricName("BlockedRequests")
                        .dimensionsMap(Map.of(
                                "WebACL", props.resourceNamePrefix() + "-waf",
                                "Region", "Global",
                                "Rule", "AWSManagedRulesCommonRuleSet"))
                        .statistic("Sum")
                        .period(software.amazon.awscdk.Duration.minutes(5))
                        .build())
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // Known Bad Inputs alarm
        Alarm badInputsAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-BadInputsAlarm")
                .alarmName(props.resourceNamePrefix() + "-waf-known-bad-inputs")
                .alarmDescription("WAF blocked known bad inputs (5+ in 5min) - review sampled requests in WAF console")
                .metric(Metric.Builder.create()
                        .namespace("AWS/WAFV2")
                        .metricName("BlockedRequests")
                        .dimensionsMap(Map.of(
                                "WebACL", props.resourceNamePrefix() + "-waf",
                                "Region", "Global",
                                "Rule", "AWSManagedRulesKnownBadInputsRuleSet"))
                        .statistic("Sum")
                        .period(software.amazon.awscdk.Duration.minutes(5))
                        .build())
                .threshold(5)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        infof("Created WAF security alarms: rate-limit, attack-signatures, known-bad-inputs");

        // Certificate expiry alarm - ACM auto-renews but gives no warning if renewal fails.
        // The cert lives in us-east-1 (required for CloudFront), so this alarm does too; its
        // state changes are picked up by the WafAlarmForwardRule below like the WAF alarms.
        Alarm certExpiryAlarm = Alarm.Builder.create(this, props.resourceNamePrefix() + "-CertExpiryAlarm")
                .alarmName(props.resourceNamePrefix() + "-cert-expiring")
                .alarmDescription("ACM certificate expires within 30 days")
                .metric(Metric.Builder.create()
                        .namespace("AWS/CertificateManager")
                        .metricName("DaysToExpiry")
                        .dimensionsMap(Map.of("CertificateArn", cert.getCertificateArn()))
                        .statistic("Minimum")
                        .period(software.amazon.awscdk.Duration.days(1))
                        .build())
                .threshold(30)
                .evaluationPeriods(1)
                .comparisonOperator(ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD)
                .treatMissingData(TreatMissingData.NOT_BREACHING)
                .build();

        // ============================================================================
        // Cross-Region Alarm Forwarding to OpsStack (eu-west-2)
        // ============================================================================
        // CloudWatch alarm state-change events are regional, so the WAF alarms above
        // (us-east-1, required for CloudFront) never reach OpsStack's AlarmStateChangeRule
        // (eu-west-2 default bus). This rule forwards them across the account's default
        // event bus in eu-west-2, where that existing rule forwards to the Telegram Lambda.
        // The targets.EventBus construct creates the IAM role EventBridge needs to put
        // events onto the cross-region bus.
        IEventBus opsDefaultBus = EventBus.fromEventBusArn(
                this,
                props.resourceNamePrefix() + "-OpsDefaultBus",
                "arn:aws:events:eu-west-2:" + this.getAccount() + ":event-bus/default");

        Rule.Builder.create(this, props.resourceNamePrefix() + "-WafAlarmForwardRule")
                .ruleName(props.resourceNamePrefix() + "-waf-alarm-forward")
                .description(
                        "Forward CloudWatch alarm state changes to the eu-west-2 default event bus for Telegram alerting")
                .eventPattern(EventPattern.builder()
                        .source(List.of("aws.cloudwatch"))
                        .detailType(List.of("CloudWatch Alarm State Change"))
                        .build())
                .targets(List.of(new software.amazon.awscdk.services.events.targets.EventBus(opsDefaultBus)))
                .build();

        infof("Created cross-region rule forwarding WAF alarm state changes to eu-west-2 default bus");

        // Create the origin bucket — GENERATE_IF_NEEDED produces a unique-per-stack physical name
        // that CDK can resolve cross-environment (SelfDestructStack is in eu-west-2, EdgeStack is us-east-1)
        this.originBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-OriginBucket")
                .bucketName(PhysicalName.GENERATE_IF_NEEDED)
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                // .autoDeleteObjects(true)
                .build();
        infof("Created origin bucket %s", this.originBucket.getNode().getId());

        this.originBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCloudFrontReadViaOAC")
                .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
                .actions(List.of("s3:GetObject"))
                .resources(List.of(this.originBucket.getBucketArn() + "/*"))
                .conditions(Map.of(
                        // Limit to distributions in your account (no distribution ARN token needed)
                        "StringEquals", Map.of("AWS:SourceAccount", this.getAccount()),
                        "ArnLike",
                                Map.of(
                                        "AWS:SourceArn",
                                        "arn:aws:cloudfront::" + this.getAccount() + ":distribution/*")))
                .build());

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(this, "MyOAC")
                .signing(Signing.SIGV4_ALWAYS) // NEVER // SIGV4_NO_OVERRIDE
                .build();
        // CloudFront standard logging bucket. History cannot be backfilled, so this needs to be
        // on before there is traffic worth analyzing, even though nothing consumes the logs yet.
        // The bucket itself lives in AnalyticsStack (env-scoped, see CloudFrontAccessLogs) so log
        // history survives every redeploy of this app stack; this stack only imports it by name
        // and writes under its own deployment-scoped prefix.
        IBucket cloudFrontLogsBucket = Bucket.fromBucketName(
                this,
                props.resourceNamePrefix() + "-CfLogsBucket",
                CloudFrontAccessLogs.bucketName(props.sharedNames().envResourceNamePrefix, this.getAccount()));

        IOrigin localOrigin = S3BucketOrigin.withOriginAccessControl(
                this.originBucket,
                S3BucketOriginWithOACProps.builder().originAccessControl(oac).build());
        // infof("Created BucketOrigin with bucket: %s", this.originBucket.getBucketName());

        // Define a custom Response Headers Policy with CSP that allows AWS RUM client + dataplane
        ResponseHeadersPolicy webResponseHeadersPolicy = ResponseHeadersPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-WHP")
                .responseHeadersPolicyName(props.resourceNamePrefix() + "-whp")
                .comment("CORS + security headers with CSP allowing CloudWatch RUM client & dataplane")
                .corsBehavior(ResponseHeadersCorsBehavior.builder()
                        .accessControlAllowCredentials(false)
                        .accessControlAllowHeaders(List.of("*"))
                        .accessControlAllowMethods(List.of("GET", "HEAD", "OPTIONS"))
                        .accessControlAllowOrigins(List.of("*"))
                        .accessControlExposeHeaders(List.of())
                        .accessControlMaxAge(software.amazon.awscdk.Duration.seconds(600))
                        .originOverride(true)
                        .build())
                .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
                        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
                                .contentSecurityPolicy("default-src 'self'; "
                                        + "script-src 'self' 'unsafe-inline' https://client.rum.us-east-1.amazonaws.com https://www.googletagmanager.com; "
                                        + "connect-src 'self' https://dataplane.rum.eu-west-2.amazonaws.com https://cognito-identity.eu-west-2.amazonaws.com https://sts.eu-west-2.amazonaws.com https://*.google-analytics.com https://www.googletagmanager.com; "
                                        + "img-src 'self' data: https://avatars.githubusercontent.com https://www.google-analytics.com https://www.googletagmanager.com; "
                                        + "style-src 'self' 'unsafe-inline'; "
                                        + "frame-src 'self' https://"
                                        + props.sharedNames().simulatorDomainName + "; "
                                        + "frame-ancestors 'none'; "
                                        + "form-action 'self';")
                                .override(true)
                                .build())
                        .strictTransportSecurity(ResponseHeadersStrictTransportSecurity.builder()
                                .accessControlMaxAge(software.amazon.awscdk.Duration.days(365))
                                .includeSubdomains(true)
                                .override(true)
                                .build())
                        .contentTypeOptions(ResponseHeadersContentTypeOptions.builder()
                                .override(true)
                                .build())
                        .frameOptions(ResponseHeadersFrameOptions.builder()
                                .frameOption(HeadersFrameOption.DENY)
                                .override(true)
                                .build())
                        .referrerPolicy(ResponseHeadersReferrerPolicy.builder()
                                .referrerPolicy(
                                        software.amazon.awscdk.services.cloudfront.HeadersReferrerPolicy
                                                .STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                                .override(true)
                                .build())
                        .xssProtection(ResponseHeadersXSSProtection.builder()
                                .protection(true)
                                .modeBlock(true)
                                .override(true)
                                .build())
                        .build())
                // Custom headers for security policies not covered by securityHeadersBehavior
                .customHeadersBehavior(ResponseCustomHeadersBehavior.builder()
                        .customHeaders(List.of(
                                ResponseCustomHeader.builder()
                                        .header("Permissions-Policy")
                                        .value("camera=(), microphone=(), geolocation=()")
                                        .override(true)
                                        .build(),
                                ResponseCustomHeader.builder()
                                        .header("Cross-Origin-Opener-Policy")
                                        .value("same-origin")
                                        .override(true)
                                        .build(),
                                ResponseCustomHeader.builder()
                                        .header("Cross-Origin-Embedder-Policy")
                                        // Security scanner please leave
                                        .value("unsafe-none")
                                        // Necessary for the simulator iframe to load
                                        .override(true)
                                        .build(),
                                ResponseCustomHeader.builder()
                                        .header("Cross-Origin-Resource-Policy")
                                        .value("same-origin")
                                        .override(true)
                                        .build(),
                                ResponseCustomHeader.builder()
                                        .header("Server")
                                        .value("DIY-Accounting")
                                        .override(true)
                                        .build()))
                        .build())
                .build();

        // Custom error pages are served as static files via CloudFront error responses
        // This replaces Lambda@Edge which has problematic deletion behavior in CI/CD
        // API routes (/api/*) return JSON errors - CloudFront error responses only apply to S3 origin errors
        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
                .origin(localOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(webResponseHeadersPolicy)
                .compress(true)
                .build();

        // Create a custom cache policy for test reports and docs with short TTL
        CachePolicy testsAndDocsCachePolicy = CachePolicy.Builder.create(this, props.resourceNamePrefix() + "-TestsCP")
                .cachePolicyName(props.resourceNamePrefix() + "-tests-cp")
                .comment("Short TTL cache policy for test reports and results")
                .minTtl(software.amazon.awscdk.Duration.seconds(0))
                .defaultTtl(software.amazon.awscdk.Duration.seconds(60))
                .maxTtl(software.amazon.awscdk.Duration.seconds(300))
                .build();

        // Behaviour options for /tests/* and /docs/* paths with short TTL
        BehaviorOptions testsAndDocsBehaviorOptions = BehaviorOptions.builder()
                .origin(localOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(webResponseHeadersPolicy)
                .cachePolicy(testsAndDocsCachePolicy)
                .compress(true)
                .build();

        // Create a custom OriginRequestPolicy for API Gateway that forwards HMRC fraud prevention headers
        // These Gov-Client-* headers are sent by the browser and must reach the Lambda functions
        // Note: CloudFront limits custom OriginRequestPolicy to 10 headers maximum
        OriginRequestPolicy fraudPreventionHeadersPolicy = OriginRequestPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-FraudPreventionORP")
                .originRequestPolicyName(props.resourceNamePrefix() + "-fraud-prevention-orp")
                .comment(
                        "Origin request policy that forwards HMRC fraud prevention headers (Gov-Client-*) to API Gateway")
                // Forward ALL viewer headers plus CloudFront-Viewer-Address (contains client ip:port)
                // needed for Gov-Client-Public-Port HMRC fraud prevention header.
                // all() forwards ALL viewer headers including Host. API Gateway HTTP API v2
                // routes by path, not Host, so this should be safe. If 403 errors occur,
                // fall back to denyList("Host") and use API Gateway custom domain instead
                // (see PLAN_HMRC_FRAUD_PREVENTION_HEADERS.md Approach 3).
                .headerBehavior(OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address"))
                .queryStringBehavior(OriginRequestQueryStringBehavior.all())
                // Forward all cookies to support authentication
                .cookieBehavior(OriginRequestCookieBehavior.all())
                .build();

        // Create additional behaviours for the API Gateway Lambda origins
        HashMap<String, BehaviorOptions> additionalBehaviors = new HashMap<String, BehaviorOptions>();
        BehaviorOptions apiGatewayBehavior = createBehaviorOptionsForApiGateway(
                props.apiGatewayUrl(), webResponseHeadersPolicy, fraudPreventionHeadersPolicy);
        additionalBehaviors.put("/api/v1/*", apiGatewayBehavior);
        infof("Added API Gateway behavior for /api/v1/* pointing to %s", props.apiGatewayUrl());

        // Add behaviour for /tests/* and /docs/* with short TTL cache policy
        additionalBehaviors.put("/tests/*", testsAndDocsBehaviorOptions);
        infof("Added /tests/* behavior with short TTL cache policy");
        additionalBehaviors.put("/docs/*", testsAndDocsBehaviorOptions);
        infof("Added /docs/* behavior with short TTL cache policy");

        // CloudFront distribution for the web origin and all the URL Lambdas.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-WebDist")
                .defaultBehavior(localBehaviorOptions) // props.webBehaviorOptions)
                .additionalBehaviors(additionalBehaviors)
                // Use only the deployment-scoped domain to avoid alias conflicts with existing distributions
                .domainNames(List.of(props.sharedNames().deploymentDomainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(true)
                .logBucket(cloudFrontLogsBucket)
                .logFilePrefix("cf-standard-logs/" + props.deploymentName() + "/")
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .webAclId(webAcl.getAttrArn())
                // IMPORTANT: Do NOT configure errorResponses here!
                // CloudFront error responses apply GLOBALLY to ALL origins (S3 AND API Gateway).
                // This breaks API routes which must return JSON errors, not HTML error pages.
                // For static content (S3), accept default CloudFront error behavior.
                // For API routes (/api/*), Lambda functions return proper JSON error responses.
                .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().deploymentDomainName);

        // 2. Compute the CloudFront distribution ARN for the delivery source
        String distributionArn = Stack.of(this)
                .formatArn(ArnComponents.builder()
                        .service("cloudfront")
                        .region("") // CloudFront is global
                        .resource("distribution")
                        .resourceName(this.distribution.getDistributionId())
                        .build());

        // CloudFront access logs, v2 delivery: lands Parquet directly in the shared analytics
        // lake so Athena can query it without a crawler, complementing the classic logBucket()
        // output above. This is set up here rather than in AnalyticsStack because only this app
        // stack knows this deployment's distribution ARN; the lake bucket's resource policy
        // (granted in CloudFrontAccessLogs) accepts writes from every deployment's distribution,
        // and the Glue table's injected distribution_id partition tells them apart.
        IBucket analyticsLakeBucket = Bucket.fromBucketName(
                this,
                props.resourceNamePrefix() + "-AnalyticsLakeBucketRef",
                props.sharedNames().analyticsLakeBucketName);

        CfnDeliveryDestination cfAccessLogsDestination = new CfnDeliveryDestination(
                this,
                props.resourceNamePrefix() + "-CfAccessLogsDestination",
                CfnDeliveryDestinationProps.builder()
                        .name(props.resourceNamePrefix() + "-cf-access-logs-dest")
                        .deliveryDestinationType("S3")
                        // A bare bucket ARN makes the service prepend AWSLogs/<account>/CloudFront/ to
                        // every key; the prefix on the ARN keeps the objects under the lake's own path.
                        .destinationResourceArn(analyticsLakeBucket.getBucketArn() + "/raw/cloudfront")
                        .outputFormat("parquet")
                        .build());

        String cfAccessLogsSourceName = props.resourceNamePrefix() + "-cf-access-logs-src";
        CfnDeliverySource cfAccessLogsSource = new CfnDeliverySource(
                this,
                props.resourceNamePrefix() + "-CfAccessLogsSource",
                CfnDeliverySourceProps.builder()
                        .name(cfAccessLogsSourceName)
                        .logType("ACCESS_LOGS") // required for CloudFront
                        .resourceArn(distributionArn)
                        .build());

        CfnDelivery cfAccessLogsDelivery = new CfnDelivery(
                this,
                props.resourceNamePrefix() + "-CfAccessLogsDelivery",
                CfnDeliveryProps.builder()
                        // *** must exactly match the Name above ***
                        .deliverySourceName(cfAccessLogsSourceName)
                        .deliveryDestinationArn(cfAccessLogsDestination.getAttrArn())
                        // Only the service's own variables are valid here; with the Hive option on it renders
                        // them as distributionid=.../year=.../month=.../day=... itself.
                        .s3SuffixPath("{distributionid}/{yyyy}/{MM}/{dd}/")
                        .s3EnableHiveCompatiblePath(true)
                        .build());
        // *** enforce creation order so source exists before delivery ***
        cfAccessLogsDelivery.addResourceDependency(cfAccessLogsSource);

        // Grant CloudFront access to the origin lambdas
        this.distributionInvokeFnUrl = Permission.builder()
                .principal(new ServicePrincipal("cloudfront.amazonaws.com"))
                .action("lambda:InvokeFunctionUrl")
                .functionUrlAuthType(FunctionUrlAuthType.NONE)
                .sourceArn(this.distribution.getDistributionArn())
                .build();

        // Idempotent UPSERT of Route53 A/AAAA alias to CloudFront (replaces deprecated deleteExisting)
        co.uk.diyaccounting.submit.utils.Route53AliasUpsert.upsertAliasToCloudFront(
                this, "AliasRecord", zone, recordName, this.distribution.getDomainName());
        // Capture the FQDN for outputs
        this.aliasRecordDomainName = (recordName == null || recordName.isBlank())
                ? zone.getZoneName()
                : (recordName + "." + zone.getZoneName());
        this.aliasRecordV6DomainName = this.aliasRecordDomainName;

        // Outputs
        cfnOutput(this, "BaseUrl", props.sharedNames().baseUrl);
        cfnOutput(this, "CertificateArn", cert.getCertificateArn());
        cfnOutput(this, "WebAclId", webAcl.getAttrArn());
        cfnOutput(this, "WebDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "DistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "AliasRecord", this.aliasRecordDomainName);
        cfnOutput(this, "AliasRecordV6", this.aliasRecordV6DomainName);
        cfnOutput(this, "OriginBucketName", this.originBucket.getBucketName());
        cfnOutput(this, "WafRateLimitAlarmArn", rateLimitAlarm.getAlarmArn());
        cfnOutput(this, "WafAttackSignaturesAlarmArn", commonRuleAlarm.getAlarmArn());
        cfnOutput(this, "WafBadInputsAlarmArn", badInputsAlarm.getAlarmArn());
        cfnOutput(this, "CertExpiryAlarmArn", certExpiryAlarm.getAlarmArn());
        cfnOutput(this, "CloudFrontLogsBucketName", cloudFrontLogsBucket.getBucketName());

        infof("EdgeStack %s created successfully for %s", this.getNode().getId(), props.sharedNames().baseUrl);
    }

    public BehaviorOptions createBehaviorOptionsForApiGateway(
            String apiGatewayUrl,
            ResponseHeadersPolicy responseHeadersPolicy,
            OriginRequestPolicy originRequestPolicy) {
        // Extract the host from the API Gateway URL (e.g., "https://abc123.execute-api.us-east-1.amazonaws.com/" ->
        // "abc123.execute-api.us-east-1.amazonaws.com")
        var apiGatewayHost = getHostFromUrl(apiGatewayUrl);
        var origin = HttpOrigin.Builder.create(apiGatewayHost)
                .protocolPolicy(OriginProtocolPolicy.HTTPS_ONLY)
                .build();
        return BehaviorOptions.builder()
                .origin(origin)
                .allowedMethods(AllowedMethods.ALLOW_ALL)
                .cachePolicy(CachePolicy.CACHING_DISABLED)
                .originRequestPolicy(originRequestPolicy)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(responseHeadersPolicy)
                .build();
    }

    private String getHostFromUrl(String url) {
        // Extract host from URL (e.g., "https://example.com/path" -> "example.com")
        if (url.startsWith("https://")) {
            String withoutProtocol = url.substring(8);
            int slashIndex = withoutProtocol.indexOf('/');
            if (slashIndex > 0) {
                return withoutProtocol.substring(0, slashIndex);
            }
            return withoutProtocol;
        }
        return url; // fallback if format unexpected
    }
}
