/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
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
 * {@code backup-deployment-role} also drives the restore drill's copy-back leg: it calls
 * {@code StartCopyJob} and passes {@code backup-copy-role}, the service role that reads this
 * account's vault and writes into ci's, since AWS Backup requires the copy to start from the
 * account that owns the source vault.
 */
public class BackupAccountAccessStack extends Stack {

    public static final String GITHUB_OIDC_HOST = "token.actions.githubusercontent.com";
    public static final String GITHUB_OIDC_THUMBPRINT = "6938fd4d98bab03faadb97b34396831e3780aea1";

    /**
     * ci's account, region and primary vault. AWS Backup resolves {@code SourceBackupVaultName}
     * against the calling account, so a copy job whose source is this account's own vault must be
     * started from here, with the destination named as a full ARN in ci.
     */
    private static final String CI_ACCOUNT_ID = "367191799875";

    private static final String CI_REGION = "eu-west-2";

    private static final String CI_PRIMARY_VAULT_ARN =
            "arn:aws:backup:" + CI_REGION + ":" + CI_ACCOUNT_ID + ":backup-vault:ci-env-primary-vault";

    public Role githubActionsRole;
    public Role deploymentRole;
    public Role restoreRole;
    public Role copyRole;

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
                .resources(List.of(String.format("arn:aws:ssm:*:%s:parameter/cdk-bootstrap/*", this.getAccount())))
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

        // ============================================================================
        // Copy-back path: the restore drill's source vault lives here, so the copy that
        // rebuilds a recovery point in ci has to start from this account
        // ============================================================================

        // AWS Backup resolves StartCopyJob's SourceBackupVaultName against the caller's own
        // account - a name cannot reach into another account's vault - so the source vault for
        // this copy (submit-cross-account-vault) has to be read by a role that lives here, not by
        // ci's deployment role. This mirrors restoreRole above: a service role AWS Backup assumes
        // to do the work, passed as --iam-role-arn, distinct from the deploymentRole that calls
        // the API.
        this.copyRole = Role.Builder.create(this, "CopyRole")
                .roleName("backup-copy-role")
                .description("Used by AWS Backup to copy a recovery point from this account's vault into ci's")
                .assumedBy(new ServicePrincipal("backup.amazonaws.com"))
                .build();

        this.copyRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("CopyFromCrossAccountVault")
                .effect(Effect.ALLOW)
                .actions(List.of("backup:CopyFromBackupVault"))
                .resources(List.of(String.format(
                        "arn:aws:backup:%s:%s:recovery-point:*", this.getRegion(), this.getAccount())))
                .build());

        this.copyRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("CopyIntoCiVault")
                .effect(Effect.ALLOW)
                .actions(List.of("backup:CopyIntoBackupVault"))
                .resources(List.of(CI_PRIMARY_VAULT_ARN))
                .build());

        // Reads the recovery point out of this account's own vault, still encrypted under
        // vaultEncryptionKeyArn - the same key restoreRole decrypts above, for the same reason.
        this.copyRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("DecryptSourceVaultForCopy")
                .effect(Effect.ALLOW)
                .actions(List.of("kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey", "kms:CreateGrant"))
                .resources(List.of(props.vaultEncryptionKeyArn()))
                .build());

        // Re-encrypts the copy under ci's own backup key once it lands there. The key is created
        // by ci's BackupStack and its id is not known here, so this names every key in ci's
        // account and region rather than "*" everywhere - the same trade
        // CrossAccountBackupVaultStack's own AllowSourceAccountBackupRolesToEncrypt makes for the
        // reverse direction. ci's key resource policy is the grant that actually narrows this to
        // the one key that exists.
        this.copyRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("EncryptIntoCiVaultKey")
                .effect(Effect.ALLOW)
                .actions(List.of("kms:Encrypt", "kms:GenerateDataKey*", "kms:DescribeKey", "kms:CreateGrant"))
                .resources(List.of(String.format("arn:aws:kms:%s:%s:key/*", CI_REGION, CI_ACCOUNT_ID)))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("StartCopyJobFromCrossAccountVault")
                .effect(Effect.ALLOW)
                .actions(List.of("backup:StartCopyJob"))
                .resources(List.of(String.format(
                        "arn:aws:backup:%s:%s:recovery-point:*", this.getRegion(), this.getAccount())))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("PollCopyJobsForRestoreDrill")
                .effect(Effect.ALLOW)
                .actions(List.of("backup:DescribeCopyJob", "backup:ListCopyJobs"))
                .resources(List.of("*"))
                .build());

        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("PassCopyRoleToBackup")
                .effect(Effect.ALLOW)
                .actions(List.of("iam:PassRole"))
                .resources(List.of(this.copyRole.getRoleArn()))
                .conditions(Map.of("StringEquals", Map.of("iam:PassedToService", "backup.amazonaws.com")))
                .build());

        // ListTables has no resource-level permissions in DynamoDB's action reference, so it stays
        // on "*"; the restore test only ever needs it to sanity-check a run, not to enumerate tables.
        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("ListTablesInBackupAccount")
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:ListTables"))
                .resources(List.of("*"))
                .build());

        // The restore lands in a table named for the workflow run and the test deletes it again;
        // every such table carries the "-restoretest-" marker, so the role reaches no other table.
        this.deploymentRole.addToPolicy(PolicyStatement.Builder.create()
                .sid("InspectAndCleanUpRestoredTables")
                .effect(Effect.ALLOW)
                .actions(List.of("dynamodb:DeleteTable", "dynamodb:DescribeTable", "dynamodb:Scan"))
                .resources(List.of(String.format("arn:aws:dynamodb:*:%s:table/*-restoretest-*", this.getAccount())))
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
        cfnOutput(this, "CopyRoleArn", this.copyRole.getRoleArn());

        infof(
                "BackupAccountAccessStack created roles for %s in account %s",
                props.githubRepository(), this.getAccount());
    }
}
