/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.iam.ArnPrincipal;
import software.amazon.awscdk.services.iam.CfnOIDCProvider;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.FederatedPrincipal;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.constructs.Construct;

/**
 * The roles GitHub Actions uses in the backup account, plus the service role AWS Backup uses to
 * restore a recovery point there.
 *
 * <p>Deployment accounts get these from {@code scripts/aws-accounts/bootstrap-account.sh}. The backup
 * account gets them from CDK instead, so the account holds nothing that was created by hand and its
 * whole contents are readable from this repository. The OIDC provider is created here for the same
 * reason, which means {@code bootstrap-account.sh} must not be pointed at the backup account.
 *
 * <p>The workflow assumes {@code backup-github-actions-role} and chains to
 * {@code backup-deployment-role}, matching every other account in the organisation.
 */
public class BackupAccountAccessStack extends Stack {

    public static final String GITHUB_OIDC_HOST = "token.actions.githubusercontent.com";
    public static final String GITHUB_OIDC_THUMBPRINT = "6938fd4d98bab03faadb97b34396831e3780aea1";

    public Role githubActionsRole;
    public Role deploymentRole;
    public Role restoreRole;

    @Value.Immutable
    public interface BackupAccountAccessStackProps extends StackProps {

        @Override
        Environment getEnv();

        /** Repository allowed to assume the actions role, as owner/name. */
        String githubRepository();

        /** ARN of the KMS key encrypting the cross-account vault, needed to read a recovery point. */
        String vaultEncryptionKeyArn();

        static ImmutableBackupAccountAccessStackProps.Builder builder() {
            return ImmutableBackupAccountAccessStackProps.builder();
        }
    }

    public BackupAccountAccessStack(Construct scope, String id, BackupAccountAccessStackProps props) {
        super(scope, id, props);

        // ============================================================================
        // GitHub OIDC provider
        // ============================================================================

        var oidcProvider = CfnOIDCProvider.Builder.create(this, "GitHubOidcProvider")
                .url("https://" + GITHUB_OIDC_HOST)
                .clientIdList(List.of("sts.amazonaws.com"))
                .thumbprintList(List.of(GITHUB_OIDC_THUMBPRINT))
                .build();

        // ============================================================================
        // Role GitHub Actions federates into
        // ============================================================================

        this.githubActionsRole = Role.Builder.create(this, "GitHubActionsRole")
                .roleName("backup-github-actions-role")
                .maxSessionDuration(Duration.hours(2))
                .description("Assumed by GitHub Actions in " + props.githubRepository())
                .assumedBy(new FederatedPrincipal(
                        oidcProvider.getAttrArn(),
                        Map.of(
                                "StringEquals",
                                Map.of(GITHUB_OIDC_HOST + ":aud", "sts.amazonaws.com"),
                                "StringLike",
                                Map.of(GITHUB_OIDC_HOST + ":sub", "repo:" + props.githubRepository() + ":*")),
                        "sts:AssumeRoleWithWebIdentity"))
                .build();

        String deploymentRoleArn = String.format("arn:aws:iam::%s:role/backup-deployment-role", this.getAccount());

        this.githubActionsRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("AssumeDeploymentRole")
                .effect(Effect.ALLOW)
                .actions(List.of("sts:AssumeRole"))
                .resources(List.of(deploymentRoleArn))
                .build());

        // ============================================================================
        // Role that does the work: deploy the vault stack, run a restore test
        // ============================================================================

        this.deploymentRole = Role.Builder.create(this, "DeploymentRole")
                .roleName("backup-deployment-role")
                .maxSessionDuration(Duration.hours(2))
                .description("Deploys the backup account stacks and runs restore tests")
                .assumedBy(new ArnPrincipal(this.githubActionsRole.getRoleArn()))
                .build();

        // CDK does its own work through the bootstrap roles, so the caller only needs to reach them.
        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("AssumeCdkBootstrapRoles")
                .effect(Effect.ALLOW)
                .actions(List.of("sts:AssumeRole"))
                .resources(List.of(String.format("arn:aws:iam::%s:role/cdk-*", this.getAccount())))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadCdkBootstrapVersion")
                .effect(Effect.ALLOW)
                .actions(List.of("ssm:GetParameter", "ssm:GetParameters"))
                .resources(List.of(
                        String.format("arn:aws:ssm:*:%s:parameter/cdk-bootstrap/*", this.getAccount())))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ReadCloudFormationState")
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "cloudformation:DescribeStacks",
                        "cloudformation:DescribeStackEvents",
                        "cloudformation:GetTemplate",
                        "cloudformation:ListStacks"))
                .resources(List.of("*"))
                .build());

        // ============================================================================
        // Restore path
        // ============================================================================

        // AWS Backup restores under a service role handed to it by StartRestoreJob, not under the
        // caller's credentials, so the restore test needs a role to pass as well as the permission.
        this.restoreRole = Role.Builder.create(this, "RestoreRole")
                .roleName("backup-restore-role")
                .description("Used by AWS Backup to restore a recovery point in the backup account")
                .assumedBy(new ServicePrincipal("backup.amazonaws.com"))
                .managedPolicies(List.of(
                        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSBackupServiceRolePolicyForRestores")))
                .build();

        this.restoreRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("DecryptVaultContents")
                .effect(Effect.ALLOW)
                .actions(List.of("kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey", "kms:CreateGrant"))
                .resources(List.of(props.vaultEncryptionKeyArn()))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("RunRestoreTests")
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "backup:DescribeBackupVault",
                        "backup:DescribeRecoveryPoint",
                        "backup:DescribeRestoreJob",
                        "backup:GetRecoveryPointRestoreMetadata",
                        "backup:ListBackupVaults",
                        "backup:ListRecoveryPointsByBackupVault",
                        "backup:ListRestoreJobs",
                        "backup:StartRestoreJob"))
                .resources(List.of("*"))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("PassRestoreRoleToBackup")
                .effect(Effect.ALLOW)
                .actions(List.of("iam:PassRole"))
                .resources(List.of(this.restoreRole.getRoleArn()))
                .conditions(Map.of("StringEquals", Map.of("iam:PassedToService", "backup.amazonaws.com")))
                .build());

        // The restore lands in a table named for the workflow run, and the test deletes it again.
        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("InspectAndCleanUpRestoredTables")
                .effect(Effect.ALLOW)
                .actions(List.of(
                        "dynamodb:DeleteTable",
                        "dynamodb:DescribeTable",
                        "dynamodb:ListTables",
                        "dynamodb:Scan"))
                .resources(List.of("*"))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("PublishRestoreTestMetric")
                .effect(Effect.ALLOW)
                .actions(List.of("cloudwatch:PutMetricData"))
                .resources(List.of("*"))
                .build());

        // ============================================================================
        // Outputs
        // ============================================================================

        cfnOutput(this, "GitHubActionsRoleArn", this.githubActionsRole.getRoleArn());
        cfnOutput(this, "DeploymentRoleArn", this.deploymentRole.getRoleArn());
        cfnOutput(this, "RestoreRoleArn", this.restoreRole.getRoleArn());

        infof(
                "BackupAccountAccessStack created roles for %s in account %s",
                props.githubRepository(), this.getAccount());
    }
}
