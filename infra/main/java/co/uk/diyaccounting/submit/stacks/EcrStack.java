/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureLogGroupWithDependency;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Objects;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.ecr.IRepository;
import software.amazon.awscdk.services.ecr.LifecycleRule;
import software.amazon.awscdk.services.ecr.Repository;
import software.amazon.awscdk.services.ecr.TagMutability;
import software.amazon.awscdk.services.ecr.TagStatus;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.constructs.Construct;

public class EcrStack extends Stack {

    public final IRepository ecrRepository;
    public final ILogGroup ecrLogGroup;
    public final Role ecrPublishRole;

    @Value.Immutable
    public interface EcrStackProps extends StackProps, SubmitStackProps {

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

        static ImmutableEcrStackProps.Builder builder() {
            return ImmutableEcrStackProps.builder();
        }
    }

    public EcrStack(Construct scope, String id, EcrStackProps props) {
        super(
                scope,
                id,
                StackProps.builder()
                        .env(props.getEnv())
                        .crossRegionReferences(props.getCrossRegionReferences())
                        .build());

        infof(
                "Creating EcrStack %s in region: %s",
                id, Objects.requireNonNull(props.getEnv()).getRegion());
        String ecrRepositoryName;
        String ecrLogGroupName;
        String ecrPublishRoleName;
        if (Objects.equals(props.getEnv().getRegion(), "us-east-1")) {
            ecrRepositoryName = props.sharedNames().ue1EcrRepositoryName;
            ecrLogGroupName = props.sharedNames().ue1EcrLogGroupName;
            ecrPublishRoleName = props.sharedNames().ue1EcrPublishRoleName;
        } else {
            ecrRepositoryName = props.sharedNames().ecrRepositoryName;
            ecrLogGroupName = props.sharedNames().ecrLogGroupName;
            ecrPublishRoleName = props.sharedNames().ecrPublishRoleName;
        }

        // ECR Repository with lifecycle rules
        this.ecrRepository = Repository.Builder.create(this, props.resourceNamePrefix() + "-EcrRepository")
                .repositoryName(ecrRepositoryName)
                .imageScanOnPush(true) // Enable vulnerability scanning
                .imageTagMutability(TagMutability.MUTABLE)
                .lifecycleRules(List.of(
                        // Remove untagged images after 1 day
                        LifecycleRule.builder()
                                .description("Remove untagged images after 1 day")
                                .tagStatus(TagStatus.UNTAGGED)
                                .maxImageAge(Duration.days(1))
                                .build()))
                .emptyOnDelete(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        // CloudWatch Log Group for ECR operations (idempotent creation)
        this.ecrLogGroup = ensureLogGroupWithDependency(
                        this, props.resourceNamePrefix() + "-EcrLogGroup", ecrLogGroupName)
                .logGroup();

        // IAM Role for ECR publishing with comprehensive permissions
        this.ecrPublishRole = Role.Builder.create(this, props.resourceNamePrefix() + "-EcrPublishRole")
                .roleName(ecrPublishRoleName)
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .inlinePolicies(java.util.Map.of(
                        "EcrPublishPolicy",
                        PolicyDocument.Builder.create()
                                .statements(List.of(
                                        // ECR repository permissions
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:GetAuthorizationToken",
                                                        "ecr:BatchCheckLayerAvailability",
                                                        "ecr:GetDownloadUrlForLayer",
                                                        "ecr:BatchGetImage",
                                                        "ecr:InitiateLayerUpload",
                                                        "ecr:UploadLayerPart",
                                                        "ecr:CompleteLayerUpload",
                                                        "ecr:PutImage",
                                                        "ecr:ListImages",
                                                        "ecr:DescribeImages",
                                                        "ecr:DescribeRepositories"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build(),
                                        // CloudWatch Logs permissions for verbose logging
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "logs:CreateLogStream",
                                                        "logs:PutLogEvents",
                                                        "logs:DescribeLogGroups",
                                                        "logs:DescribeLogStreams"))
                                                .resources(List.of(this.ecrLogGroup.getLogGroupArn() + "*"))
                                                .build(),
                                        // Additional ECR permissions for scanning and lifecycle
                                        PolicyStatement.Builder.create()
                                                .effect(Effect.ALLOW)
                                                .actions(List.of(
                                                        "ecr:DescribeImageScanFindings",
                                                        "ecr:StartImageScan",
                                                        "ecr:GetLifecyclePolicy",
                                                        "ecr:GetLifecyclePolicyPreview"))
                                                .resources(List.of(this.ecrRepository.getRepositoryArn()))
                                                .build()))
                                .build()))
                .build();

        // Output key information
        cfnOutput(this, "EcrRepositoryArn", this.ecrRepository.getRepositoryArn());
        cfnOutput(this, "EcrRepositoryUri", this.ecrRepository.getRepositoryUri());
        cfnOutput(this, "EcrLogGroupArn", this.ecrLogGroup.getLogGroupArn());
        cfnOutput(this, "EcrPublishRoleArn", this.ecrPublishRole.getRoleArn());

        infof("EcrStack %s created successfully", this.getNode().getId());
    }
}
