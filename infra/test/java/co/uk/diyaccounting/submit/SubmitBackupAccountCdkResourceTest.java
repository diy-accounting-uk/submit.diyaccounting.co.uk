/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertThrows;

import co.uk.diyaccounting.submit.stacks.BackupAccountAccessStack;
import co.uk.diyaccounting.submit.stacks.CrossAccountBackupVaultStack;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Template;

class SubmitBackupAccountCdkResourceTest {

    private static final String PROD_BACKUP_ROLE = "arn:aws:iam::972912397388:role/prod-env-backup-role";
    private static final String CI_BACKUP_ROLE = "arn:aws:iam::367191799875:role/ci-env-backup-role";

    private static Template synthVaultStack() {
        App app = new App();
        var stack = new CrossAccountBackupVaultStack(
                app,
                "backup-CrossAccountBackupVaultStack",
                CrossAccountBackupVaultStack.CrossAccountBackupVaultStackProps.builder()
                        .env(Environment.builder()
                                .account("914216784828")
                                .region("eu-west-2")
                                .build())
                        .vaultName("submit-cross-account-vault")
                        .sourceBackupRoleArns(List.of(PROD_BACKUP_ROLE, CI_BACKUP_ROLE))
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void vaultIsEncryptedAndSurvivesStackDeletion() {
        Template template = synthVaultStack();

        template.resourceCountIs("AWS::Backup::BackupVault", 1);
        template.resourceCountIs("AWS::KMS::Key", 1);

        // The vault is the last copy of the data, so nothing stands behind it if a teardown
        // removes it. This is the one place RETAIN is the right removal policy.
        template.hasResource("AWS::Backup::BackupVault", Map.of("DeletionPolicy", "Retain"));
        template.hasResource("AWS::KMS::Key", Map.of("DeletionPolicy", "Retain"));

        template.hasResourceProperties(
                "AWS::KMS::Key", Match.objectLike(Map.of("EnableKeyRotation", true)));
    }

    @Test
    void deploymentAccountsMayCopyInButNotDelete() {
        Template template = synthVaultStack();

        template.hasResourceProperties(
                "AWS::Backup::BackupVault",
                Match.objectLike(Map.of(
                        "BackupVaultName",
                        "submit-cross-account-vault",
                        "AccessPolicy",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(
                                        Match.objectLike(Map.of(
                                                "Sid", "AllowCrossAccountCopy",
                                                "Effect", "Allow",
                                                "Action", "backup:CopyIntoBackupVault")),
                                        Match.objectLike(Map.of(
                                                "Sid", "DenyDeleteFromOutsideBackupAccount",
                                                "Effect", "Deny")))))))));
    }

    private static Template synthAccessStack() {
        App app = new App();
        var stack = new BackupAccountAccessStack(
                app,
                "backup-BackupAccountAccessStack",
                BackupAccountAccessStack.BackupAccountAccessStackProps.builder()
                        .env(Environment.builder()
                                .account("914216784828")
                                .region("eu-west-2")
                                .build())
                        .githubRepository("diy-accounting-uk/submit.diyaccounting.co.uk")
                        .vaultEncryptionKeyArn(
                                "arn:aws:kms:eu-west-2:914216784828:key/12345678-1234-1234-1234-123456789012")
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void onlyTheSubmitRepositoryCanFederateIntoTheBackupAccount() {
        Template template = synthAccessStack();

        template.hasResourceProperties(
                "AWS::IAM::Role",
                Match.objectLike(Map.of(
                        "RoleName",
                        "backup-github-actions-role",
                        "AssumeRolePolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Action",
                                        "sts:AssumeRoleWithWebIdentity",
                                        "Condition",
                                        Map.of(
                                                "StringEquals",
                                                        Map.of(
                                                                "token.actions.githubusercontent.com:aud",
                                                                "sts.amazonaws.com"),
                                                "StringLike",
                                                        Map.of(
                                                                "token.actions.githubusercontent.com:sub",
                                                                "repo:diy-accounting-uk/submit.diyaccounting.co.uk:*")))))))))));
    }

    @Test
    void awsBackupHasARoleToRestoreUnder() {
        Template template = synthAccessStack();

        template.hasResourceProperties(
                "AWS::IAM::Role",
                Match.objectLike(Map.of(
                        "RoleName",
                        "backup-restore-role",
                        "AssumeRolePolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                        "Principal", Map.of("Service", "backup.amazonaws.com"))))))))));
    }

    @Test
    void aVaultNothingCanCopyIntoIsRefused() {
        App app = new App();
        assertThrows(IllegalStateException.class, () -> new SubmitBackupAccount(app));
    }
}
