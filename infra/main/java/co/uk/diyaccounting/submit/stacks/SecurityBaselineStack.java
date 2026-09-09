/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureAwsCustomResourceProviderLogGroup;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.config.CfnConfigurationRecorder;
import software.amazon.awscdk.services.config.CfnDeliveryChannel;
import software.amazon.awscdk.services.iam.CfnServiceLinkedRole;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

/**
 * Account-singleton compliance baseline: the AWS Config configuration recorder both Security Hub
 * standards subscriptions need, and the swap from the CIS AWS Foundations Benchmark v1.2.0
 * standard to v5.0.0. Security Hub itself (the {@code CfnHub} resource) is created in {@link
 * ObservabilityStack}; this stack only depends on it existing first, so its standards
 * subscriptions apply to the account-singleton Hub rather than creating a second one.
 *
 * <p>Only synthesized when {@code securityServicesEnabled} is true, the same account-singleton
 * gate {@code ObservabilityStack} uses for GuardDuty and Security Hub, since a Config recorder and
 * a standards subscription are both one-per-account-per-region resources.
 */
public class SecurityBaselineStack extends Stack {

    public CfnConfigurationRecorder configurationRecorder;
    public CfnDeliveryChannel deliveryChannel;
    public Bucket configBucket;

    @Value.Immutable
    public interface SecurityBaselineStackProps extends StackProps, SubmitStackProps {

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

        // Config recorder and Security Hub standards are one-per-account-per-region resources,
        // so only the primary environment in an account creates them (mirrors
        // ObservabilityStack.securityServicesEnabled).
        @Value.Default
        default boolean securityServicesEnabled() {
            return true;
        }

        static ImmutableSecurityBaselineStackProps.Builder builder() {
            return ImmutableSecurityBaselineStackProps.builder();
        }
    }

    public SecurityBaselineStack(final Construct scope, final String id, final SecurityBaselineStackProps props) {
        super(scope, id, props);

        if (!props.securityServicesEnabled()) {
            infof(
                    "SecurityBaselineStack %s: securityServicesEnabled is false, skipping Config recorder and Security Hub standards",
                    this.getNode().getId());
            return;
        }

        var prefix = props.resourceNamePrefix();

        // ============================================================================
        // AWS Config: service-linked role, recorder, delivery channel
        // ============================================================================
        // The service-linked role AWS Config assumes to read every supported resource type,
        // including the global ones (IAM, etc). Security Hub's Config.1 control needs this
        // recorder before its CIS and AWS Foundational Security Best Practices checks can move
        // past NO_AVAILABLE_CONFIGURATION_RECORDER.
        CfnServiceLinkedRole configServiceLinkedRole = CfnServiceLinkedRole.Builder.create(
                        this, prefix + "-ConfigServiceLinkedRole")
                .awsServiceName("config.amazonaws.com")
                .description("Lets AWS Config record this account's resource configurations")
                .build();
        String configRoleArn = "arn:aws:iam::%s:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig"
                .formatted(this.getAccount());

        // No explicit bucketName - S3 names are globally unique; hardcoding causes collisions
        // during account migration.
        this.configBucket = Bucket.Builder.create(this, prefix + "-ConfigBucket")
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(LifecycleRule.builder()
                        .id("ExpireConfigSnapshots")
                        .expiration(Duration.days(90))
                        .build()))
                .build();

        this.configBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AWSConfigBucketPermissionsCheck")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("config.amazonaws.com")))
                .actions(List.of("s3:GetBucketAcl"))
                .resources(List.of(this.configBucket.getBucketArn()))
                .conditions(Map.of("StringEquals", Map.of("AWS:SourceAccount", this.getAccount())))
                .build());
        this.configBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AWSConfigBucketExistenceCheck")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("config.amazonaws.com")))
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(this.configBucket.getBucketArn()))
                .conditions(Map.of("StringEquals", Map.of("AWS:SourceAccount", this.getAccount())))
                .build());
        this.configBucket.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AWSConfigBucketDelivery")
                .effect(Effect.ALLOW)
                .principals(List.of(new ServicePrincipal("config.amazonaws.com")))
                .actions(List.of("s3:PutObject"))
                .resources(List.of(this.configBucket.getBucketArn() + "/AWSLogs/" + this.getAccount() + "/Config/*"))
                .conditions(Map.of(
                        "StringEquals",
                        Map.of("s3:x-amz-acl", "bucket-owner-full-control", "AWS:SourceAccount", this.getAccount())))
                .build());

        // Records every supported resource type, including global ones (IAM, etc), rather than a
        // hand-maintained list: this account's resource count is modest (roughly 450 in prod, 150
        // in ci, from resourcegroupstaggingapi), so the per-item recording cost stays small, and a
        // narrowed list would need updating every time a new resource type matters to a Security
        // Hub control.
        this.configurationRecorder = CfnConfigurationRecorder.Builder.create(this, prefix + "-ConfigRecorder")
                .name(prefix + "-config-recorder")
                .roleArn(configRoleArn)
                .recordingGroup(CfnConfigurationRecorder.RecordingGroupProperty.builder()
                        .allSupported(true)
                        .includeGlobalResourceTypes(true)
                        .build())
                .build();
        this.configurationRecorder.getNode().addDependency(configServiceLinkedRole);

        this.deliveryChannel = CfnDeliveryChannel.Builder.create(this, prefix + "-ConfigDeliveryChannel")
                .name(prefix + "-config-delivery-channel")
                .s3BucketName(this.configBucket.getBucketName())
                .configSnapshotDeliveryProperties(CfnDeliveryChannel.ConfigSnapshotDeliveryPropertiesProperty.builder()
                        .deliveryFrequency("TwentyFour_Hours")
                        .build())
                .build();
        this.deliveryChannel.getNode().addDependency(this.configBucket.getPolicy());
        this.deliveryChannel.getNode().addDependency(this.configurationRecorder);

        cfnOutput(this, "ConfigRecorderName", this.configurationRecorder.getName());
        cfnOutput(this, "ConfigBucketArn", this.configBucket.getBucketArn());

        infof("Created AWS Config recorder %s and delivery channel", this.configurationRecorder.getName());

        // ============================================================================
        // Security Hub standards: CIS AWS Foundations Benchmark v1.2.0 -> v5.0.0
        // ============================================================================
        // Security Hub has no CloudFormation resource that edits a standard subscription in
        // place, so a version swap is disable-the-old, enable-the-new, done through the same
        // idempotent AwsCustomResource pattern ObservabilityStack uses for its CloudTrail log
        // group: both calls target a fixed, known ARN, so onCreate and onUpdate run the same
        // request every deployment, and re-running an already-applied change is a no-op rather
        // than an error.
        String cis120SubscriptionArn = "arn:aws:securityhub:%s:%s:subscription/cis-aws-foundations-benchmark/v/1.2.0"
                .formatted(this.getRegion(), this.getAccount());
        String cisV5StandardArn =
                "arn:aws:securityhub:%s::standards/cis-aws-foundations-benchmark/v/5.0.0".formatted(this.getRegion());
        String fsbpStandardArn = "arn:aws:securityhub:%s::standards/aws-foundational-security-best-practices/v/1.0.0"
                .formatted(this.getRegion());

        // Security Hub has no resource-level permissions for standards subscription management.
        var securityHubStandardsGrant = KindCdk.grantToAwsCustomResourceProvider(
                this,
                List.of(PolicyStatement.Builder.create()
                        .sid("ManageSecurityHubStandards")
                        .actions(List.of("securityhub:BatchEnableStandards", "securityhub:BatchDisableStandards"))
                        .resources(List.of("*"))
                        .build()));

        var disableCis120Call = AwsSdkCall.builder()
                .service("SecurityHub")
                .action("batchDisableStandards")
                .parameters(Map.of("StandardsSubscriptionArns", List.of(cis120SubscriptionArn)))
                .physicalResourceId(PhysicalResourceId.of("cis-1-2-0-standard-disabled"))
                .ignoreErrorCodesMatching("InvalidInputException|ResourceNotFoundException")
                .build();
        AwsCustomResource disableCis120 = AwsCustomResource.Builder.create(this, prefix + "-DisableCis120Standard")
                .onCreate(disableCis120Call)
                .onUpdate(disableCis120Call)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(this))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(this))
                .build();
        disableCis120.getNode().addDependency(securityHubStandardsGrant);

        var enableCisV5Call = AwsSdkCall.builder()
                .service("SecurityHub")
                .action("batchEnableStandards")
                .parameters(Map.of("StandardsSubscriptionRequests", List.of(Map.of("StandardsArn", cisV5StandardArn))))
                .physicalResourceId(PhysicalResourceId.of("cis-5-0-0-standard-enabled"))
                .ignoreErrorCodesMatching("ResourceConflictException")
                .build();
        AwsCustomResource enableCisV5 = AwsCustomResource.Builder.create(this, prefix + "-EnableCisV5Standard")
                .onCreate(enableCisV5Call)
                .onUpdate(enableCisV5Call)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(this))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(this))
                .build();
        enableCisV5.getNode().addDependency(securityHubStandardsGrant);
        // Enable the replacement before disabling the old one, so the account is never left with
        // neither.
        disableCis120.getNode().addDependency(enableCisV5);

        // AWS Foundational Security Best Practices stays enabled. Where it is already subscribed
        // (prod, via ObservabilityStack's earlier enableDefaultStandards), re-enabling the same
        // ARN is a no-op; where it is not (a fresh account whose Hub now has
        // enableDefaultStandards set to false), this is what subscribes it.
        var enableFsbpCall = AwsSdkCall.builder()
                .service("SecurityHub")
                .action("batchEnableStandards")
                .parameters(Map.of("StandardsSubscriptionRequests", List.of(Map.of("StandardsArn", fsbpStandardArn))))
                .physicalResourceId(PhysicalResourceId.of("fsbp-1-0-0-standard-enabled"))
                .ignoreErrorCodesMatching("ResourceConflictException")
                .build();
        AwsCustomResource enableFsbp = AwsCustomResource.Builder.create(this, prefix + "-EnableFsbpStandard")
                .onCreate(enableFsbpCall)
                .onUpdate(enableFsbpCall)
                .logGroup(ensureAwsCustomResourceProviderLogGroup(this))
                .role(KindCdk.ensureAwsCustomResourceProviderRole(this))
                .build();
        enableFsbp.getNode().addDependency(securityHubStandardsGrant);

        infof("Subscribed CIS AWS Foundations Benchmark v5.0.0, kept AWS Foundational Security Best Practices");
    }
}
