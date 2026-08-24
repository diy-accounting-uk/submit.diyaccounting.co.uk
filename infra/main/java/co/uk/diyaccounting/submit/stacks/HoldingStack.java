/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.Route53AliasUpsert;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.ArnComponents;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.ErrorResponse;
import software.amazon.awscdk.services.cloudfront.HeadersFrameOption;
import software.amazon.awscdk.services.cloudfront.HeadersReferrerPolicy;
import software.amazon.awscdk.services.cloudfront.IOrigin;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeader;
import software.amazon.awscdk.services.cloudfront.ResponseCustomHeadersBehavior;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentSecurityPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentTypeOptions;
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
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.CfnDelivery;
import software.amazon.awscdk.services.logs.CfnDeliveryDestination;
import software.amazon.awscdk.services.logs.CfnDeliveryDestinationProps;
import software.amazon.awscdk.services.logs.CfnDeliveryProps;
import software.amazon.awscdk.services.logs.CfnDeliverySource;
import software.amazon.awscdk.services.logs.CfnDeliverySourceProps;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.amazon.awscdk.services.route53.HostedZone;
import software.amazon.awscdk.services.route53.HostedZoneAttributes;
import software.amazon.awscdk.services.route53.IHostedZone;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

/**
 * Serves the submit service holding page from its own CloudFront distribution, tagged
 * {@code OriginFor=<holding fqdn>} so a failover can find it and move the live aliases onto it.
 */
public class HoldingStack extends Stack {

    public final Bucket holdingBucket;
    public final Distribution distribution;
    public final String aliasRecordDomainName;
    public final BucketDeployment holdingDeployment;

    @Value.Immutable
    public interface HoldingStackProps extends StackProps, SubmitStackProps {
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

        String holdingDocRootPath();

        static ImmutableHoldingStackProps.Builder builder() {
            return ImmutableHoldingStackProps.builder();
        }
    }

    public HoldingStack(final Construct scope, final String id, final HoldingStackProps props) {
        super(scope, id, StackProps.builder().env(props.getEnv()).build());

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "@diy-accounting-uk/submit.diyaccounting.co.uk/cdk.json");
        Tags.of(this).add("CostCenter", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@diy-accounting-uk/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "HoldingStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "submit-holding-page");
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
        String recordName = props.hostedZoneName().equals(props.sharedNames().holdingDomainName)
                ? null
                : (props.sharedNames().holdingDomainName.endsWith("." + props.hostedZoneName())
                        ? props.sharedNames()
                                .holdingDomainName
                                .substring(
                                        0,
                                        props.sharedNames().holdingDomainName.length()
                                                - (props.hostedZoneName().length() + 1))
                        : props.sharedNames().holdingDomainName);

        // TLS certificate from existing ACM (must be in us-east-1 for CloudFront)
        var cert = Certificate.fromCertificateArn(
                this, props.resourceNamePrefix() + "-HoldingCert", props.certificateArn());

        // Create the origin bucket — no explicit bucketName so each account gets a unique name
        // (S3 bucket names are globally unique; hardcoding causes collisions during account migration)
        this.holdingBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-HoldingOriginBucket")
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .build();
        infof("Created holding origin bucket %s", this.holdingBucket.getNode().getId());

        this.holdingBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCloudFrontReadViaOAC")
                .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
                .actions(List.of("s3:GetObject"))
                .resources(List.of(this.holdingBucket.getBucketArn() + "/*"))
                .conditions(Map.of(
                        // Limit to distributions in your account (no distribution ARN token needed)
                        "StringEquals",
                        Map.of("AWS:SourceAccount", this.getAccount()),
                        "ArnLike",
                        Map.of("AWS:SourceArn", "arn:aws:cloudfront::" + this.getAccount() + ":distribution/*")))
                .build());

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(
                        this, props.resourceNamePrefix() + "-HoldingOAC")
                .signing(Signing.SIGV4_ALWAYS)
                .build();
        IOrigin localOrigin = S3BucketOrigin.withOriginAccessControl(
                this.holdingBucket,
                S3BucketOriginWithOACProps.builder().originAccessControl(oac).build());
        infof("Created BucketOrigin with bucket: %s", this.holdingBucket.getBucketName());

        // The holding page is one self-contained HTML file, so it needs nothing beyond its own origin
        ResponseHeadersPolicy holdingResponseHeadersPolicy = ResponseHeadersPolicy.Builder.create(
                        this, props.resourceNamePrefix() + "-HoldingHeadersPolicy")
                .responseHeadersPolicyName(props.resourceNamePrefix() + "-holding-whp")
                .comment("Security headers for the submit holding page")
                .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
                        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
                                .contentSecurityPolicy("default-src 'self'; "
                                        + "style-src 'self' 'unsafe-inline'; "
                                        + "img-src 'self' data:; "
                                        + "frame-ancestors 'none'; "
                                        + "form-action 'none';")
                                .override(true)
                                .build())
                        .strictTransportSecurity(ResponseHeadersStrictTransportSecurity.builder()
                                .accessControlMaxAge(Duration.days(365))
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
                                .referrerPolicy(HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                                .override(true)
                                .build())
                        .xssProtection(ResponseHeadersXSSProtection.builder()
                                .protection(true)
                                .modeBlock(true)
                                .override(true)
                                .build())
                        .build())
                .customHeadersBehavior(ResponseCustomHeadersBehavior.builder()
                        .customHeaders(List.of(ResponseCustomHeader.builder()
                                .header("Server")
                                .value("DIY-Accounting")
                                .override(true)
                                .build()))
                        .build())
                .build();

        BehaviorOptions localBehaviorOptions = BehaviorOptions.builder()
                .origin(localOrigin)
                .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                .responseHeadersPolicy(holdingResponseHeadersPolicy)
                .compress(true)
                .build();

        // Ensure distribution access log group exists (idempotent creation)
        ILogGroup distributionAccessLogGroup = ensureLogGroupWithDependency(
                        this,
                        props.resourceNamePrefix() + "-HoldingDistributionAccessLogGroup",
                        props.sharedNames().distributionAccessLogGroupName)
                .logGroup();

        // During a failover requests arrive on every path the live site ever published, so map the
        // origin's 403/404 back to the holding page rather than letting S3's XML errors through.
        this.distribution = Distribution.Builder.create(this, props.resourceNamePrefix() + "-HoldingDist")
                .defaultBehavior(localBehaviorOptions)
                .domainNames(List.of(props.sharedNames().holdingDomainName))
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(false) // legacy S3 logging off
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .errorResponses(List.of(
                        ErrorResponse.builder()
                                .httpStatus(403)
                                .responseHttpStatus(200)
                                .responsePagePath("/index.html")
                                .ttl(Duration.seconds(0))
                                .build(),
                        ErrorResponse.builder()
                                .httpStatus(404)
                                .responseHttpStatus(200)
                                .responsePagePath("/index.html")
                                .ttl(Duration.seconds(0))
                                .build()))
                .build();
        Tags.of(this.distribution).add("OriginFor", props.sharedNames().holdingDomainName);

        // Compute the CloudFront distribution ARN for the delivery source
        String distributionArn = Stack.of(this)
                .formatArn(ArnComponents.builder()
                        .service("cloudfront")
                        .region("") // CloudFront is global
                        .resource("distribution")
                        .resourceName(this.distribution.getDistributionId())
                        .build());

        // CloudWatch Logs destination that points at the distribution access log group
        CfnDeliveryDestination cfLogsDestination = new CfnDeliveryDestination(
                this,
                props.resourceNamePrefix() + "-HoldingCfAccessLogsDestination",
                CfnDeliveryDestinationProps.builder()
                        .name(props.sharedNames().distributionAccessLogDeliveryHoldingDestinationName)
                        .destinationResourceArn(distributionAccessLogGroup.getLogGroupArn())
                        .outputFormat("json")
                        .build());

        // Delivery source that represents the CloudFront distribution
        CfnDeliverySource cfLogsSource = new CfnDeliverySource(
                this,
                props.resourceNamePrefix() + "-HoldingCfAccessLogsSource",
                CfnDeliverySourceProps.builder()
                        .name(props.sharedNames().distributionAccessLogDeliveryHoldingSourceName)
                        .logType("ACCESS_LOGS") // required for CloudFront
                        .resourceArn(distributionArn)
                        .build());

        // Delivery that connects source to destination
        CfnDelivery cfLogsDelivery = new CfnDelivery(
                this,
                props.resourceNamePrefix() + "-HoldingCfAccessLogsDelivery",
                CfnDeliveryProps.builder()
                        // *** IMPORTANT: must exactly match the Name above ***
                        .deliverySourceName(props.sharedNames().distributionAccessLogDeliveryHoldingSourceName)
                        .deliveryDestinationArn(cfLogsDestination.getAttrArn())
                        .build());

        // *** CRITICAL: enforce creation order so source exists before delivery ***
        cfLogsDelivery.addDependency(cfLogsSource);

        // Idempotent UPSERT of Route53 A/AAAA alias to CloudFront
        Route53AliasUpsert.upsertAliasToCloudFront(
                this,
                props.resourceNamePrefix() + "-HoldingAliasRecord",
                zone,
                recordName,
                this.distribution.getDomainName());
        this.aliasRecordDomainName = (recordName == null || recordName.isBlank())
                ? zone.getZoneName()
                : (recordName + "." + zone.getZoneName());

        // Deploy the holding page to the holding bucket and invalidate the distribution
        var holdingDir = Paths.get(props.holdingDocRootPath()).toAbsolutePath().normalize();
        infof("Using holding doc root: %s".formatted(holdingDir));
        var holdingDocRootSource = Source.asset(
                holdingDir.toString(),
                AssetOptions.builder().assetHashType(AssetHashType.SOURCE).build());
        this.holdingDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix() + "-HoldingDeployment")
                .sources(List.of(holdingDocRootSource))
                .destinationBucket(this.holdingBucket)
                .distribution(distribution)
                .distributionPaths(List.of("/index.html"))
                .retainOnDelete(false)
                .prune(true)
                .build();

        // Outputs
        cfnOutput(this, "CertificateArn", cert.getCertificateArn());
        cfnOutput(this, "HoldingDistributionDomainName", this.distribution.getDomainName());
        cfnOutput(this, "DistributionId", this.distribution.getDistributionId());
        cfnOutput(this, "AliasRecord", this.aliasRecordDomainName);
        cfnOutput(this, "HoldingDomainName", props.sharedNames().holdingDomainName);

        infof(
                "HoldingStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().holdingDomainName);
    }
}
