/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.Kind.warnf;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.AssetHashType;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Expiration;
import software.amazon.awscdk.Size;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.cloudfront.DistributionAttributes;
import software.amazon.awscdk.services.cloudfront.IDistribution;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.amazon.awscdk.services.s3.deployment.BucketDeployment;
import software.amazon.awscdk.services.s3.deployment.Source;
import software.constructs.Construct;

public class PublishStack extends Stack {

    public final BucketDeployment webDeployment;

    @Value.Immutable
    public interface PublishStackProps extends StackProps, SubmitStackProps {

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

        String distributionId();

        String originBucketName();

        String commitHash();

        String websiteHash();

        String buildNumber();

        String docRootPath();

        static ImmutablePublishStackProps.Builder builder() {
            return ImmutablePublishStackProps.builder();
        }
    }

    public PublishStack(final Construct scope, final String id, final PublishStackProps props) {
        this(scope, id, null, props);
    }

    public PublishStack(
            final Construct scope, final String id, final StackProps stackProps, final PublishStackProps props) {
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

        // Apply cost allocation tags for all resources in this stack
        Tags.of(this).add("Environment", props.envName());
        Tags.of(this).add("Application", "submit");
        Tags.of(this).add("CostCenter", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Owner", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("Project", "@support-at-diyaccounting/submit.diyaccounting.co.uk");
        Tags.of(this).add("DeploymentName", props.deploymentName());
        Tags.of(this).add("Stack", "PublishStack");
        Tags.of(this).add("ManagedBy", "aws-cdk");

        // Enhanced cost optimization tags
        Tags.of(this).add("BillingPurpose", "authentication-infrastructure");
        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        // Use Resources from the passed props

        DistributionAttributes distributionAttributes = DistributionAttributes.builder()
                .domainName(props.sharedNames().deploymentDomainName)
                .distributionId(props.distributionId())
                .build();
        IDistribution distribution = Distribution.fromDistributionAttributes(
                this, props.resourceNamePrefix() + "-ImportedWebDist", distributionAttributes);

        IBucket originBucket =
                Bucket.fromBucketName(this, props.resourceNamePrefix() + "-WebBucket", props.originBucketName());

        // Generate submit.version.txt file with commit hash if provided
        if (props.commitHash() != null && !props.commitHash().isBlank()) {
            try {
                Path versionFilepath = Paths.get(props.docRootPath(), "submit.version.txt");
                Files.writeString(versionFilepath, props.commitHash().trim());
                infof("Created submit.version.txt file with commit hash: %s".formatted(props.commitHash()));
            } catch (Exception e) {
                warnf("Failed to create submit.version.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No commit hash provided, skipping submit.version.txt generation");
        }

        // Generate a file containing a hash of the website files for deployment optimization
        if (props.websiteHash() != null && !props.websiteHash().isBlank()) {
            try {
                Path hashFilepath = Paths.get(props.docRootPath(), "submit.commit-hash.txt");
                Files.writeString(hashFilepath, props.websiteHash().trim());
                infof("Created submit.commit-hash.txt file with website hash: %s".formatted(props.websiteHash()));
            } catch (Exception e) {
                warnf("Failed to create submit.commit-hash.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No website hash provided, skipping submit.commit-hash.txt generation");
        }

        // Generate a file containing the environment name for runtime use
        if (props.envName() != null && !props.envName().isBlank()) {
            try {
                Path envFilepath = Paths.get(props.docRootPath(), "submit.environment-name.txt");
                Files.writeString(envFilepath, props.envName().trim());
                infof("Created submit.environment-name.txt file with environment name: %s".formatted(props.envName()));
            } catch (Exception e) {
                warnf("Failed to create submit.environment-name.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No environment name provided, skipping submit.environment-name.txt generation");
        }

        // Generate a file containing the deployment name for runtime use
        if (props.envName() != null && !props.envName().isBlank()) {
            try {
                Path envFilepath = Paths.get(props.docRootPath(), "submit.deployment-name.txt");
                Files.writeString(envFilepath, props.deploymentName().trim());
                infof("Created submit.deployment-name.txt file with deployment name: %s"
                        .formatted(props.deploymentName()));
            } catch (Exception e) {
                warnf("Failed to create submit.deployment-name.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No environment name provided, skipping submit.deployment-name.txt generation");
        }

        // Generate a file containing the build number for runtime use
        if (props.buildNumber() != null && !props.buildNumber().isBlank()) {
            try {
                Path buildNumberFilepath = Paths.get(props.docRootPath(), "submit.build-number.txt");
                Files.writeString(buildNumberFilepath, props.buildNumber().trim());
                infof("Created submit.build-number.txt file with build number: %s".formatted(props.buildNumber()));
            } catch (Exception e) {
                warnf("Failed to create submit.build-number.txt file: %s".formatted(e.getMessage()));
            }
        } else {
            infof("No build number provided, skipping submit.build-number.txt generation");
        }

        // Lookup Log Group for web deployment
        // ILogGroup webDeploymentLogGroup = LogGroup.fromLogGroupArn(
        //        this,
        //        props.resourceNamePrefix() + "-ImportedWebDeploymentLogGroup",
        //        "arn:aws:logs:%s:%s:log-group:%s"
        //                .formatted(
        //                        Objects.requireNonNull(props.getEnv()).getRegion(),
        //                        props.getEnv().getAccount(),
        //                        props.sharedNames().webDeploymentLogGroupName));

        // Deploy the web website files to the web website bucket and invalidate distribution
        // Resolve the document root path from props to avoid path mismatches between generation and deployment
        var publicDir = Paths.get(props.docRootPath()).toAbsolutePath().normalize();
        infof("Using public doc root: %s".formatted(publicDir));
        var webDocRootSource = Source.asset(
                publicDir.toString(),
                AssetOptions.builder()
                        .assetHashType(AssetHashType.SOURCE)
                        // Exclude local-only auth files from S3 deployment
                        .exclude(List.of(
                                "auth/loginWithMockCallback.html",
                                "auth/login-mock-addon.js",
                                "auth/login-native-addon.js"))
                        .build());
        this.webDeployment = BucketDeployment.Builder.create(
                        this, props.resourceNamePrefix() + "-DocRootToWebOriginDeployment")
                .sources(List.of(webDocRootSource))
                .destinationBucket(originBucket)
                .distribution(distribution)
                .distributionPaths(List.of(
                        "/activities/*",
                        "/auth/*",
                        "/docs/*",
                        "/errors/*",
                        "/hmrc/*",
                        "/images/*",
                        "/lib/*",
                        "/prefetch/*",
                        "/tests/*",
                        "/widgets/*",
                        "/about.html",
                        "/accessibility.html",
                        "/bundles.html",
                        "/faqs.toml",
                        "/guide.html",
                        "/help.html",
                        "/mcp.html",
                        "/diy-accounting-spreadsheets.html",
                        "/diy-accounting-limited.html",
                        "/spreadsheets.html",
                        "/android-chrome-192.png",
                        "/android-chrome-512.png",
                        "/apple-touch-icon.png",
                        "/favicon.ico",
                        "/favicon.svg",
                        "/favicon-16.png",
                        "/favicon-32.png",
                        "/index.html",
                        "/privacy.html",
                        "/submit.catalogue.toml",
                        "/submit.build-number.txt",
                        "/submit.commit-hash.txt",
                        "/submit.css",
                        "/submit.deployment-name.txt",
                        "/submit.env",
                        "/submit.environment-name.txt",
                        "/submit.js",
                        "/submit.version.txt",
                        "/terms.html",
                        "/.well-known/security.txt",
                        "/site.webmanifest",
                        "/simulator.html",
                        "/developer-mode.js"))
                .retainOnDelete(true)
                // .logGroup(webDeploymentLogGroup)
                .logRetention(RetentionDays.ONE_DAY)
                .expires(Expiration.after(Duration.minutes(5)))
                .prune(false)
                .memoryLimit(1024)
                .ephemeralStorageSize(Size.gibibytes(2))
                .build();

        // Outputs
        cfnOutput(this, "BaseUrl", props.sharedNames().baseUrl);

        infof("PublishStack %s created successfully for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
