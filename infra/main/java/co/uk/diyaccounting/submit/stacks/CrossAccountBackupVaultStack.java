/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.backup.BackupVault;
import software.amazon.awscdk.services.iam.AnyPrincipal;
import software.amazon.awscdk.services.iam.ArnPrincipal;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.kms.Key;
import software.constructs.Construct;

/**
 * The vault in the submit-backup account that receives backup copies from submit-prod and submit-ci.
 *
 * <p>This stack deploys into the backup account itself, not into a deployment account, so it has its
 * own CDK app ({@code SubmitBackupAccount}) rather than sitting in {@code SubmitEnvironment}. The
 * point of a separate account is that losing a deployment account does not lose the backups, which
 * only holds if nothing in a deployment account can reach in and delete them.
 *
 * <p>The vault and its key are the one place {@link RemovalPolicy#RETAIN} is right. Everywhere else
 * in this repository, data survives a teardown because a backup exists; here, the backup is the
 * thing being torn down, so nothing is behind it.
 */
public class CrossAccountBackupVaultStack extends Stack {

    public BackupVault crossAccountVault;
    public Key vaultEncryptionKey;

    @Value.Immutable
    public interface CrossAccountBackupVaultStackProps extends StackProps {

        @Override
        Environment getEnv();

        /** Name of the vault that receives copies, e.g. submit-cross-account-vault. */
        String vaultName();

        /**
         * ARNs of the AWS Backup service roles in the deployment accounts that copy into this vault,
         * e.g. arn:aws:iam::972912397388:role/prod-env-backup-role.
         */
        List<String> sourceBackupRoleArns();

        static ImmutableCrossAccountBackupVaultStackProps.Builder builder() {
            return ImmutableCrossAccountBackupVaultStackProps.builder();
        }
    }

    public CrossAccountBackupVaultStack(Construct scope, String id, CrossAccountBackupVaultStackProps props) {
        super(scope, id, props);

        List<ArnPrincipal> sourceBackupRoles =
                props.sourceBackupRoleArns().stream().map(ArnPrincipal::new).toList();

        // The restore drill runs in submit-ci and restores under this role, the only one of the
        // source backup roles that ever needs to read back out of the vault rather than just copy
        // into it. Copy-in and restore are different access levels, so this stays its own principal
        // rather than folding into sourceBackupRoles.
        String ciRestoreRoleArn = props.sourceBackupRoleArns().stream()
                .filter(arn -> arn.endsWith(":role/ci-env-backup-role"))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "No ci-env-backup-role ARN found in sourceBackupRoleArns; the restore drill "
                                + "has no role to grant read/restore access on the vault to."));
        ArnPrincipal ciRestoreRolePrincipal = new ArnPrincipal(ciRestoreRoleArn);

        // ============================================================================
        // KMS key encrypting recovery points at rest in this account
        // ============================================================================

        this.vaultEncryptionKey = Key.Builder.create(this, "CrossAccountBackupKey")
                .alias("alias/submit-cross-account-backup")
                .enableKeyRotation(true)
                .removalPolicy(RemovalPolicy.RETAIN)
                .pendingWindow(Duration.days(30))
                .description("Encrypts backup copies received from submit-prod and submit-ci")
                .build();

        // A copy job runs under the source account's backup role but writes with this account's key,
        // so that role needs to use the key from outside the account that owns it. CreateGrant is
        // what AWS Backup itself asks for when it hands the copy to the destination vault.
        this.vaultEncryptionKey.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowSourceAccountBackupRolesToEncrypt")
                .effect(Effect.ALLOW)
                .principals(List.copyOf(sourceBackupRoles))
                .actions(List.of(
                        "kms:Encrypt",
                        "kms:Decrypt",
                        "kms:ReEncrypt*",
                        "kms:GenerateDataKey*",
                        "kms:DescribeKey",
                        "kms:CreateGrant"))
                .resources(List.of("*"))
                .build());

        // A restore job runs under the ci restore role and reads recovery points still encrypted
        // under this account's key, so it needs its own decrypt grant on the key, separate from the
        // encrypt-side grant above that every source backup role gets for copying in.
        this.vaultEncryptionKey.addToResourcePolicy(PolicyStatement.Builder.create()
                .sid("AllowCiRestoreRoleToDecrypt")
                .effect(Effect.ALLOW)
                .principals(List.of(ciRestoreRolePrincipal))
                .actions(List.of("kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey", "kms:CreateGrant"))
                .resources(List.of("*"))
                .build());

        // ============================================================================
        // Cross-account vault
        // ============================================================================

        PolicyDocument vaultAccessPolicy = PolicyDocument.Builder.create()
                .statements(List.of(
                        PolicyStatement.Builder.create()
                                .sid("AllowCrossAccountCopy")
                                .effect(Effect.ALLOW)
                                .principals(List.copyOf(sourceBackupRoles))
                                .actions(List.of("backup:CopyIntoBackupVault"))
                                .resources(List.of("*"))
                                .build(),
                        // The restore drill in submit-ci looks up and restores prod's recovery
                        // points from here, so this one role also needs to read the vault's
                        // catalogue and start a restore, on top of the copy-in every source role
                        // gets above.
                        PolicyStatement.Builder.create()
                                .sid("AllowCiRestoreRoleToRestore")
                                .effect(Effect.ALLOW)
                                .principals(List.of(ciRestoreRolePrincipal))
                                .actions(List.of(
                                        "backup:ListRecoveryPointsByBackupVault",
                                        "backup:DescribeRecoveryPoint",
                                        "backup:GetRecoveryPointRestoreMetadata",
                                        "backup:StartRestoreJob"))
                                .resources(List.of("*"))
                                .build(),
                        // Copy-in is the only thing a deployment account may do here. Even an
                        // attacker holding submit-prod credentials cannot delete what has landed.
                        PolicyStatement.Builder.create()
                                .sid("DenyDeleteFromOutsideBackupAccount")
                                .effect(Effect.DENY)
                                .principals(List.of(new AnyPrincipal()))
                                .actions(List.of(
                                        "backup:DeleteBackupVault",
                                        "backup:DeleteBackupVaultAccessPolicy",
                                        "backup:DeleteRecoveryPoint",
                                        "backup:UpdateRecoveryPointLifecycle",
                                        "backup:PutBackupVaultAccessPolicy"))
                                .resources(List.of("*"))
                                .conditions(java.util.Map.of(
                                        "StringNotEquals", java.util.Map.of("aws:PrincipalAccount", this.getAccount())))
                                .build()))
                .build();

        this.crossAccountVault = BackupVault.Builder.create(this, "CrossAccountVault")
                .backupVaultName(props.vaultName())
                .encryptionKey(this.vaultEncryptionKey)
                .accessPolicy(vaultAccessPolicy)
                .removalPolicy(RemovalPolicy.RETAIN)
                .build();

        // ============================================================================
        // Outputs - the source accounts need these to configure their copy actions
        // ============================================================================

        cfnOutput(this, "CrossAccountVaultArn", this.crossAccountVault.getBackupVaultArn());
        cfnOutput(this, "CrossAccountVaultName", this.crossAccountVault.getBackupVaultName());
        cfnOutput(this, "CrossAccountBackupKeyArn", this.vaultEncryptionKey.getKeyArn());

        infof(
                "CrossAccountBackupVaultStack created vault %s accepting copies from %s",
                props.vaultName(), props.sourceBackupRoleArns());
    }
}
