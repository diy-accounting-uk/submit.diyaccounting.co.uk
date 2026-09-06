// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// TypeScript port of infra/main/java/co/uk/diyaccounting/submit/stacks/CrossAccountBackupVaultStack.java
// for the backlog-33a spike. Kept line-for-line close to the Java original so the template diff
// isolates language differences rather than design differences.

import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { BackupVault } from "aws-cdk-lib/aws-backup";
import { AnyPrincipal, ArnPrincipal, Effect, PolicyDocument, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { Construct } from "constructs";

export interface CrossAccountBackupVaultStackProps extends StackProps {
  /** Name of the vault that receives copies, e.g. submit-cross-account-vault. */
  readonly vaultName: string;

  /**
   * ARNs of the AWS Backup service roles in the deployment accounts that copy into this vault,
   * e.g. arn:aws:iam::972912397388:role/prod-env-backup-role.
   */
  readonly sourceBackupRoleArns: string[];
}

/**
 * The vault in the submit-backup account that receives backup copies from submit-prod and submit-ci.
 *
 * This stack deploys into the backup account itself, not into a deployment account, so it has its
 * own CDK app rather than sitting in SubmitEnvironment. The point of a separate account is that
 * losing a deployment account does not lose the backups, which only holds if nothing in a
 * deployment account can reach in and delete them.
 *
 * The vault and its key are the one place RemovalPolicy.RETAIN is right. Everywhere else in this
 * repository, data survives a teardown because a backup exists; here, the backup is the thing
 * being torn down, so nothing is behind it.
 */
export class CrossAccountBackupVaultStack extends Stack {
  public readonly crossAccountVault: BackupVault;
  public readonly vaultEncryptionKey: Key;

  constructor(scope: Construct, id: string, props: CrossAccountBackupVaultStackProps) {
    super(scope, id, props);

    const sourceBackupRoles = props.sourceBackupRoleArns.map((arn) => new ArnPrincipal(arn));

    // ============================================================================
    // KMS key encrypting recovery points at rest in this account
    // ============================================================================

    this.vaultEncryptionKey = new Key(this, "CrossAccountBackupKey", {
      alias: "alias/submit-cross-account-backup",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
      pendingWindow: Duration.days(30),
      description: "Encrypts backup copies received from submit-prod and submit-ci",
    });

    // A copy job runs under the source account's backup role but writes with this account's key,
    // so that role needs to use the key from outside the account that owns it. CreateGrant is
    // what AWS Backup itself asks for when it hands the copy to the destination vault.
    this.vaultEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: "AllowSourceAccountBackupRolesToEncrypt",
        effect: Effect.ALLOW,
        principals: sourceBackupRoles,
        actions: [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
          "kms:CreateGrant",
        ],
        resources: ["*"],
      }),
    );

    // ============================================================================
    // Cross-account vault
    // ============================================================================

    const vaultAccessPolicy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          sid: "AllowCrossAccountCopy",
          effect: Effect.ALLOW,
          principals: sourceBackupRoles,
          actions: ["backup:CopyIntoBackupVault"],
          resources: ["*"],
        }),
        // Copy-in is the only thing a deployment account may do here. Even an attacker holding
        // submit-prod credentials cannot delete what has landed.
        new PolicyStatement({
          sid: "DenyDeleteFromOutsideBackupAccount",
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: [
            "backup:DeleteBackupVault",
            "backup:DeleteBackupVaultAccessPolicy",
            "backup:DeleteRecoveryPoint",
            "backup:UpdateRecoveryPointLifecycle",
            "backup:PutBackupVaultAccessPolicy",
          ],
          resources: ["*"],
          conditions: {
            StringNotEquals: { "aws:PrincipalAccount": this.account },
          },
        }),
      ],
    });

    this.crossAccountVault = new BackupVault(this, "CrossAccountVault", {
      backupVaultName: props.vaultName,
      encryptionKey: this.vaultEncryptionKey,
      accessPolicy: vaultAccessPolicy,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ============================================================================
    // Outputs - the source accounts need these to configure their copy actions
    // ============================================================================

    new CfnOutput(this, "CrossAccountVaultArn", { value: this.crossAccountVault.backupVaultArn });
    new CfnOutput(this, "CrossAccountVaultName", { value: this.crossAccountVault.backupVaultName });
    new CfnOutput(this, "CrossAccountBackupKeyArn", { value: this.vaultEncryptionKey.keyArn });
  }
}
