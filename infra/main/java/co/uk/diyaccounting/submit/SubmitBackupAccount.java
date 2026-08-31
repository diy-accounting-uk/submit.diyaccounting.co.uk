/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.Kind.envOr;
import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.stacks.BackupAccountAccessStack;
import co.uk.diyaccounting.submit.stacks.CrossAccountBackupVaultStack;
import co.uk.diyaccounting.submit.utils.KindCdk;
import java.util.Arrays;
import java.util.List;
import software.amazon.awscdk.App;
import software.constructs.Construct;

/**
 * CDK app for the submit-backup account, which holds nothing but the vault that receives backup
 * copies from the deployment accounts.
 *
 * <p>It is a third app alongside {@code SubmitEnvironment} and {@code SubmitApplication} because it
 * deploys into a different account under different credentials. Folding it into either of those
 * would put the backup destination inside a blast radius it exists to sit outside of.
 */
public class SubmitBackupAccount {

    public static final String DEFAULT_VAULT_NAME = "submit-cross-account-vault";
    public static final String DEFAULT_GITHUB_REPOSITORY = "diy-accounting-uk/submit.diyaccounting.co.uk";

    public final CrossAccountBackupVaultStack crossAccountBackupVaultStack;
    public final BackupAccountAccessStack backupAccountAccessStack;

    public static void main(final String[] args) {
        App app = new App();
        new SubmitBackupAccount(app);
        app.synth();
        infof("CDK synth complete");
    }

    public SubmitBackupAccount(App app) {
        var primaryEnv = KindCdk.buildPrimaryEnvironment();

        var vaultName = envOr(
                "CROSS_ACCOUNT_VAULT_NAME",
                KindCdk.getContextValueString(app, "vaultName", DEFAULT_VAULT_NAME),
                "(from vaultName in cdk.json)");

        var sourceBackupRoleArns = readSourceBackupRoleArns(app);
        if (sourceBackupRoleArns.isEmpty()) {
            throw new IllegalStateException("No source backup role ARNs configured. Set SOURCE_BACKUP_ROLE_ARNS or "
                    + "sourceBackupRoleArns in cdk.json to the deployment accounts' backup service roles. A vault "
                    + "nothing can copy into is not worth deploying.");
        }

        this.crossAccountBackupVaultStack = new CrossAccountBackupVaultStack(
                app,
                "backup-CrossAccountBackupVaultStack",
                CrossAccountBackupVaultStack.CrossAccountBackupVaultStackProps.builder()
                        .env(primaryEnv)
                        .vaultName(vaultName)
                        .sourceBackupRoleArns(sourceBackupRoleArns)
                        .build());

        var githubRepository = envOr(
                "GITHUB_REPOSITORY",
                KindCdk.getContextValueString(app, "githubRepository", DEFAULT_GITHUB_REPOSITORY),
                "(from githubRepository in cdk.json)");

        this.backupAccountAccessStack = new BackupAccountAccessStack(
                app,
                "backup-BackupAccountAccessStack",
                BackupAccountAccessStack.BackupAccountAccessStackProps.builder()
                        .env(primaryEnv)
                        .githubRepository(githubRepository)
                        .vaultEncryptionKeyArn(
                                this.crossAccountBackupVaultStack.vaultEncryptionKey.getKeyArn())
                        .build());
        this.backupAccountAccessStack.addDependency(this.crossAccountBackupVaultStack);

        CostAllocationTags.applyTo(app, "backup", "backup");
    }

    /** Reads the comma-separated list of deployment-account backup role ARNs. */
    private static List<String> readSourceBackupRoleArns(Construct scope) {
        var raw = envOr(
                "SOURCE_BACKUP_ROLE_ARNS",
                KindCdk.getContextValueString(scope, "sourceBackupRoleArns", ""),
                "(from sourceBackupRoleArns in cdk.json)");
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(arn -> !arn.isEmpty())
                .toList();
    }
}
