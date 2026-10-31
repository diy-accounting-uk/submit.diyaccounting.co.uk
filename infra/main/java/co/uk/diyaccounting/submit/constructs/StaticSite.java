/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.certificatemanager.Certificate;
import software.amazon.awscdk.services.cloudfront.AllowedMethods;
import software.amazon.awscdk.services.cloudfront.BehaviorOptions;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.HeadersFrameOption;
import software.amazon.awscdk.services.cloudfront.HeadersReferrerPolicy;
import software.amazon.awscdk.services.cloudfront.OriginRequestPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentSecurityPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersContentTypeOptions;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersFrameOptions;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersReferrerPolicy;
import software.amazon.awscdk.services.cloudfront.ResponseHeadersStrictTransportSecurity;
import software.amazon.awscdk.services.cloudfront.ResponseSecurityHeadersBehavior;
import software.amazon.awscdk.services.cloudfront.S3OriginAccessControl;
import software.amazon.awscdk.services.cloudfront.SSLMethod;
import software.amazon.awscdk.services.cloudfront.Signing;
import software.amazon.awscdk.services.cloudfront.ViewerProtocolPolicy;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOrigin;
import software.amazon.awscdk.services.cloudfront.origins.S3BucketOriginWithOACProps;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

/**
 * A static site: a private S3 bucket behind one CloudFront distribution that serves one directory
 * of files over the given host names. The DNS records for the host names live in the root
 * account, so this construct writes none; it publishes the distribution domain name for them.
 */
public class StaticSite extends Construct {

    public final Bucket bucket;
    public final Distribution distribution;
    public final BucketDeployment deployment;

    @Value.Immutable
    public interface StaticSiteProps {
        /** Short site name used in resource names, for example {@code developer}. */
        String siteName();

        /** Host names the distribution answers to; the certificate must cover every one. */
        List<String> domainNames();

        /** ACM certificate in us-east-1 covering every host name. */
        String certificateArn();

        /** Directory holding the site files. */
        String docRootPath();

        /** Key prefixes other processes publish into the bucket, which a deployment must not prune. */
        @Value.Default
        default List<String> unmanagedPrefixes() {
            return List.of();
        }

        static ImmutableStaticSiteProps.Builder builder() {
            return ImmutableStaticSiteProps.builder();
        }
    }

    public StaticSite(final Construct scope, final String id, final StaticSiteProps props) {
        super(scope, id);

        var cert = Certificate.fromCertificateArn(this, "Cert", props.certificateArn());

        // No explicit bucket name: bucket names are global, so each account gets a generated one.
        this.bucket = Bucket.Builder.create(this, "OriginBucket")
                .versioned(false)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .encryption(BucketEncryption.S3_MANAGED)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .build();

        var stack = Stack.of(this);
        this.bucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCloudFrontReadViaOAC")
                .principals(List.of(new ServicePrincipal("cloudfront.amazonaws.com")))
                .actions(List.of("s3:GetObject"))
                .resources(List.of(this.bucket.getBucketArn() + "/*"))
                .conditions(Map.of(
                        "StringEquals",
                        Map.of("AWS:SourceAccount", stack.getAccount()),
                        "ArnLike",
                        Map.of("AWS:SourceArn", "arn:aws:cloudfront::" + stack.getAccount() + ":distribution/*")))
                .build());

        S3OriginAccessControl oac = S3OriginAccessControl.Builder.create(this, "OAC")
                .signing(Signing.SIGV4_ALWAYS)
                .build();

        // The site is static files from its own origin; a Playwright report under reports/ loads
        // only its own scripts and styles too, so the policy needs nothing from elsewhere.
        ResponseHeadersPolicy headersPolicy = ResponseHeadersPolicy.Builder.create(this, "HeadersPolicy")
                .comment("Security headers for the " + props.siteName() + " static site")
                .securityHeadersBehavior(ResponseSecurityHeadersBehavior.builder()
                        .contentSecurityPolicy(ResponseHeadersContentSecurityPolicy.builder()
                                .contentSecurityPolicy("default-src 'self'; "
                                        + "script-src 'self' 'unsafe-inline'; "
                                        + "style-src 'self' 'unsafe-inline'; "
                                        + "img-src 'self' data: blob:; "
                                        + "media-src 'self' blob:; "
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
                        .build())
                .build();

        this.distribution = Distribution.Builder.create(this, "Distribution")
                .defaultBehavior(BehaviorOptions.builder()
                        .origin(S3BucketOrigin.withOriginAccessControl(
                                this.bucket,
                                S3BucketOriginWithOACProps.builder()
                                        .originAccessControl(oac)
                                        .build()))
                        .allowedMethods(AllowedMethods.ALLOW_GET_HEAD_OPTIONS)
                        .originRequestPolicy(OriginRequestPolicy.CORS_S3_ORIGIN)
                        .viewerProtocolPolicy(ViewerProtocolPolicy.REDIRECT_TO_HTTPS)
                        .responseHeadersPolicy(headersPolicy)
                        .compress(true)
                        .build())
                .domainNames(props.domainNames())
                .certificate(cert)
                .defaultRootObject("index.html")
                .enableLogging(false)
                .enableIpv6(true)
                .sslSupportMethod(SSLMethod.SNI)
                .build();

        var docRoot = Paths.get(props.docRootPath()).toAbsolutePath().normalize();
        var deploymentLogGroup = ensureLogGroupWithDependency(
                        stack,
                        id + "DeploymentLogGroup",
                        "/aws/lambda/" + stack.getNode().getId() + "-" + props.siteName() + "-deployment")
                .logGroup();
        this.deployment = BucketDeployment.Builder.create(this, "Deployment")
                .sources(List.of(Source.asset(
                        docRoot.toString(),
                        AssetOptions.builder()
                                .assetHashType(AssetHashType.SOURCE)
                                .build())))
                .destinationBucket(this.bucket)
                .distribution(this.distribution)
                .distributionPaths(List.of("/*"))
                .exclude(props.unmanagedPrefixes().stream().map(p -> p + "*").toList())
                .retainOnDelete(false)
                .prune(true)
                .logGroup(deploymentLogGroup)
                .build();
    }
}
