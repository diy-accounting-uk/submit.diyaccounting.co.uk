/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.stacks.BackupStack;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Matcher;
import software.amazon.awscdk.assertions.Template;

class BackupStackCdkResourceTest {

    private static final String CROSS_ACCOUNT_VAULT_ARN =
            "arn:aws:backup:eu-west-2:914216784828:backup-vault:submit-cross-account-vault";

    private static Template synthBackupStack(Optional<String> crossAccountVaultArn) {
        App app = new App();
        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = "prod";
        nameProps.deploymentName = "prod";
        nameProps.hostedZoneName = "diyaccounting.co.uk";
        nameProps.subDomainName = "submit";
        nameProps.regionName = "eu-west-2";
        nameProps.awsAccount = "972912397388";
        var sharedNames = new SubmitSharedNames(nameProps);

        var stack = new BackupStack(
                app,
                sharedNames.backupStackId,
                BackupStack.BackupStackProps.builder()
                        .env(Environment.builder()
                                .account("972912397388")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("prod")
                        .deploymentName("prod")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .crossAccountBackupVaultArn(crossAccountVaultArn)
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void dailyAndMonthlyRecoveryPointsAreCopiedToTheBackupAccount() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        template.hasResourceProperties(
                "AWS::Backup::BackupPlan",
                Match.objectLike(
                        Map.of(
                                "BackupPlan",
                                Match.objectLike(
                                        Map.of(
                                                "BackupPlanRule",
                                                Match.arrayWith(
                                                        List.of(
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "RuleName",
                                                                                "DailyBackup",
                                                                                "CopyActions",
                                                                                Match.arrayWith(
                                                                                        List.of(
                                                                                                Match.objectLike(
                                                                                                        Map.of(
                                                                                                                "DestinationBackupVaultArn",
                                                                                                                CROSS_ACCOUNT_VAULT_ARN)))))),
                                                                Match.objectLike(
                                                                        Map.of(
                                                                                "RuleName",
                                                                                "MonthlyCompliance",
                                                                                "CopyActions",
                                                                                Match.arrayWith(
                                                                                        List.of(
                                                                                                Match.objectLike(
                                                                                                        Map.of(
                                                                                                                "DestinationBackupVaultArn",
                                                                                                                CROSS_ACCOUNT_VAULT_ARN)))))))))))));
    }

    @Test
    void theBackupRoleCanCopyIntoTheBackupAccountAndUseItsKey() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid",
                                                        "CopyRecoveryPointsToBackupAccount",
                                                        "Action",
                                                        List.of(
                                                                "backup:CopyFromBackupVault",
                                                                "backup:CopyIntoBackupVault"))),
                                        Match.objectLike(
                                                Map.of(
                                                        "Sid",
                                                        "UseBackupAccountKeyForCopies",
                                                        "Resource",
                                                        "arn:aws:kms:eu-west-2:914216784828:key/*")))))))));
    }

    @Test
    void withoutADestinationVaultNothingIsCopiedOut() {
        Template template = synthBackupStack(Optional.empty());

        template.hasResourceProperties(
                "AWS::Backup::BackupPlan",
                Match.objectLike(Map.of(
                        "BackupPlan",
                        Match.objectLike(Map.of(
                                "BackupPlanRule",
                                Match.arrayWith(List.of(
                                        Match.objectLike(
                                                Map.of("RuleName", "DailyBackup", "CopyActions", Match.absent())),
                                        Match.objectLike(
                                                Map.of(
                                                        "RuleName",
                                                        "MonthlyCompliance",
                                                        "CopyActions",
                                                        Match.absent())))))))));
    }

    @Test
    void everyCriticalTableAndBothTheBooksAndDiyaGlBucketsAreSelected() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        var selections = template.findResources("AWS::Backup::BackupSelection");
        assertEquals(1, selections.size());

        template.hasResourceProperties(
                "AWS::Backup::BackupSelection",
                Match.objectLike(Map.of(
                        "BackupSelection",
                        Match.objectLike(Map.of(
                                "SelectionName",
                                "prod-env-critical-tables",
                                "Resources",
                                Match.arrayWith(List.of(
                                        selectedTable("prod-env-receipts"),
                                        selectedTable("prod-env-bundles"),
                                        selectedTable("prod-env-hmrc-api-requests"),
                                        selectedTable("prod-env-passes"),
                                        selectedTable("prod-env-subscriptions"),
                                        // Both buckets are in the selection at once - the old
                                        // one keeps its backups until PLAN_DIYA_GL_NAMING.md's
                                        // copy sequence moves the DIYA-GL Lambdas over and
                                        // removes it.
                                        "arn:aws:s3:::prod-env-books-972912397388",
                                        "arn:aws:s3:::prod-env-diya-gl-972912397388")))))));
    }

    private static Matcher selectedTable(String tableName) {
        return Match.objectLike(
                Map.of("Fn::Join", Match.arrayWith(List.of(Match.arrayWith(List.of(":table/" + tableName))))));
    }

    private static final String RESTORE_DRILL_COPY_ROLE_ARN = "arn:aws:iam::914216784828:role/backup-copy-role";

    /**
     * An {@link software.amazon.awscdk.services.iam.AccountPrincipal}'s ARN always carries the
     * partition as a token (stack.partition, not a literal), so CDK renders it as an Fn::Join
     * rather than a plain string even for a literal account id - the same reason selectedTable()
     * above matches inside an Fn::Join for a table ARN.
     */
    private static Matcher accountRootPrincipal(String accountId) {
        return Match.objectLike(
                Map.of("Fn::Join", Match.arrayWith(List.of(Match.arrayWith(List.of(":iam::" + accountId + ":root"))))));
    }

    private static Template synthCiBackupStack() {
        App app = new App();
        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = "ci";
        nameProps.deploymentName = "ci";
        nameProps.hostedZoneName = "diyaccounting.co.uk";
        nameProps.subDomainName = "submit";
        nameProps.regionName = "eu-west-2";
        nameProps.awsAccount = "367191799875";
        var sharedNames = new SubmitSharedNames(nameProps);

        var stack = new BackupStack(
                app,
                sharedNames.backupStackId,
                BackupStack.BackupStackProps.builder()
                        .env(Environment.builder()
                                .account("367191799875")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("ci")
                        .deploymentName("ci")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .crossAccountBackupVaultArn(Optional.of(CROSS_ACCOUNT_VAULT_ARN))
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void ciGrantsTheBackupAccountCopyRoleIntoItsOwnVaultAndKey() {
        Template template = synthCiBackupStack();

        Matcher copyInStatement = Match.objectLike(Map.of(
                "Sid",
                "AllowBackupAccountCopyRoleToCopyIn",
                "Effect",
                "Allow",
                "Principal",
                Map.of("AWS", accountRootPrincipal("914216784828")),
                "Action",
                "backup:CopyIntoBackupVault",
                "Condition",
                Map.of("ArnEquals", Map.of("aws:PrincipalArn", RESTORE_DRILL_COPY_ROLE_ARN))));
        template.hasResourceProperties(
                "AWS::Backup::BackupVault",
                Match.objectLike(Map.of(
                        "BackupVaultName",
                        "ci-env-primary-vault",
                        "AccessPolicy",
                        Match.objectLike(
                                Map.of("Statement", Match.arrayWith(List.of(copyInStatement)))))));

        Matcher encryptStatement = Match.objectLike(Map.of(
                "Sid",
                "AllowBackupAccountCopyRoleToEncrypt",
                "Effect",
                "Allow",
                "Principal",
                Map.of("AWS", accountRootPrincipal("914216784828")),
                "Action",
                List.of("kms:Encrypt", "kms:GenerateDataKey*", "kms:DescribeKey", "kms:CreateGrant"),
                "Condition",
                Map.of("ArnEquals", Map.of("aws:PrincipalArn", RESTORE_DRILL_COPY_ROLE_ARN))));
        template.hasResourceProperties(
                "AWS::KMS::Key",
                Match.objectLike(Map.of(
                        "KeyPolicy",
                        Match.objectLike(
                                Map.of("Statement", Match.arrayWith(List.of(encryptStatement)))))));
    }

    @Test
    void prodGrantsTheBackupAccountCopyRoleNothing() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        template.hasResourceProperties(
                "AWS::Backup::BackupVault",
                Match.objectLike(Map.of("BackupVaultName", "prod-env-primary-vault")));
        template.resourcePropertiesCountIs(
                "AWS::Backup::BackupVault",
                Match.objectLike(Map.of("AccessPolicy", Match.anyValue())),
                0);
    }
}
